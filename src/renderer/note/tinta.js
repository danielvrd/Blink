/**
 * A tinta da folha livre: o que se desenha com caneta, marca-texto e borracha POR CIMA do texto.
 *
 * E uma camada SVG do tamanho da folha inteira. Os tracos ficam em COORDENADAS DA FOLHA (a folha tem 794 px de
 * largura fixos; o zoom que a faz caber na janela e so uma escala de CSS na folha), entao o desenho nao se
 * desalinha quando a janela muda de tamanho. E fica preso a folha, como caneta no papel: escrever texto mais
 * acima nao move o rabisco.
 *
 * Um traco: { t: 'caneta' | 'marca', c: '#rrggbb', w: espessura, p: [[x, y], ...] } - o mesmo formato que o
 * processo principal valida e grava (notas-livres.js).
 *
 *   caneta       linha firme
 *   marca        a mesma coisa, larga e translucida (tambem serve para "pintar")
 *   borracha     apaga o traco tocado (o traco inteiro, nao so o pedaco)
 *
 * Desfazer e refazer valem para a tinta (o texto tem o Ctrl+Z do proprio Quill).
 *
 * So desenha com o mouse/caneta quando uma ferramenta de desenho esta ligada: com "texto", a camada deixa o
 * clique passar para o editor que esta embaixo.
 */

window.Blink = window.Blink || {};

(function () {
  const NS = 'http://www.w3.org/2000/svg';

  /** Espessuras de cada ferramenta (3 opcoes), em unidades da folha. */
  const ESPESSURAS = {
    caneta: [2, 4, 8],
    marca: [12, 18, 30],
  };

  /** A marca-texto e translucida: o texto embaixo continua legivel. */
  const OPACIDADE_DA_MARCA = 0.38;

  /** Dois pontos mais perto que isto (em unidades da folha) nao viram um segmento novo. */
  const DISTANCIA_MINIMA = 1.2;

  /** O raio da borracha, em unidades da folha. */
  const RAIO_DA_BORRACHA = 7;

  /** Distancia de um ponto a um segmento (para a borracha saber se tocou um traco). */
  function distanciaAoSegmento(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const comprimento = dx * dx + dy * dy;
    if (comprimento === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / comprimento));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /** O traco foi tocado pela borracha em (x, y)? */
  function tocou(traco, x, y, raio) {
    const folga = raio + traco.w / 2;
    const pontos = traco.p;
    if (pontos.length === 1) return Math.hypot(x - pontos[0][0], y - pontos[0][1]) <= folga;
    for (let i = 1; i < pontos.length; i++) {
      if (distanciaAoSegmento(x, y, pontos[i - 1][0], pontos[i - 1][1], pontos[i][0], pontos[i][1]) <= folga) return true;
    }
    return false;
  }

  /** O atributo "d" de um caminho SVG a partir dos pontos. Um ponto so vira um pingo (segmento de tamanho zero com a ponta redonda). */
  function caminho(pontos) {
    const [x0, y0] = pontos[0];
    if (pontos.length === 1) return `M${x0} ${y0}l0 0`;
    return `M${x0} ${y0}` + pontos.slice(1).map(([x, y]) => `L${x} ${y}`).join('');
  }

  /**
   * Cria a camada de tinta dentro de um <svg>.
   *
   *   svg           o elemento (position: absolute sobre a folha)
   *   opcoes.zoom   funcao que devolve a escala atual da folha (1 = tamanho real)
   *   opcoes.aoMudar  chamada a cada mudanca da tinta (para gravar) e das pilhas de desfazer/refazer
   *
   * Devolve { definir, obter, limpar, ferramenta, ..., desfazer, refazer }.
   */
  function criar(svg, { zoom, aoMudar }) {
    let tracos = [];
    const elementos = new Map(); // traco -> <path>
    let ferramenta = 'texto';
    let cor = '#e0263b';
    let espessura = 1; // indice de ESPESSURAS[ferramenta]
    let desfazer = [];
    let refazer = [];

    // O que esta sendo desenhado agora (pointer down ... up).
    let atual = null;
    let borrachaEmCurso = null; // { removidos: [{ indice, traco }] }

    function avisar() {
      if (aoMudar) aoMudar();
    }

    // --- Desenho dos tracos -------------------------------------------------------------

    function criarElemento(traco) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', traco.c);
      p.setAttribute('stroke-width', String(traco.w));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      if (traco.t === 'marca') p.setAttribute('stroke-opacity', String(OPACIDADE_DA_MARCA));
      p.setAttribute('d', caminho(traco.p));
      return p;
    }

    function redesenhar() {
      svg.replaceChildren();
      elementos.clear();
      for (const traco of tracos) {
        const p = criarElemento(traco);
        elementos.set(traco, p);
        svg.appendChild(p);
      }
    }

    function adicionar(traco, indice) {
      const p = criarElemento(traco);
      elementos.set(traco, p);
      if (indice === undefined || indice >= tracos.length) {
        tracos.push(traco);
        svg.appendChild(p);
      } else {
        tracos.splice(indice, 0, traco);
        svg.insertBefore(p, svg.children[indice] || null);
      }
    }

    function remover(traco) {
      const indice = tracos.indexOf(traco);
      if (indice < 0) return -1;
      tracos.splice(indice, 1);
      const p = elementos.get(traco);
      if (p) p.remove();
      elementos.delete(traco);
      return indice;
    }

    // --- O mouse ----------------------------------------------------------------------

    /** O ponto do evento em coordenadas da folha (descontando o zoom), com 1 casa decimal. */
    function ponto(evento) {
      const caixa = svg.getBoundingClientRect();
      const z = zoom() || 1;
      return [Math.round(((evento.clientX - caixa.left) / z) * 10) / 10, Math.round(((evento.clientY - caixa.top) / z) * 10) / 10];
    }

    function apagarEm(x, y) {
      for (const traco of [...tracos]) {
        if (tocou(traco, x, y, RAIO_DA_BORRACHA)) {
          const indice = remover(traco);
          if (indice >= 0) borrachaEmCurso.removidos.push({ indice, traco });
        }
      }
    }

    svg.addEventListener('pointerdown', (evento) => {
      if (ferramenta === 'texto' || evento.button !== 0) return;
      evento.preventDefault();
      svg.setPointerCapture(evento.pointerId);

      const [x, y] = ponto(evento);
      if (ferramenta === 'borracha') {
        borrachaEmCurso = { removidos: [] };
        apagarEm(x, y);
        return;
      }

      const largura = ESPESSURAS[ferramenta][espessura];
      atual = { t: ferramenta, c: cor, w: largura, p: [[x, y]] };
      const p = criarElemento(atual);
      elementos.set(atual, p);
      svg.appendChild(p);
    });

    svg.addEventListener('pointermove', (evento) => {
      if (borrachaEmCurso) {
        const [x, y] = ponto(evento);
        apagarEm(x, y);
        return;
      }
      if (!atual) return;

      const [x, y] = ponto(evento);
      const ultimo = atual.p[atual.p.length - 1];
      if (Math.hypot(x - ultimo[0], y - ultimo[1]) < DISTANCIA_MINIMA) return;
      atual.p.push([x, y]);
      elementos.get(atual).setAttribute('d', caminho(atual.p));
    });

    function terminar(evento) {
      if (evento && svg.hasPointerCapture && svg.hasPointerCapture(evento.pointerId)) svg.releasePointerCapture(evento.pointerId);

      if (borrachaEmCurso) {
        const { removidos } = borrachaEmCurso;
        borrachaEmCurso = null;
        if (removidos.length > 0) {
          desfazer.push({ tipo: 'apagou', removidos });
          refazer = [];
          avisar();
        }
        return;
      }

      if (!atual) return;
      const traco = atual;
      atual = null;
      // O elemento ja esta na tela; so passa a ser um traco de verdade.
      tracos.push(traco);
      desfazer.push({ tipo: 'desenhou', traco });
      refazer = [];
      avisar();
    }

    svg.addEventListener('pointerup', terminar);
    svg.addEventListener('pointercancel', terminar);

    // --- Desfazer e refazer ---------------------------------------------------------------

    function voltar() {
      const acao = desfazer.pop();
      if (!acao) return false;
      if (acao.tipo === 'desenhou') {
        remover(acao.traco);
      } else {
        // Devolve cada traco ao lugar de onde saiu (do menor indice para o maior).
        for (const { indice, traco } of [...acao.removidos].sort((a, b) => a.indice - b.indice)) adicionar(traco, indice);
      }
      refazer.push(acao);
      avisar();
      return true;
    }

    function repetir() {
      const acao = refazer.pop();
      if (!acao) return false;
      if (acao.tipo === 'desenhou') {
        adicionar(acao.traco);
      } else {
        for (const { traco } of acao.removidos) remover(traco);
      }
      desfazer.push(acao);
      avisar();
      return true;
    }

    // --- Interface publica ----------------------------------------------------------------

    function aplicarFerramenta() {
      const desenha = ferramenta !== 'texto';
      // So pelo CSSOM (.style): o CSP da tela bloqueia o atributo style="".
      svg.style.pointerEvents = desenha ? 'auto' : 'none';
      svg.style.touchAction = desenha ? 'none' : 'auto';
      svg.style.cursor = ferramenta === 'borracha' ? 'cell' : desenha ? 'crosshair' : 'default';
    }

    aplicarFerramenta();

    return {
      /** Troca os tracos (ao abrir um arquivo): zera tambem o desfazer/refazer. */
      definir(novos) {
        tracos = Array.isArray(novos) ? novos.map((t) => ({ t: t.t, c: t.c, w: t.w, p: t.p.map((q) => [q[0], q[1]]) })) : [];
        desfazer = [];
        refazer = [];
        atual = null;
        borrachaEmCurso = null;
        redesenhar();
      },
      /** Os tracos de agora, em JSON puro. */
      obter() {
        return tracos.map((t) => ({ t: t.t, c: t.c, w: t.w, p: t.p.map((q) => [q[0], q[1]]) }));
      },
      /** Apaga todos os tracos (a vassoura da folha). */
      limpar() {
        tracos = [];
        desfazer = [];
        refazer = [];
        redesenhar();
        avisar();
      },
      get ferramenta() { return ferramenta; },
      set ferramenta(valor) {
        if (!['texto', 'caneta', 'marca', 'borracha'].includes(valor)) return;
        ferramenta = valor;
        aplicarFerramenta();
      },
      get cor() { return cor; },
      set cor(valor) { if (/^#[0-9a-f]{6}$/i.test(valor)) cor = valor; },
      get espessura() { return espessura; },
      set espessura(valor) { if ([0, 1, 2].includes(valor)) espessura = valor; },
      desfazer: voltar,
      refazer: repetir,
      podeDesfazer: () => desfazer.length > 0,
      podeRefazer: () => refazer.length > 0,
      total: () => tracos.length,
      ESPESSURAS,
    };
  }

  window.Blink.tinta = { criar, ESPESSURAS };
})();
