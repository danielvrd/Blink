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
 *            cadeado nem relogio), e "+ Criar nova nota" no topo. Folha,
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

  /** O modo texto: um "T" (o .md aberto como um editor de texto simples). */
  const TEXTO =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '</svg>';

  /** O quadro branco: um retangulo deitado (a lousa) com um rabisco. */
  const QUADRO =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="2.5" y="4.5" width="19" height="14" rx="2" fill="none" stroke-width="1.8"></rect>' +
    '<path d="M6.5 14.5l3-4 2.5 3 2-2.5 3.5 4" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '<path d="M8 21.5h8" fill="none" stroke-width="1.6" stroke-linecap="round"></path>' +
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
   *   aoAlternarQuadro(valor)    o usuario clicou no quadro de um arquivo
   *   aoAlternarTexto(valor)     o usuario clicou no "T" (modo texto) de um arquivo
   *   aoAbrir()                  a lista vai abrir - para fechar o que estiver aberto
   *
   * Devolve { definir, fechar, estaAberto, focar }.
   */
  function criar(raiz, { aoEscolher, aoMarcar, aoAlternarHistorico, aoAlternarPrivado, aoAlternarLivre, aoAlternarQuadro, aoAlternarTexto, aoAbrir, rotuloNovo, valorNovo }) {
    let itens = [];
    let atual = '';
    let principal = '';
    let historico = [];
    let privados = [];
    let livres = [];
    let quadros = [];
    let textos = [];
    let rotuloAtual = '';
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
    const quadroFixo = svg(QUADRO);
    quadroFixo.classList.add('seletor-quadro-fixo');
    const textoFixo = svg(TEXTO);
    textoFixo.classList.add('seletor-texto-fixo');

    const botao = el('button', {
      class: 'seletor-botao',
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
    });
    window.Blink.ui.anexar(botao, [nome, estrelaFixa, relogioFixo, cadeadoFixo, folhaFixa, quadroFixo, textoFixo, svg(SETA)]);

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

    function ehTexto(valor) {
      return textos.some((t) => t.toLowerCase() === valor.toLowerCase());
    }

    function ehQuadro(valor) {
      return quadros.some((q) => q.toLowerCase() === valor.toLowerCase());
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
      // Numa aba rapida o "arquivo" nao existe: o botao mostra o rotulo da aba.
      nome.textContent = rotuloAtual || (item ? item.rotulo : '');
      estrelaFixa.style.display = ehPrincipal(atual) ? '' : 'none';
      relogioFixo.style.display = temHistorico(atual) ? '' : 'none';
      cadeadoFixo.style.display = ehPrivado(atual) ? '' : 'none';
      folhaFixa.style.display = ehLivre(atual) ? '' : 'none';
      quadroFixo.style.display = ehQuadro(atual) ? '' : 'none';
      textoFixo.style.display = ehTexto(atual) ? '' : 'none';

      const marcas = [];
      if (ehPrincipal(atual)) marcas.push('arquivo principal');
      if (temHistorico(atual)) marcas.push('histórico diário');
      if (ehPrivado(atual)) marcas.push('com cadeado');
      if (ehLivre(atual)) marcas.push('folha livre');
      if (ehQuadro(atual)) marcas.push('quadro branco');
      if (ehTexto(atual)) marcas.push('modo texto');
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
          const quadro = ehQuadro(item.valor);
          const texto = ehTexto(item.valor);

          // A folha vem primeiro. Folha, cadeado e relogio nao andam juntos: o que nao vale no arquivo fica apagado.
          const folha = el('button', {
            class: livre ? 'seletor-folha marcado' : privado || ligado || quadro || texto ? 'seletor-folha bloqueado' : 'seletor-folha',
            type: 'button',
            title: livre
              ? 'Voltar para os tópicos (a folha fica guardada)'
              : privado
                ? 'Arquivos com cadeado não podem ser folha livre: tire o cadeado antes'
                : ligado
                  ? 'Arquivos com histórico diário não podem ser folha livre: desligue o relógio antes'
                  : quadro
                    ? 'Arquivos em quadro branco não podem ser folha livre: desligue o quadro antes'
                    : texto
                      ? 'Arquivos em modo texto não podem ser folha livre: desligue o "T" antes'
                      : 'Folha livre: um editor de página, com texto formatado, imagens e caneta',
            'aria-pressed': String(livre),
            'aria-disabled': String(!livre && (privado || ligado || quadro || texto)),
            'aria-label': livre ? `Desligar a folha livre de ${item.rotulo}` : `Ligar a folha livre de ${item.rotulo}`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              evento.stopPropagation();
              if (!livre && (privado || ligado || quadro || texto)) return;
              aoAlternarLivre(item.valor);
            },
          });
          folha.appendChild(svg(FOLHA));
          linha.appendChild(folha);

          // O quadro branco vem logo depois da folha, com os mesmos bloqueios cruzados.
          const botaoQuadro = el('button', {
            class: quadro ? 'seletor-quadro marcado' : privado || ligado || livre || texto ? 'seletor-quadro bloqueado' : 'seletor-quadro',
            type: 'button',
            title: quadro
              ? 'Voltar para os tópicos (o quadro fica guardado)'
              : privado
                ? 'Arquivos com cadeado não podem ser quadro branco: tire o cadeado antes'
                : ligado
                  ? 'Arquivos com histórico diário não podem ser quadro branco: desligue o relógio antes'
                  : livre
                    ? 'Arquivos em folha livre não podem ser quadro branco: desligue a folha antes'
                    : texto
                      ? 'Arquivos em modo texto não podem ser quadro branco: desligue o "T" antes'
                      : 'Quadro branco: desenhe com formas, setas e texto (Excalidraw)',
            'aria-pressed': String(quadro),
            'aria-disabled': String(!quadro && (privado || ligado || livre || texto)),
            'aria-label': quadro ? `Desligar o quadro branco de ${item.rotulo}` : `Ligar o quadro branco de ${item.rotulo}`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              evento.stopPropagation();
              if (!quadro && (privado || ligado || livre || texto)) return;
              aoAlternarQuadro(item.valor);
            },
          });
          botaoQuadro.appendChild(svg(QUADRO));
          linha.appendChild(botaoQuadro);

          // O "T": o .md inteiro como um editor de texto simples (como o Bloco de Notas).
          const botaoTexto = el('button', {
            class: texto ? 'seletor-texto marcado' : privado || ligado || livre || quadro ? 'seletor-texto bloqueado' : 'seletor-texto',
            type: 'button',
            title: texto
              ? 'Voltar para os tópicos (o arquivo não muda)'
              : privado
                ? 'Arquivos com cadeado não podem ser editados como texto: tire o cadeado antes'
                : ligado
                  ? 'Arquivos com histórico diário não podem ser editados como texto: desligue o relógio antes'
                  : livre
                    ? 'Arquivos em folha livre não podem ser editados como texto: desligue a folha antes'
                    : quadro
                      ? 'Arquivos em quadro branco não podem ser editados como texto: desligue o quadro antes'
                      : 'Editar como texto: o arquivo inteiro num editor simples, como o Bloco de Notas',
            'aria-pressed': String(texto),
            'aria-disabled': String(!texto && (privado || ligado || livre || quadro)),
            'aria-label': texto ? `Voltar ${item.rotulo} aos tópicos` : `Editar ${item.rotulo} como texto`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              evento.stopPropagation();
              if (!texto && (privado || ligado || livre || quadro)) return;
              aoAlternarTexto(item.valor);
            },
          });
          botaoTexto.appendChild(svg(TEXTO));
          linha.appendChild(botaoTexto);

          // O cadeado vem antes do relogio. Um arquivo com o relogio ligado nao pode ter cadeado (e o contrario):
          // o botao fica apagado e o title explica.
          const cadeado = el('button', {
            class: privado ? 'seletor-cadeado marcado' : ligado || livre || quadro || texto ? 'seletor-cadeado bloqueado' : 'seletor-cadeado',
            type: 'button',
            title: privado
              ? 'Tirar o cadeado (pede a senha)'
              : ligado
                ? 'Arquivos com histórico diário não podem ter cadeado: desligue o relógio antes'
                : livre
                  ? 'Arquivos em folha livre não podem ter cadeado: desligue a folha antes'
                  : quadro
                    ? 'Arquivos em quadro branco não podem ter cadeado: desligue o quadro antes'
                    : texto
                      ? 'Arquivos em modo texto não podem ter cadeado: desligue o "T" antes'
                      : 'Pôr um cadeado: o arquivo vira privado e criptografado',
            'aria-pressed': String(privado),
            'aria-disabled': String(!privado && (ligado || livre || quadro || texto)),
            'aria-label': privado ? `Tirar o cadeado de ${item.rotulo}` : `Pôr um cadeado em ${item.rotulo}`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              evento.stopPropagation();
              if (!privado && (ligado || livre || quadro || texto)) return;
              aoAlternarPrivado(item.valor);
            },
          });
          cadeado.appendChild(svg(CADEADO));
          linha.appendChild(cadeado);

          const relogio = el('button', {
            class: ligado ? 'seletor-relogio marcado' : privado || livre || quadro || texto ? 'seletor-relogio bloqueado' : 'seletor-relogio',
            type: 'button',
            title: ligado ? 'Desligar o histórico diário' : privado ? 'Arquivos com cadeado não podem ter histórico diário' : livre ? 'Arquivos em folha livre não podem ter histórico diário' : quadro ? 'Arquivos em quadro branco não podem ter histórico diário' : texto ? 'Arquivos em modo texto não podem ter histórico diário' : 'Ligar o histórico diário',
            'aria-pressed': String(ligado),
            'aria-disabled': String(!ligado && (privado || livre || quadro || texto)),
            'aria-label': ligado ? `Desligar o histórico diário de ${item.rotulo}` : `Ligar o histórico diário de ${item.rotulo}`,
            onmousedown: (evento) => evento.preventDefault(),
            onclick: (evento) => {
              // Nao escolhe o arquivo nem fecha a lista: so alterna.
              evento.stopPropagation();
              if (!ligado && (privado || livre || quadro || texto)) return;
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

    /**
     * A lista pode ser mais larga que o seletor (que no cabecalho e pequeno e fica depois do nome da janela): se passar da
     * borda direita da janela, desloca para a esquerda o quanto precisa, sem passar da borda esquerda.
     */
    function manterDentroDaJanela() {
      lista.style.left = '';
      const margem = 8;
      const sobra = lista.getBoundingClientRect().right - (window.innerWidth - margem);
      if (sobra <= 0) return;
      const esquerdaDoSeletor = raiz.getBoundingClientRect().left;
      lista.style.left = Math.max(margem - esquerdaDoSeletor, -sobra) + 'px';
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
      manterDentroDaJanela();
      marcarDestaque();
    }

    function fechar() {
      if (!aberto) return;
      aberto = false;
      lista.hidden = true;
      lista.style.left = '';
      botao.setAttribute('aria-expanded', 'false');
      raiz.classList.remove('aberto');
    }

    function escolher(indice) {
      const item = itens[indice];
      if (!item) return;
      fechar();
      botao.focus();
      // Escolher "+ Criar nova nota" com ela ja aberta so devolve o foco ao nome (quem decide e o note.js).
      if (item.valor !== atual || item.valor === valorNovo) aoEscolher(item.valor);
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
      // "+ Criar nova nota" fica sempre no topo da lista.
      itens = [
        { valor: valorNovo, rotulo: rotuloNovo, marcavel: false },
        ...dados.arquivos.map((a) => ({ valor: a, rotulo: a, marcavel: true })),
      ];
      atual = dados.atual;
      principal = dados.principal || '';
      historico = dados.historico || [];
      privados = dados.privados || [];
      livres = dados.livres || [];
      quadros = dados.quadros || [];
      textos = dados.textos || [];
      rotuloAtual = dados.rotuloAtual || '';
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

  // Os desenhos das marcas, para a tela de "+ Criar nova nota" mostrar os mesmos icones (note.js).
  window.Blink.seletor = { criar, ICONES: { FOLHA, QUADRO, TEXTO, CADEADO, RELOGIO, ESTRELA } };
})();
