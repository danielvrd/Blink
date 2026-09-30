/**
 * Janela de comparacao do Diff Checker.
 *
 * Recebe do processo principal as linhas ja comparadas - cada uma com o
 * lado esquerdo, o direito e se sao diferentes - e cuida so do desenho e
 * dos cliques.
 *
 * Cada linha diferente pode ser levada nos DOIS sentidos: da esquerda para a
 * direita (a direita passa a ser igual a esquerda) ou da direita para a
 * esquerda. Os dois lados podem mudar, e o botao "Copiar" de cada lado copia
 * o que aquele lado mostra. Uma linha aplicada pode ser desfeita.
 */

(function () {
  const { el, limpar } = window.Blink.ui;

  const corpo = document.getElementById('corpo');
  const grade = document.getElementById('grade');
  const regua = document.getElementById('regua');
  const botaoCopiarEsquerda = document.getElementById('btn-copiar-esquerda');
  const botaoCopiarDireita = document.getElementById('btn-copiar-direita');
  const botaoFechar = document.getElementById('btn-fechar');

  /** As linhas vindas do processo principal. Nunca mudam: sao o original. */
  let linhas = [];

  /**
   * Quais linhas ja foram aplicadas, por indice, e para que lado:
   *
   *   'dir'  esquerda -> direita: a direita passou a ser igual a esquerda
   *   'esq'  direita -> esquerda: a esquerda passou a ser igual a direita
   */
  const aplicadas = new Map();

  /** A linha escolhida agora e o sentido que o clique indicou, ou null. */
  let selecionada = null;

  /** Guarda os elementos de cada linha, para atualizar sem redesenhar tudo. */
  let celulas = [];

  /**
   * O texto que o lado direito mostra hoje.
   *
   * Aplicada para a direita, ele passa a ser o que estava na esquerda. Pode
   * ser null quando aquele lado nao existe - linha so adicionada de um lado
   * ou so removida do outro.
   */
  function textoDireita(indice) {
    const linha = linhas[indice];
    return aplicadas.get(indice) === 'dir' ? linha.esquerda : linha.direita;
  }

  /** O mesmo para o lado esquerdo: aplicada para a esquerda, vira o da direita. */
  function textoEsquerda(indice) {
    const linha = linhas[indice];
    return aplicadas.get(indice) === 'esq' ? linha.direita : linha.esquerda;
  }

  /** Uma linha diferente que ainda nao foi aplicada pode ser escolhida. */
  function podeAplicar(indice) {
    return linhas[indice].diferente && !aplicadas.has(indice);
  }

  /**
   * Escreve o texto de uma celula.
   *
   * Com `partes` (o que mudou dentro da linha, vindo do comparador), os
   * pedacos mudados ganham um <span class="mudou"> e o resto fica como texto.
   * Sempre por textContent e nos de texto, nunca por innerHTML: uma SQL tem
   * "<" e "&" que nao podem virar HTML.
   */
  function escrever(celula, texto, partes) {
    if (!partes || texto === null) {
      celula.textContent = texto ?? '';
      return;
    }

    limpar(celula);
    for (const parte of partes) {
      celula.appendChild(
        parte.mudou ? el('span', { class: 'mudou', texto: parte.texto }) : document.createTextNode(parte.texto)
      );
    }
  }

  /** Atualiza as classes e o texto de uma linha depois de um clique. */
  function desenharLinha(indice) {
    const linha = linhas[indice];
    const { esquerda, calha, direita } = celulas[indice];
    const sentido = aplicadas.get(indice);
    const escolhida = selecionada && selecionada.indice === indice ? selecionada.sentido : null;

    esquerda.className = 'celula';
    direita.className = 'celula';

    if (textoEsquerda(indice) === null) esquerda.classList.add('ausente');
    if (textoDireita(indice) === null) direita.classList.add('ausente');

    // O lado que recebeu a linha fica verde; o de origem continua laranja.
    if (linha.diferente) {
      esquerda.classList.add(sentido === 'esq' ? 'aplicada' : 'pendente');
      direita.classList.add(sentido === 'dir' ? 'aplicada' : 'pendente');
    }

    if (podeAplicar(indice)) {
      esquerda.classList.add('clicavel');
      direita.classList.add('clicavel');
      if (escolhida === 'dir') esquerda.classList.add('selecionada');
      if (escolhida === 'esq') direita.classList.add('selecionada');
    }

    // So destaca o que mudou dentro da linha enquanto ela esta pendente: depois
    // de aplicada os dois lados mostram o mesmo texto, e os pedacos calculados
    // para o par original nao descrevem mais o que esta na tela.
    const pendente = sentido === undefined;
    escrever(esquerda, textoEsquerda(indice), pendente ? linha.partesEsquerda : null);
    escrever(direita, textoDireita(indice), pendente ? linha.partesDireita : null);

    limpar(calha);
    if (!linha.diferente) return;

    if (sentido) {
      calha.appendChild(
        el('button', {
          class: 'confirmado',
          texto: '✓',
          title: 'Desfazer: a linha volta a ser uma diferença',
          onclick: () => desfazer(indice),
        })
      );
      return;
    }

    calha.append(
      el('button', {
        class: escolhida === 'esq' ? 'seta seta-esq ativa' : 'seta seta-esq',
        texto: '←',
        title: 'Levar esta linha para a esquerda',
        onclick: () => aplicar(indice, 'esq'),
      }),
      el('button', {
        class: escolhida === 'dir' ? 'seta seta-dir ativa' : 'seta seta-dir',
        texto: '→',
        title: 'Levar esta linha para a direita',
        onclick: () => aplicar(indice, 'dir'),
      })
    );
  }

  /**
   * Escolhe (ou desmarca) uma linha. Clicar na esquerda acende a seta para a
   * direita, e vice-versa: o clique diz de que lado a linha sai.
   */
  function escolher(indice, sentido) {
    if (!podeAplicar(indice)) return;

    const anterior = selecionada;
    const mesma = anterior && anterior.indice === indice && anterior.sentido === sentido;
    selecionada = mesma ? null : { indice, sentido };

    if (anterior) desenharLinha(anterior.indice);
    desenharLinha(indice);
  }

  /** Leva a linha para um lado: 'dir' (esquerda -> direita) ou 'esq'. */
  function aplicar(indice, sentido) {
    if (!podeAplicar(indice)) return;

    aplicadas.set(indice, sentido);
    selecionada = null;
    desenharLinha(indice);
    desenharRegua();
  }

  /** Desfaz uma linha aplicada: os dois lados voltam ao original. */
  function desfazer(indice) {
    if (!aplicadas.has(indice)) return;

    aplicadas.delete(indice);
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

    // Ja escolhe no sentido de sempre (esquerda -> direita); quem quiser o
    // outro sentido clica na celula da direita ou na outra seta.
    const jaEscolhida = selecionada && selecionada.indice === indice;
    if (podeAplicar(indice) && !jaEscolhida) escolher(indice, 'dir');
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
        onclick: () => escolher(indice, 'dir'),
      });
      const calha = el('div', { class: 'calha' });
      const direita = el('div', {
        class: 'celula',
        onclick: () => escolher(indice, 'esq'),
      });

      celulas.push({ esquerda, calha, direita });
      grade.append(esquerda, calha, direita);

      desenharLinha(indice);
    });

    desenharRegua();
  }

  /**
   * Junta um lado inteiro ('esquerda' ou 'direita'), ja com as linhas
   * aplicadas.
   *
   * As linhas sem aquele lado ficam de fora: elas representam um trecho que
   * nao existe nele, e colar uma linha em branco no lugar so sujaria o
   * resultado.
   */
  function textoCompleto(lado) {
    const textoDoLado = lado === 'esquerda' ? textoEsquerda : textoDireita;
    return linhas
      .map((_, indice) => textoDoLado(indice))
      .filter((texto) => texto !== null)
      .join('\n');
  }

  /** Liga um botao "Copiar" a um lado; o aviso "Copiado" volta ao rotulo dele. */
  function ligarCopiar(botao, lado) {
    const rotulo = botao.textContent;

    botao.addEventListener('click', async () => {
      await window.blink.areaTransferencia.escrever(textoCompleto(lado));

      botao.textContent = 'Copiado ✓';
      setTimeout(() => {
        botao.textContent = rotulo;
      }, 1400);
    });
  }

  ligarCopiar(botaoCopiarEsquerda, 'esquerda');
  ligarCopiar(botaoCopiarDireita, 'direita');

  botaoFechar.addEventListener('click', () => window.blink.janela.fechar());
  // Minimizar vai para a barra de tarefas; a janela volta pelo icone ou pela bind.
  document.getElementById('btn-minimizar').addEventListener('click', () => window.blink.janela.minimizar());

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
