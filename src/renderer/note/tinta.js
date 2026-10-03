/**
 * A tinta da folha livre: o que se desenha com caneta, marca-texto e borracha POR CIMA do texto.
 *
 * E uma camada SVG do tamanho da folha inteira. Os tracos ficam em COORDENADAS DA FOLHA (a folha tem 794 px de
 * largura fixos; o zoom que a faz caber na janela e so uma escala de CSS na folha), entao o desenho nao se
 * desalinha quando a janela muda de tamanho. E fica preso a folha, como caneta no papel: escrever texto mais
 * acima nao move o rabisco.
 *
 * Um traco: { t: 'caneta' | 'marca' | 'retangulo' | 'elipse' | 'linha' | 'seta', c: '#rrggbb', w: espessura,
 * p: [[x, y], ...] } - o mesmo formato que o processo principal valida e grava (notas-livres.js).
 *
 *   caneta       linha firme
 *   marca        a mesma coisa, larga e translucida (tambem serve para "pintar")
 *   retangulo, elipse, linha, seta
 *                formas: arrastar do canto ao canto oposto (ou do inicio ao fim). Shift = quadrado,
 *                circulo, ou angulos de 45 graus. Um clique sem arrastar nao faz nada. Guardam SO dois
 *                pontos ([inicio, fim]) e usam a cor e a espessura da caneta
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

  /** As formas: sempre dois pontos, e a espessura e a da caneta. */
  const FORMAS = ['retangulo', 'elipse', 'linha', 'seta'];
  const FERRAMENTAS = ['texto', 'caneta', 'marca', 'borracha', ...FORMAS];

  /** De qual lista de espessuras uma ferramenta tira a largura (as formas usam a da caneta). */
  const listaDeEspessuras = (ferramenta) => (FORMAS.includes(ferramenta) ? 'caneta' : ferramenta);

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

  /** A ponta de uma seta: tamanho em funcao da espessura, abertura de ~28 graus para cada lado. */
  function pontasDaSeta(traco) {
    const [[x1, y1], [x2, y2]] = traco.p;
    const angulo = Math.atan2(y2 - y1, x2 - x1);
    const tamanho = Math.max(10, 3 * traco.w);
    const ponta = (desvio) => [x2 + tamanho * Math.cos(angulo + Math.PI + desvio), y2 + tamanho * Math.sin(angulo + Math.PI + desvio)];
    return [ponta(0.5), ponta(-0.5)];
  }

  /** Os segmentos de uma forma (a borracha toca a BORDA, nao o meio vazio). */
  function segmentosDaForma(traco) {
    const [[x1, y1], [x2, y2]] = traco.p;
    if (traco.t === 'retangulo') {
      return [[[x1, y1], [x2, y1]], [[x2, y1], [x2, y2]], [[x2, y2], [x1, y2]], [[x1, y2], [x1, y1]]];
    }
    if (traco.t === 'elipse') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const pontos = Array.from({ length: 48 }, (_, i) => [cx + rx * Math.cos((i / 48) * 2 * Math.PI), cy + ry * Math.sin((i / 48) * 2 * Math.PI)]);
      return pontos.map((p, i) => [p, pontos[(i + 1) % 48]]);
    }
    if (traco.t === 'seta') {
      const [a, b] = pontasDaSeta(traco);
      return [[[x1, y1], [x2, y2]], [a, [x2, y2]], [b, [x2, y2]]];
    }
    return [[[x1, y1], [x2, y2]]]; // linha
  }

  /** O traco foi tocado pela borracha em (x, y)? */
  function tocou(traco, x, y, raio) {
    const folga = raio + traco.w / 2;
    if (FORMAS.includes(traco.t)) {
      return segmentosDaForma(traco).some(([a, b]) => distanciaAoSegmento(x, y, a[0], a[1], b[0], b[1]) <= folga);
    }
    const pontos = traco.p;
    if (pontos.length === 1) return Math.hypot(x - pontos[0][0], y - pontos[0][1]) <= folga;
    for (let i = 1; i < pontos.length; i++) {
      if (distanciaAoSegmento(x, y, pontos[i - 1][0], pontos[i - 1][1], pontos[i][0], pontos[i][1]) <= folga) return true;
    }
    return false;
  }

  /** Arredonda para 1 casa, como os pontos da caneta. */
  const arredondar = (n) => Math.round(n * 10) / 10;

  /**
   * O ponto final de uma forma com o Shift apertado: quadrado e circulo (lado = o maior dos dois),
   * e linha/seta em angulos de 45 graus.
   */
  function comShift(tipo, inicio, fim) {
    const dx = fim[0] - inicio[0];
    const dy = fim[1] - inicio[1];
    if (tipo === 'retangulo' || tipo === 'elipse') {
      const lado = Math.max(Math.abs(dx), Math.abs(dy));
      return [arredondar(inicio[0] + (dx < 0 ? -lado : lado)), arredondar(inicio[1] + (dy < 0 ? -lado : lado))];
    }
    const passo = Math.PI / 4;
    const angulo = Math.round(Math.atan2(dy, dx) / passo) * passo;
    const comprimento = Math.hypot(dx, dy);
    return [arredondar(inicio[0] + comprimento * Math.cos(angulo)), arredondar(inicio[1] + comprimento * Math.sin(angulo))];
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

    /** A geometria do elemento SVG de um traco (muda a cada movimento do mouse numa forma). */
    function ajustarGeometria(elemento, traco) {
      const pontos = traco.p;
      if (traco.t === 'retangulo') {
        const [[x1, y1], [x2, y2]] = pontos;
        elemento.setAttribute('x', String(Math.min(x1, x2)));
        elemento.setAttribute('y', String(Math.min(y1, y2)));
        elemento.setAttribute('width', String(Math.abs(x2 - x1)));
        elemento.setAttribute('height', String(Math.abs(y2 - y1)));
      } else if (traco.t === 'elipse') {
        const [[x1, y1], [x2, y2]] = pontos;
        elemento.setAttribute('cx', String(arredondar((x1 + x2) / 2)));
        elemento.setAttribute('cy', String(arredondar((y1 + y2) / 2)));
        elemento.setAttribute('rx', String(arredondar(Math.abs(x2 - x1) / 2)));
        elemento.setAttribute('ry', String(arredondar(Math.abs(y2 - y1) / 2)));
      } else if (traco.t === 'linha') {
        elemento.setAttribute('x1', String(pontos[0][0]));
        elemento.setAttribute('y1', String(pontos[0][1]));
        elemento.setAttribute('x2', String(pontos[1][0]));
        elemento.setAttribute('y2', String(pontos[1][1]));
      } else if (traco.t === 'seta') {
        const [a, b] = pontasDaSeta(traco);
        const f = (q) => `${arredondar(q[0])} ${arredondar(q[1])}`;
        elemento.setAttribute('d', `M${f(pontos[0])}L${f(pontos[1])}M${f(a)}L${f(pontos[1])}L${f(b)}`);
      } else {
        elemento.setAttribute('d', caminho(pontos));
      }
    }

    const TAG_DA_FORMA = { retangulo: 'rect', elipse: 'ellipse', linha: 'line' };

    function criarElemento(traco) {
      const p = document.createElementNS(NS, TAG_DA_FORMA[traco.t] || 'path');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', traco.c);
      p.setAttribute('stroke-width', String(traco.w));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      if (traco.t === 'marca') p.setAttribute('stroke-opacity', String(OPACIDADE_DA_MARCA));
      ajustarGeometria(p, traco);
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

      const largura = ESPESSURAS[listaDeEspessuras(ferramenta)][espessura];
      // Uma forma guarda so o inicio e o fim (comeca com os dois no mesmo ponto).
      atual = { t: ferramenta, c: cor, w: largura, p: FORMAS.includes(ferramenta) ? [[x, y], [x, y]] : [[x, y]] };
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
      if (FORMAS.includes(atual.t)) {
        atual.p[1] = evento.shiftKey ? comShift(atual.t, atual.p[0], [x, y]) : [x, y];
        ajustarGeometria(elementos.get(atual), atual);
        return;
      }
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
      // Um clique sem arrastar nao faz uma forma (so o ponto da caneta e valido).
      if (FORMAS.includes(traco.t) && Math.hypot(traco.p[1][0] - traco.p[0][0], traco.p[1][1] - traco.p[0][1]) < 3) {
        const solto = elementos.get(traco);
        if (solto) solto.remove();
        elementos.delete(traco);
        return;
      }
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
        if (!FERRAMENTAS.includes(valor)) return;
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

  window.Blink.tinta = { criar, ESPESSURAS, FORMAS };
})();
