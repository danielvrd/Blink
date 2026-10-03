/**
 * A barra de abas do Fast Note (como a do Bloco de Notas do Windows 11).
 *
 * So desenha e entrega os cliques; quem sabe o que e cada aba e o note.js:
 *
 *   desenhar(abas, idAtiva)   [{ id, rotulo, titulo, tipo: 'arquivo' | 'rapida', icone, naoSalva }]
 *
 * Handlers (opcoes de criar):
 *   aoAtivar(id)              clicou numa aba
 *   aoFechar(id)              clicou no X da aba, no botao do meio, ou Ctrl+W (o note.js decide se pergunta algo)
 *   aoReordenar(idsNaOrdem)   arrastou uma aba para outro lugar
 *
 * Teclado: com uma aba em foco, Esquerda/Direita andam entre as abas, Enter/Espaco ativam, Delete fecha. A roda do
 * mouse rola a barra na horizontal, e a aba ativa fica sempre visivel.
 */

window.Blink = window.Blink || {};

(function () {
  const { el, limpar, svg } = window.Blink.ui;

  const FECHAR =
    '<svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">' +
    '<path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path></svg>';

  function criar(raiz, { aoAtivar, aoFechar, aoReordenar }) {
    let abas = [];
    let ativa = '';
    let arrastando = null;

    raiz.setAttribute('role', 'tablist');
    raiz.setAttribute('aria-label', 'Abas abertas');

    // A roda do mouse rola a barra de lado.
    raiz.addEventListener('wheel', (evento) => {
      if (raiz.scrollWidth <= raiz.clientWidth || evento.deltaX !== 0) return;
      raiz.scrollLeft += evento.deltaY;
      evento.preventDefault();
    }, { passive: false });

    function elementoDe(id) {
      return [...raiz.children].find((c) => c.dataset.id === id);
    }

    function desenhar(novasAbas, idAtiva) {
      abas = novasAbas;
      ativa = idAtiva;
      limpar(raiz);

      for (const aba of abas) {
        const eAtiva = aba.id === ativa;
        const classes = ['aba-nota'];
        if (eAtiva) classes.push('ativa');
        if (aba.tipo === 'rapida') classes.push('rapida');
        if (aba.naoSalva) classes.push('nao-salva');
        if (aba.modo) classes.push('modo-' + aba.modo);

        const fechar = el('button', {
          class: 'aba-fechar',
          type: 'button',
          title: 'Fechar a aba (Ctrl+W)',
          'aria-label': `Fechar a aba ${aba.rotulo}`,
          tabindex: '-1',
          onmousedown: (evento) => evento.stopPropagation(),
          onclick: (evento) => {
            evento.stopPropagation();
            aoFechar(aba.id);
          },
        });
        fechar.appendChild(svg(FECHAR));

        const item = el('div', {
          class: classes.join(' '),
          role: 'tab',
          draggable: 'true',
          tabindex: eAtiva ? '0' : '-1',
          title: aba.titulo || aba.rotulo,
          'aria-selected': String(eAtiva),
          dataset: { id: aba.id },
          onclick: () => { if (!eAtiva) aoAtivar(aba.id); },
          // O botao do meio fecha, como num navegador.
          onauxclick: (evento) => {
            if (evento.button !== 1) return;
            evento.preventDefault();
            aoFechar(aba.id);
          },
          onkeydown: (evento) => teclado(evento, aba.id),
        }, [
          aba.icone ? svg(aba.icone) : null,
          el('span', { class: 'aba-nome', texto: aba.rotulo }),
          fechar,
        ]);

        ligarArrasto(item, aba.id);
        raiz.appendChild(item);
      }

      const atual = elementoDe(ativa);
      if (atual) atual.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function teclado(evento, id) {
      const indice = abas.findIndex((a) => a.id === id);
      if (evento.key === 'ArrowRight' || evento.key === 'ArrowLeft') {
        const proxima = abas[indice + (evento.key === 'ArrowRight' ? 1 : -1)];
        if (proxima) {
          evento.preventDefault();
          aoAtivar(proxima.id);
        }
      } else if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        aoAtivar(id);
      } else if (evento.key === 'Delete') {
        evento.preventDefault();
        aoFechar(id);
      }
    }

    /** Arrastar uma aba para reordenar: a linha-guia mostra onde ela cai. */
    function ligarArrasto(item, id) {
      item.addEventListener('dragstart', (evento) => {
        arrastando = id;
        evento.dataTransfer.effectAllowed = 'move';
        evento.dataTransfer.setData('text/plain', id);
        item.classList.add('arrastando');
      });
      item.addEventListener('dragover', (evento) => {
        if (!arrastando || arrastando === id) return;
        evento.preventDefault();
        for (const c of raiz.children) c.classList.remove('solta-antes', 'solta-depois');
        const origem = abas.findIndex((a) => a.id === arrastando);
        const destino = abas.findIndex((a) => a.id === id);
        item.classList.add(origem < destino ? 'solta-depois' : 'solta-antes');
      });
      item.addEventListener('drop', (evento) => {
        evento.preventDefault();
        const origem = abas.findIndex((a) => a.id === arrastando);
        const destino = abas.findIndex((a) => a.id === id);
        arrastando = null;
        if (origem < 0 || destino < 0 || origem === destino) return;
        const ids = abas.map((a) => a.id);
        const [movida] = ids.splice(origem, 1);
        ids.splice(destino, 0, movida);
        aoReordenar(ids);
      });
      item.addEventListener('dragend', () => {
        arrastando = null;
        for (const c of raiz.children) c.classList.remove('arrastando', 'solta-antes', 'solta-depois');
      });
    }

    return { desenhar, elementoDe };
  }

  window.Blink.abas = { criar };
})();
