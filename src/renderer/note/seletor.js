/**
 * Seletor de arquivos do Fast Note, com a estrela do arquivo principal, o
 * relogio do historico diario, o cadeado dos arquivos privados e a folha dos
 * arquivos em folha livre.
 *
 * Substitui o <select> do Windows porque ele nao aceita nada clicavel
 * dentro da lista - e cada item precisa dos seus icones. Por fora continua
 * parecido com o campo de antes: o nome do arquivo e uma seta.
 *
 *   Fechado  nome do arquivo aberto + estrela amarela se ele for o
 *            principal + relogio verde se tiver o historico ligado +
 *            cadeado se for privado + folha se for folha livre + seta
 *   Aberto   lista com todos os arquivos, cada um com sua folha, seu
 *            cadeado, seu relogio e sua estrela (o task.md nao tem folha,
 *            cadeado nem relogio), e "+ Criar nova nota" no fim. Folha,
 *            cadeado e relogio nao andam juntos: um arquivo com um deles
 *            nao pode ter outro
 *
 * Clicar no nome escolhe o arquivo. Clicar na estrela ou no relogio marca
 * (ou desmarca) sem fechar a lista nem trocar de arquivo.
 *
 * Teclado: fechado, Enter / Espaco / seta para baixo abrem; aberto, as
 * setas andam, Enter escolhe e Esc fecha - sem fechar a janela.
 */

window.Blink = window.Blink || {};

(function () {
  const { el, limpar, svg } = window.Blink.ui;

  const ESTRELA =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.1l-5.62 2.95 1.07-6.27L2.9 9.4l6.3-.9z"' +
    ' stroke-width="1.6" stroke-linejoin="round"></path></svg>';

  const RELOGIO =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" fill="none" stroke-width="1.8"></circle>' +
    '<path d="M12 7v5.5l4 2.3" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '</svg>';

  const CADEADO =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke-width="1.8"></rect>' +
    '<path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" fill="none" stroke-width="1.8" stroke-linecap="round"></path>' +
    '<circle cx="12" cy="15.4" r="1.3" class="furo"></circle>' +
    '</svg>';

  /** A folha: um retangulo em pe, tipo A4, com tres riscos ondulados de texto. */
  const FOLHA =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="5" y="2.5" width="14" height="19" rx="2" fill="none" stroke-width="1.8"></rect>' +
    '<path d="M8.4 8.2q1.1-1.2 2.2 0t2.2 0 2.2 0M8.4 12q1.1-1.2 2.2 0t2.2 0 2.2 0M8.4 15.8q1.1-1.2 2.2 0t2.2 0" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '</svg>';

  const SETA =
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">' +
    '<path d="M1.5 3.5 L5 7 L8.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"' +
    ' stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  /**
   * Monta o seletor dentro de `raiz`.
   *
   *   aoEscolher(valor)          o usuario escolheu um arquivo (ou "criar nova")
   *   aoMarcar(valor)            o usuario clicou na estrela de um arquivo
   *   aoAlternarHistorico(valor) o usuario clicou no relogio de um arquivo
   *   aoAlternarPrivado(valor)   o usuario clicou no cadeado de um arquivo
   *   aoAlternarLivre(valor)     o usuario clicou na folha de um arquivo
   *   aoAbrir()                  a lista vai abrir - para fechar o que estiver aberto
   *
   * Devolve { definir, fechar, estaAberto, focar }.
   */
  function criar(raiz, { aoEscolher, aoMarcar, aoAlternarHistorico, aoAlternarPrivado, aoAlternarLivre, aoAbrir, rotuloNovo, valorNovo }) {
    let itens = [];
    let atual = '';
    let principal = '';
    let historico = [];
    let privados = [];
    let livres = [];
    let arquivoTarefas = '';
    let aberto = false;
    let destaque = 0;

    const nome = el('span', { class: 'seletor-nome' });
    const estrelaFixa = svg(ESTRELA);
    estrelaFixa.classList.add('seletor-estrela-fixa');
    const relogioFixo = svg(RELOGIO);
    relogioFixo.classList.add('seletor-relogio-fixo');
    const cadeadoFixo = svg(CADEADO);
    cadeadoFixo.classList.add('seletor-cadeado-fixo');
    const folhaFixa = svg(FOLHA);
    folhaFixa.classList.add('seletor-folha-fixa');

    const botao = el('button', {
      class: 'seletor-botao',
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
    });
    window.Blink.ui.anexar(botao, [nome, estrelaFixa, relogioFixo, cadeadoFixo, folhaFixa, svg(SETA)]);

    const lista = el('div', { class: 'seletor-lista', role: 'listbox', hidden: true });
    window.Blink.ui.anexar(raiz, [botao, lista]);

    function ehPrincipal(valor) {
      return principal !== '' && valor.toLowerCase() === principal.toLowerCase();
    }

    function temHistorico(valor) {
      return historico.some((h) => h.toLowerCase() === valor.toLowerCase());
    }

    function ehPrivado(valor) {
      return privados.some((p) => p.toLowerCase() === valor.toLowerCase());
    }

    function ehLivre(valor) {
      return livres.some((l) => l.toLowerCase() === valor.toLowerCase());
    }

    /** O task.md nao tem relogio: ja tem o proprio formato de secoes. */
    function podeHistorico(valor) {
      return valor.toLowerCase() !== arquivoTarefas.toLowerCase();
    }

    /** O botao fechado: nome atual, estrela e relogio so se o atual tiver a marca. */
    function desenharBotao() {
      const item = itens.find((i) => i.valor === atual);
      nome.textContent = item ? item.rotulo : '';
      estrelaFixa.style.display = ehPrincipal(atual) ? '' : 'none';
      relogioFixo.style.display = temHistorico(atual) ? '' : 'none';
      cadeadoFixo.style.display = ehPrivado(atual) ? '' : 'none';
      folhaFixa.style.display = ehLivre(atual) ? '' : 'none';

      const marcas = [];
      if (ehPrincipal(atual)) marcas.push('arquivo principal');
      if (temHistorico(atual)) marcas.push('histórico diário');
      if (ehPrivado(atual)) marcas.push('com cadeado');
      if (ehLivre(atual)) marcas.push('folha livre');
      botao.title = marcas.length > 0 ? `${nome.textContent} — ${marcas.join(', ')}` : nome.textContent;
    }

    function desenharLista() {
      limpar(lista);

      itens.forEach((item, indice) => {
        const classes = ['seletor-item'];
        if (item.valor === atual) classes.push('atual');
        if (indice === destaque) classes.push('destacado');

        const linha = el('div', {
          class: classes.join(' '),
          role: 'option',
          'aria-selected': String(item.valor === atual),
          onmousedown: (evento) => evento.preventDefault(), // mantem o foco no botao
          onclick: () => escolher(indice),
          onmousemove: () => {
            if (destaque !== indice) {
              destaque = indice;
              marcarDestaque();
            }
          },
        }, [el('span', { class: 'seletor-item-nome', texto: item.rotulo })]);

        // Ordem na linha: relogio primeiro, estrela por ultimo (encostada na
        // borda direita) - e a mesma ordem do design.
        if (item.marcavel && podeHistorico(item.valor)) {
          const ligado = temHistorico(item.valor);
          const privado = ehPrivado(item.valor);
          const livre = ehLivre(item.valor);

          // A folha vem primeiro. Folha, cadeado e relogio nao andam juntos: o que nao vale no arquivo fica apagado.
          const folha = el('button', {
            class: livre ? 'seletor-folha marcado' : privado || ligado ? 'seletor-folha bloqueado' : 'seletor-folha',
            type: 'button',
            title: livre
              ? 'Voltar para os tópicos (a folha fica guardada)'
              : privado
                ? 'Arquivos com cadeado não podem ser folha livre: tire o cadeado antes'
                : ligado
                  ? 'Arquivos com histórico diário não podem ser folha livre: desligue o relógio antes'
                  : 'Folha livre: um editor de página, com texto formatado, imagens e caneta',
            'aria-pressed': String(livre),
            'aria-disabled': String(!livre && (privado || ligado)),
            'aria-label': livre ? `Desligar a folha livre de ${item.rotulo}` : `Ligar a folha livre de ${item.rotulo}`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              evento.stopPropagation();
              if (!livre && (privado || ligado)) return;
              aoAlternarLivre(item.valor);
            },
          });
          folha.appendChild(svg(FOLHA));
          linha.appendChild(folha);

          // O cadeado vem antes do relogio. Um arquivo com o relogio ligado nao pode ter cadeado (e o contrario):
          // o botao fica apagado e o title explica.
          const cadeado = el('button', {
            class: privado ? 'seletor-cadeado marcado' : ligado || livre ? 'seletor-cadeado bloqueado' : 'seletor-cadeado',
            type: 'button',
            title: privado
              ? 'Tirar o cadeado (pede a senha)'
              : ligado
                ? 'Arquivos com histórico diário não podem ter cadeado: desligue o relógio antes'
                : livre
                  ? 'Arquivos em folha livre não podem ter cadeado: desligue a folha antes'
                  : 'Pôr um cadeado: o arquivo vira privado e criptografado',
            'aria-pressed': String(privado),
            'aria-disabled': String(!privado && (ligado || livre)),
            'aria-label': privado ? `Tirar o cadeado de ${item.rotulo}` : `Pôr um cadeado em ${item.rotulo}`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              evento.stopPropagation();
              if (!privado && (ligado || livre)) return;
              aoAlternarPrivado(item.valor);
            },
          });
          cadeado.appendChild(svg(CADEADO));
          linha.appendChild(cadeado);

          const relogio = el('button', {
            class: ligado ? 'seletor-relogio marcado' : privado || livre ? 'seletor-relogio bloqueado' : 'seletor-relogio',
            type: 'button',
            title: ligado ? 'Desligar o histórico diário' : privado ? 'Arquivos com cadeado não podem ter histórico diário' : livre ? 'Arquivos em folha livre não podem ter histórico diário' : 'Ligar o histórico diário',
            'aria-pressed': String(ligado),
            'aria-disabled': String(!ligado && (privado || livre)),
            'aria-label': ligado ? `Desligar o histórico diário de ${item.rotulo}` : `Ligar o histórico diário de ${item.rotulo}`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              // Nao escolhe o arquivo nem fecha a lista: so alterna.
              evento.stopPropagation();
              if (!ligado && (privado || livre)) return;
              aoAlternarHistorico(item.valor);
            },
          });
          relogio.appendChild(svg(RELOGIO));
          linha.appendChild(relogio);
        }

        if (item.marcavel) {
          const marcada = ehPrincipal(item.valor);
          const estrela = el('button', {
            class: marcada ? 'seletor-estrela marcada' : 'seletor-estrela',
            type: 'button',
            title: marcada ? 'Deixar de ser o principal' : 'Tornar principal',
            'aria-pressed': String(marcada),
            'aria-label': marcada ? `Deixar ${item.rotulo} de ser o principal` : `Tornar ${item.rotulo} o principal`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              // Nao escolhe o arquivo nem fecha a lista: so marca.
              evento.stopPropagation();
              aoMarcar(item.valor);
            },
          });
          estrela.appendChild(svg(ESTRELA));
          linha.appendChild(estrela);
        }

        lista.appendChild(linha);
      });
    }

    /** So troca a classe de destaque, sem redesenhar (o mouse nao perde o item). */
    function marcarDestaque() {
      [...lista.children].forEach((linha, i) => linha.classList.toggle('destacado', i === destaque));
      lista.children[destaque]?.scrollIntoView({ block: 'nearest' });
    }

    function abrir() {
      if (aberto) return;
      if (aoAbrir) aoAbrir();
      aberto = true;
      destaque = Math.max(0, itens.findIndex((i) => i.valor === atual));
      desenharLista();
      lista.hidden = false;
      botao.setAttribute('aria-expanded', 'true');
      raiz.classList.add('aberto');
      marcarDestaque();
    }

    function fechar() {
      if (!aberto) return;
      aberto = false;
      lista.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      raiz.classList.remove('aberto');
    }

    function escolher(indice) {
      const item = itens[indice];
      if (!item) return;
      fechar();
      botao.focus();
      if (item.valor !== atual) aoEscolher(item.valor);
    }

    botao.addEventListener('click', () => (aberto ? fechar() : abrir()));

    botao.addEventListener('keydown', (evento) => {
      if (!aberto) {
        if (['Enter', ' ', 'ArrowDown'].includes(evento.key)) {
          evento.preventDefault();
          abrir();
        }
        return;
      }

      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        evento.preventDefault();
        const passo = evento.key === 'ArrowDown' ? 1 : -1;
        destaque = (destaque + passo + itens.length) % itens.length;
        marcarDestaque();
      } else if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        escolher(destaque);
      } else if (evento.key === 'Escape') {
        // Sem o stopPropagation o Esc chegaria na janela e fecharia o Fast
        // Note inteiro, em vez de so fechar a lista.
        evento.preventDefault();
        evento.stopPropagation();
        fechar();
      } else if (evento.key === 'Tab') {
        fechar();
      }
    });

    // Clicar em qualquer lugar fora do seletor fecha a lista.
    document.addEventListener('mousedown', (evento) => {
      if (aberto && !raiz.contains(evento.target)) fechar();
    });

    /**
     * Atualiza o que o seletor mostra.
     *
     *   arquivos       nomes dos .md, na ordem em que devem aparecer
     *   atual          o arquivo aberto (ou o valor de "criar nova")
     *   principal      o arquivo da estrela, ou ''
     *   historico      arquivos com o relogio ligado
   *   privados       arquivos com cadeado
   *   livres         arquivos em folha livre
     *   arquivoTarefas nome do task.md, que nunca tem relogio
     *
     * Pode ser chamado com a lista aberta - e o que acontece ao marcar uma
     * estrela ou um relogio - e ela continua aberta.
     */
    function definir(dados) {
      itens = [
        ...dados.arquivos.map((a) => ({ valor: a, rotulo: a, marcavel: true })),
        { valor: valorNovo, rotulo: rotuloNovo, marcavel: false },
      ];
      atual = dados.atual;
      principal = dados.principal || '';
      historico = dados.historico || [];
      privados = dados.privados || [];
      livres = dados.livres || [];
      arquivoTarefas = dados.arquivoTarefas || '';
      if (destaque >= itens.length) destaque = itens.length - 1;
      desenharBotao();
      if (aberto) {
        desenharLista();
        marcarDestaque();
      }
    }

    return {
      definir,
      fechar,
      estaAberto: () => aberto,
      focar: () => botao.focus(),
    };
  }

  window.Blink.seletor = { criar };
})();
