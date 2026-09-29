/**
 * Janela de comparacao do Diff Checker.
 *
 * Recebe do processo principal as linhas ja comparadas - cada uma com o
 * lado esquerdo, o direito e se sao diferentes - e cuida so do desenho e
 * dos cliques.
 *
 * Aplicar uma linha leva o texto da esquerda para a direita. O texto da
 * esquerda nunca muda: ele e a referencia.
 */

(function () {
  const { el, limpar } = window.Blink.ui;

  const corpo = document.getElementById('corpo');
  const grade = document.getElementById('grade');
  const regua = document.getElementById('regua');
  const botaoCopiar = document.getElementById('btn-copiar');
  const botaoFechar = document.getElementById('btn-fechar');

  /** As linhas vindas do processo principal. */
  let linhas = [];

  /** Quais linhas ja foram aplicadas, por indice. */
  const aplicadas = new Set();

  /** Qual linha esta escolhida agora, ou null. */
  let selecionada = null;

  /** Guarda os elementos de cada linha, para atualizar sem redesenhar tudo. */
  let celulas = [];

  /**
   * O texto que o lado direito mostra hoje.
   *
   * Depois de aplicada, a direita passa a ser o que estava na esquerda.
   * Pode ser null quando aquele lado nao existe - linha so adicionada de um
   * lado ou so removida do outro.
   */
  function textoDireita(indice) {
    const linha = linhas[indice];
    return aplicadas.has(indice) ? linha.esquerda : linha.direita;
  }

  /** Uma linha diferente que ainda nao foi aplicada pode ser escolhida. */
  function podeAplicar(indice) {
    return linhas[indice].diferente && !aplicadas.has(indice);
  }

  /** Atualiza as classes de uma linha depois de um clique. */
  function desenharLinha(indice) {
    const linha = linhas[indice];
    const { esquerda, calha, direita } = celulas[indice];
    const aplicada = aplicadas.has(indice);

    esquerda.className = 'celula';
    direita.className = 'celula';

    if (linha.esquerda === null) esquerda.classList.add('ausente');
    if (textoDireita(indice) === null) direita.classList.add('ausente');

    if (linha.diferente) {
      esquerda.classList.add('pendente');
      direita.classList.add(aplicada ? 'aplicada' : 'pendente');
    }

    if (podeAplicar(indice)) {
      esquerda.classList.add('clicavel');
      if (selecionada === indice) esquerda.classList.add('selecionada');
    }

    direita.textContent = textoDireita(indice) ?? '';

    limpar(calha);
    if (!linha.diferente) return;

    if (aplicada) {
      calha.appendChild(el('span', { class: 'confirmado', texto: '✓' }));
      return;
    }

    calha.appendChild(
      el('button', {
        class: selecionada === indice ? 'seta ativa' : 'seta',
        texto: '→',
        title: 'Levar esta linha para a direita',
        onclick: () => aplicar(indice),
      })
    );
  }

  /** Escolhe (ou desmarca) uma linha. */
  function escolher(indice) {
    if (!podeAplicar(indice)) return;

    const anterior = selecionada;
    selecionada = selecionada === indice ? null : indice;

    if (anterior !== null) desenharLinha(anterior);
    desenharLinha(indice);
  }

  /** Leva o texto da esquerda para a direita. */
  function aplicar(indice) {
    if (!podeAplicar(indice)) return;

    aplicadas.add(indice);
    selecionada = null;
    desenharLinha(indice);
    desenharRegua();
  }

  // --- Regua de diferencas --------------------------------------------------

  /** Posicao da linha dentro de tudo que rola, contando o respiro do topo. */
  function topoNaRolagem(celula) {
    return celula.offsetTop + parseFloat(getComputedStyle(corpo).paddingTop);
  }

  /**
   * Leva ate uma linha: rola deixando ela no meio da tela, faz piscar e, se
   * ainda da para aplicar, ja escolhe - assim a seta fica pronta para o
   * clique seguinte.
   */
  function irPara(indice) {
    const { esquerda, direita } = celulas[indice];
    const meio = topoNaRolagem(esquerda) + esquerda.offsetHeight / 2;
    corpo.scrollTo({ top: meio - corpo.clientHeight / 2, behavior: 'smooth' });

    for (const celula of [esquerda, direita]) {
      celula.classList.remove('piscando');
      // Forca o navegador a reiniciar a animacao se a linha ja estava piscando.
      void celula.offsetWidth;
      celula.classList.add('piscando');
    }

    if (podeAplicar(indice) && selecionada !== indice) escolher(indice);
  }

  /**
   * Desenha as marcas da regua.
   *
   * A regua tem a altura da barra de rolagem, que representa o texto
   * inteiro. Cada marca fica na mesma proporcao: uma diferenca no meio do
   * texto vira uma marca no meio da barra.
   *
   * Quando o texto cabe inteiro na tela nao ha barra - e nada escondido para
   * apontar - entao a regua some.
   */
  function desenharRegua() {
    limpar(regua);

    const total = corpo.scrollHeight;
    const cabeInteiro = total <= corpo.clientHeight + 1;
    regua.hidden = cabeInteiro;
    if (cabeInteiro) return;

    const alturaRegua = regua.clientHeight;

    linhas.forEach((linha, indice) => {
      if (!linha.diferente) return;

      const { esquerda } = celulas[indice];
      const topo = (topoNaRolagem(esquerda) / total) * alturaRegua;
      const altura = (esquerda.offsetHeight / total) * alturaRegua;

      const marcador = el('div', {
        class: aplicadas.has(indice) ? 'marcador aplicada' : 'marcador',
        title: aplicadas.has(indice) ? 'Aplicada' : 'Diferença',
        onclick: () => irPara(indice),
      });

      // Pela propriedade, e nao pelo atributo style: a politica de seguranca
      // da tela (Content-Security-Policy) bloqueia estilo escrito como texto
      // no HTML, mas deixa o JavaScript mexer nas propriedades.
      marcador.style.top = `${topo}px`;
      marcador.style.height = `${altura}px`;

      regua.appendChild(marcador);
    });
  }

  /**
   * Redesenha a regua quando algo muda de tamanho: a janela, ou a grade
   * porque o texto quebrou em mais linhas. Uma vez por quadro, no maximo -
   * redimensionar dispara dezenas de avisos seguidos.
   */
  let reguaAgendada = false;
  const observador = new ResizeObserver(() => {
    if (reguaAgendada) return;
    reguaAgendada = true;
    requestAnimationFrame(() => {
      reguaAgendada = false;
      desenharRegua();
    });
  });
  observador.observe(corpo);
  observador.observe(grade);

  /** Monta a grade inteira. */
  function desenhar() {
    limpar(grade);
    celulas = [];

    linhas.forEach((linha, indice) => {
      const esquerda = el('div', {
        class: 'celula',
        texto: linha.esquerda ?? '',
        onclick: () => escolher(indice),
      });
      const calha = el('div', { class: 'calha' });
      const direita = el('div', { class: 'celula' });

      celulas.push({ esquerda, calha, direita });
      grade.append(esquerda, calha, direita);

      desenharLinha(indice);
    });

    desenharRegua();
  }

  /**
   * Junta o lado direito inteiro, ja com as linhas aplicadas.
   *
   * As linhas sem lado direito ficam de fora: elas representam um trecho
   * que nao existe nesse lado, e colar uma linha em branco no lugar so
   * sujaria o resultado.
   */
  function textoCompletoDireita() {
    return linhas
      .map((_, indice) => textoDireita(indice))
      .filter((texto) => texto !== null)
      .join('\n');
  }

  botaoCopiar.addEventListener('click', async () => {
    await window.blink.areaTransferencia.escrever(textoCompletoDireita());

    botaoCopiar.textContent = 'Copiado ✓';
    setTimeout(() => {
      botaoCopiar.textContent = 'Copiar texto';
    }, 1400);
  });

  botaoFechar.addEventListener('click', () => window.blink.janela.fechar());

  // O olho: abre as configuracoes na aba do Diff Checker e fecha esta janela.
  document.getElementById('btn-olho').addEventListener('click', () => window.blink.janela.abrirPrincipal('diff'));

  window.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') window.blink.janela.fechar();
  });

  async function iniciar() {
    linhas = await window.blink.diff.linhas();
    desenhar();
  }

  iniciar();
})();
