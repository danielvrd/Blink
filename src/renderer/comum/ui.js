/**
 * Ajudantes de tela, usados por todas as janelas do Blink.
 *
 * Nao e um framework: sao tres ou quatro funcoes para montar elementos sem
 * repetir document.createElement em toda linha.
 *
 * Os arquivos das telas sao carregados como <script> comum, na ordem em que
 * aparecem no HTML, e cada um pendura o que expoe no objeto global `Blink`.
 */

window.Blink = window.Blink || {};

(function () {
  /**
   * Cria um elemento.
   *
   *   el('div', { class: 'aba' }, 'texto')
   *   el('button', { class: 'botao', onclick: fn }, [icone, 'Alterar'])
   *
   * Propriedades reconhecidas:
   *   class, id, type, value, title, placeholder, disabled  - viram atributos
   *   texto                                                 - vira textContent
   *   dataset                                               - objeto de data-*
   *   on<evento> (onclick, oninput, ...)                    - vira listener
   *   qualquer outra                                        - vira atributo
   */
  function el(tag, props, filhos) {
    const node = document.createElement(tag);

    for (const [chave, valor] of Object.entries(props || {})) {
      if (valor === null || valor === undefined || valor === false) continue;

      if (chave === 'texto') {
        node.textContent = valor;
      } else if (chave === 'dataset') {
        Object.assign(node.dataset, valor);
      } else if (chave.startsWith('on') && typeof valor === 'function') {
        node.addEventListener(chave.slice(2), valor);
      } else if (valor === true) {
        node.setAttribute(chave, '');
      } else {
        node.setAttribute(chave, valor);
      }
    }

    anexar(node, filhos);
    return node;
  }

  /** Coloca filhos dentro de um elemento. Aceita texto, elemento ou lista. */
  function anexar(pai, filhos) {
    if (filhos === null || filhos === undefined) return pai;

    const lista = Array.isArray(filhos) ? filhos : [filhos];
    for (const filho of lista) {
      if (filho === null || filho === undefined || filho === false) continue;
      pai.appendChild(typeof filho === 'string' ? document.createTextNode(filho) : filho);
    }
    return pai;
  }

  /** Esvazia um elemento. */
  function limpar(node) {
    node.replaceChildren();
    return node;
  }

  /**
   * Cria um SVG a partir do codigo em texto.
   *
   * innerHTML normal nao serve para SVG dentro de HTML: o navegador precisa
   * interpretar as tags no namespace certo, senao o desenho nao aparece.
   */
  function svg(codigo) {
    const molde = document.createElement('template');
    molde.innerHTML = codigo.trim();
    return molde.content.firstElementChild;
  }

  /** Rotulo de secao: texto pequeno, maiusculo, cinza. */
  function rotulo(texto) {
    return el('div', { class: 'rotulo', texto });
  }

  window.Blink.ui = { el, anexar, limpar, svg, rotulo };
})();
