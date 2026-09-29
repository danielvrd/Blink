/**
 * Seletor de arquivos do Fast Note, com a estrela do arquivo principal.
 *
 * Substitui o <select> do Windows porque ele nao aceita nada clicavel
 * dentro da lista - e cada item precisa da sua estrela. Por fora continua
 * parecido com o campo de antes: o nome do arquivo e uma seta.
 *
 *   Fechado  nome do arquivo aberto + estrela amarela se ele for o
 *            principal + seta
 *   Aberto   lista com todos os arquivos, cada um com a sua estrela, e
 *            "+ Criar nova nota" no fim
 *
 * Clicar no nome escolhe o arquivo. Clicar na estrela marca (ou desmarca)
 * o principal sem fechar a lista nem trocar de arquivo.
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

  const SETA =
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">' +
    '<path d="M1.5 3.5 L5 7 L8.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"' +
    ' stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  /**
   * Monta o seletor dentro de `raiz`.
   *
   *   aoEscolher(valor)  o usuario escolheu um arquivo (ou "criar nova")
   *   aoMarcar(valor)    o usuario clicou na estrela de um arquivo
   *   aoAbrir()          a lista vai abrir - para fechar o que estiver aberto
   *
   * Devolve { definir, fechar, estaAberto, focar }.
   */
  function criar(raiz, { aoEscolher, aoMarcar, aoAbrir, rotuloNovo, valorNovo }) {
    let itens = [];
    let atual = '';
    let principal = '';
    let aberto = false;
    let destaque = 0;

    const nome = el('span', { class: 'seletor-nome' });
    const estrelaFixa = svg(ESTRELA);
    estrelaFixa.classList.add('seletor-estrela-fixa');

    const botao = el('button', {
      class: 'seletor-botao',
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
    });
    window.Blink.ui.anexar(botao, [nome, estrelaFixa, svg(SETA)]);

    const lista = el('div', { class: 'seletor-lista', role: 'listbox', hidden: true });
    window.Blink.ui.anexar(raiz, [botao, lista]);

    function ehPrincipal(valor) {
      return principal !== '' && valor.toLowerCase() === principal.toLowerCase();
    }

    /** O botao fechado: nome atual, e a estrela so se o atual for o principal. */
    function desenharBotao() {
      const item = itens.find((i) => i.valor === atual);
      nome.textContent = item ? item.rotulo : '';
      estrelaFixa.style.display = ehPrincipal(atual) ? '' : 'none';
      botao.title = ehPrincipal(atual) ? `${nome.textContent} — arquivo principal` : nome.textContent;
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
     *   arquivos   nomes dos .md, na ordem em que devem aparecer
     *   atual      o arquivo aberto (ou o valor de "criar nova")
     *   principal  o arquivo da estrela, ou ''
     *
     * Pode ser chamado com a lista aberta - e o que acontece ao marcar uma
     * estrela - e ela continua aberta.
     */
    function definir(dados) {
      itens = [
        ...dados.arquivos.map((a) => ({ valor: a, rotulo: a, marcavel: true })),
        { valor: valorNovo, rotulo: rotuloNovo, marcavel: false },
      ];
      atual = dados.atual;
      principal = dados.principal || '';
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
