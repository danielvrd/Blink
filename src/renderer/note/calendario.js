/**
 * Calendario do historico diario do Fast Note.
 *
 * Substitui o <input type="date"> do Chromium pelo mesmo motivo que o
 * seletor.js substitui o <select>: o popup de calendario nativo nao e
 * estilizavel, e este app e sempre escuro.
 *
 *   Fechado  icone + a data escolhida + seta
 *   Aberto   mes/ano com setas para navegar, um atalho "Hoje" e a grade
 *            dos dias do mes - os que tem topico ganham uma bolinha
 *
 * Clicar num dia valido escolhe a data e fecha. Dias fora do mes exibido so
 * preenchem o alinhamento (nao sao clicaveis); dias depois de hoje tambem
 * nao sao clicaveis - e um diario, nao faz sentido registrar o futuro.
 *
 * Teclado: Esc fecha so o painel, sem fechar a janela. Clicar fora fecha.
 */

window.Blink = window.Blink || {};

(function () {
  const { el, limpar, svg } = window.Blink.ui;

  const ICONE =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke-width="1.6"></rect>' +
    '<path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke-width="1.6" stroke-linecap="round"></path>' +
    '</svg>';

  const SETA =
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">' +
    '<path d="M1.5 3.5 L5 7 L8.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"' +
    ' stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  const SETA_ESQUERDA =
    '<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">' +
    '<path d="M6.5 1.5 L3 5 L6.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"' +
    ' stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  const SETA_DIREITA =
    '<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">' +
    '<path d="M3.5 1.5 L7 5 L3.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"' +
    ' stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  /** A data de hoje, "AAAA-MM-DD" - mesmo formato usado no arquivo. */
  function dataDeHoje() {
    const agora = new Date();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${agora.getFullYear()}-${mes}-${dia}`;
  }

  /** "AAAA-MM-DD" -> { ano, mes (0-11), dia }. */
  function partes(data) {
    const [ano, mes, dia] = data.split('-').map(Number);
    return { ano, mes: mes - 1, dia };
  }

  function paraData(ano, mes, dia) {
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  /** "DD/MM" - com o ano junto se for diferente do ano de hoje. */
  function formatarCurto(data) {
    if (!data) return '';
    const { ano, mes, dia } = partes(data);
    const curto = `${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}`;
    return ano === partes(dataDeHoje()).ano ? curto : `${curto}/${ano}`;
  }

  /**
   * Monta o calendario dentro de `raiz`.
   *
   *   aoEscolher(data)  o usuario escolheu um dia valido, "AAAA-MM-DD"
   *   aoAbrir()         o painel vai abrir - para fechar o que estiver aberto
   *
   * Devolve { definir, fechar, estaAberto, focar }.
   */
  function criar(raiz, { aoEscolher, aoAbrir }) {
    let atual = dataDeHoje();
    let datas = [];
    let exibido = partes(atual); // { ano, mes } do mes mostrado na grade
    let aberto = false;

    const texto = el('span', { class: 'calendario-texto' });

    const botao = el('button', {
      class: 'calendario-botao',
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      title: 'Escolher o dia',
    });
    window.Blink.ui.anexar(botao, [svg(ICONE), texto, svg(SETA)]);

    const rotuloMes = el('span', { class: 'calendario-mes' });
    const botaoAnterior = el('button', {
      class: 'calendario-nav',
      type: 'button',
      title: 'Mês anterior',
      'aria-label': 'Mês anterior',
      onclick: () => mudarMes(-1),
    });
    botaoAnterior.appendChild(svg(SETA_ESQUERDA));
    const botaoSeguinte = el('button', {
      class: 'calendario-nav',
      type: 'button',
      title: 'Próximo mês',
      'aria-label': 'Próximo mês',
      onclick: () => mudarMes(1),
    });
    botaoSeguinte.appendChild(svg(SETA_DIREITA));

    const botaoHoje = el('button', {
      class: 'calendario-hoje',
      type: 'button',
      texto: 'Hoje',
      onclick: () => escolher(dataDeHoje()),
    });

    const cabecalhoMes = el('div', { class: 'calendario-cabecalho' }, [botaoAnterior, rotuloMes, botaoSeguinte]);

    const semana = el(
      'div',
      { class: 'calendario-semana' },
      DIAS_SEMANA.map((d) => el('span', { texto: d }))
    );

    const grade = el('div', { class: 'calendario-grade' });

    const painel = el('div', { class: 'calendario-painel', role: 'dialog', hidden: true }, [
      cabecalhoMes,
      semana,
      grade,
      botaoHoje,
    ]);

    window.Blink.ui.anexar(raiz, [botao, painel]);

    function desenharBotao() {
      texto.textContent = formatarCurto(atual);
    }

    /** Quantos dias tem o mes (0 = ultimo dia do mes anterior a mes+1). */
    function diasDoMes(ano, mes) {
      return new Date(ano, mes + 1, 0).getDate();
    }

    function desenharGrade() {
      limpar(grade);
      rotuloMes.textContent = `${MESES[exibido.mes]} de ${exibido.ano}`;

      const hoje = dataDeHoje();
      const primeiroDiaSemana = new Date(exibido.ano, exibido.mes, 1).getDay();
      const total = diasDoMes(exibido.ano, exibido.mes);

      for (let i = 0; i < primeiroDiaSemana; i++) {
        grade.appendChild(el('span', { class: 'calendario-dia fora-do-mes' }));
      }

      for (let dia = 1; dia <= total; dia++) {
        const data = paraData(exibido.ano, exibido.mes, dia);
        const futuro = data > hoje;
        const classes = ['calendario-dia'];
        if (data === hoje) classes.push('hoje');
        if (data === atual) classes.push('selecionado');
        if (datas.includes(data)) classes.push('tem-topicos');
        if (futuro) classes.push('futuro');

        grade.appendChild(
          el('button', {
            class: classes.join(' '),
            type: 'button',
            disabled: futuro,
            texto: String(dia),
            onclick: () => escolher(data),
          })
        );
      }
    }

    function mudarMes(passo) {
      let mes = exibido.mes + passo;
      let ano = exibido.ano;
      if (mes < 0) { mes = 11; ano--; }
      else if (mes > 11) { mes = 0; ano++; }
      exibido = { ano, mes };
      desenharGrade();
    }

    function abrir() {
      if (aberto) return;
      if (aoAbrir) aoAbrir();
      aberto = true;
      exibido = partes(atual);
      desenharGrade();
      painel.hidden = false;
      botao.setAttribute('aria-expanded', 'true');
      raiz.classList.add('aberto');
    }

    function fechar() {
      if (!aberto) return;
      aberto = false;
      painel.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      raiz.classList.remove('aberto');
    }

    function escolher(data) {
      fechar();
      botao.focus();
      if (data !== atual) aoEscolher(data);
    }

    botao.addEventListener('click', () => (aberto ? fechar() : abrir()));

    painel.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      // Sem o stopPropagation o Esc chegaria na janela e fecharia o Fast
      // Note inteiro, em vez de so fechar o calendario.
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
    });

    // Clicar em qualquer lugar fora do calendario fecha o painel.
    document.addEventListener('mousedown', (evento) => {
      if (aberto && !raiz.contains(evento.target)) fechar();
    });

    /**
     * Atualiza o que o calendario mostra.
     *
     *   atual  a data selecionada, "AAAA-MM-DD"
     *   datas  as datas (do mesmo formato) que tem pelo menos um topico
     */
    function definir(dados) {
      const mudouDeArquivo = dados.atual !== atual;
      atual = dados.atual || dataDeHoje();
      datas = dados.datas || [];
      if (mudouDeArquivo || !aberto) exibido = partes(atual);
      desenharBotao();
      if (aberto) desenharGrade();
    }

    return {
      definir,
      abrir,
      fechar,
      estaAberto: () => aberto,
      focar: () => botao.focus(),
    };
  }

  window.Blink.calendario = { criar };
})();
