/**
 * Monta a comparacao linha a linha entre dois textos.
 *
 * Nao mexe em janela nem em teclado: entra texto, sai uma lista de linhas
 * pronta para a tela desenhar. E a parte do Diff Checker que da para testar
 * sozinha.
 *
 * O formato de saida e uma linha por posicao da grade, com os dois lados:
 *
 *   { esquerda: 'texto', direita: 'texto', diferente: false }
 *
 * O lado que nao existe vem como null. Isso acontece quando uma linha foi
 * so adicionada ou so removida: o outro lado precisa de um espaco vazio,
 * senao tudo que vem depois sai desalinhado e a comparacao fica ilegivel.
 *
 * Uma linha alterada (existe dos dois lados) pode trazer tambem, opcionais,
 * os pedacos que mudaram DENTRO dela, para a tela destacar so eles:
 *
 *   partesEsquerda: [{ texto: 'SELECT a FROM ', mudou: false }, { texto: 'x', mudou: true }]
 *   partesDireita:  [{ texto: 'SELECT a FROM ', mudou: false }, { texto: 'y', mudou: true }]
 *
 * Os pedacos de cada lado, juntos, sao a linha inteira daquele lado.
 */

const { diffLines, diffWordsWithSpace } = require('diff');

/**
 * Limites do destaque dentro da linha. O diff de palavras e barato quando as
 * linhas se parecem, mas explode quando sao muito diferentes (perto de meio
 * segundo com 5000 caracteres, meio minuto com 20000) - e a comparacao roda
 * no processo principal, entao o destaque nunca pode travar o app.
 */
const TEMPO_POR_PAR = 60; // ms
const ORCAMENTO_TOTAL = 500; // ms, somando todos os pares de uma comparacao

/**
 * Acima disso, a linha mudou quase inteira: destacar quase tudo nao diz nada
 * (e o olho ja ve a linha laranja inteira).
 */
const MUDANCA_MAXIMA = 0.6;

/**
 * Quebra um bloco de texto em linhas.
 *
 * O diffLines devolve pedacos que terminam em quebra de linha, e o split
 * gera uma ultima linha vazia que nao existe de verdade.
 */
function emLinhas(bloco) {
  const linhas = bloco.split('\n');
  if (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas;
}

/**
 * Garante que o texto termina em quebra de linha.
 *
 * Sem isso o diffLines compara a ultima linha de um lado com a ultima do
 * outro como se fossem pedacos diferentes: comparar "a" com "a\nnovo"
 * acusaria o "a" como alterado, quando so o "novo" foi acrescentado. Texto
 * copiado de um editor quase nunca vem com quebra no fim, entao isso
 * apareceria em praticamente toda comparacao.
 *
 * Tambem normaliza a quebra do Windows: o mesmo texto vindo de programas
 * diferentes pode usar \r\n de um lado e \n do outro, e todas as linhas
 * apareceriam como diferentes sem nenhuma diferenca visivel na tela.
 */
function normalizar(texto) {
  const semRetorno = texto.replace(/\r\n/g, '\n');
  return semRetorno.endsWith('\n') ? semRetorno : semRetorno + '\n';
}

/** Junta pedacos vizinhos do mesmo tipo: "x", "=", "1" mudados viram um "x=1" so. */
function juntar(partes) {
  const juntas = [];
  for (const parte of partes) {
    const ultima = juntas[juntas.length - 1];
    if (ultima && ultima.mudou === parte.mudou) ultima.texto += parte.texto;
    else juntas.push({ texto: parte.texto, mudou: parte.mudou });
  }
  return juntas;
}

/**
 * Descobre o que mudou dentro de uma linha alterada.
 *
 * Devolve { partesEsquerda, partesDireita }, ou null quando nao vale destacar:
 * um dos lados vazio, o tempo acabou, ou a linha mudou quase toda.
 *
 * Usa diffWordsWithSpace: cada palavra, cada pontuacao e cada corrida de
 * espaco e um pedaco separado. O diffChars viraria confete em SQL, e o
 * diffWords ignora espaco (uma linha que so ganhou espaco ficaria sem nada
 * destacado).
 */
function pedacosDaLinha(esquerda, direita, prazo) {
  if (esquerda === '' || direita === '') return null;

  const restante = prazo.fim - Date.now();
  if (restante <= 0) return null;

  // Estourou o tempo: a biblioteca devolve undefined em vez de um resultado.
  const partes = diffWordsWithSpace(esquerda, direita, { timeout: Math.min(TEMPO_POR_PAR, restante) });
  if (!partes) return null;

  const doEsquerdo = [];
  const doDireito = [];
  let mudouNoEsquerdo = 0;
  let mudouNoDireito = 0;

  for (const parte of partes) {
    if (parte.removed) {
      doEsquerdo.push({ texto: parte.value, mudou: true });
      mudouNoEsquerdo += parte.value.length;
    } else if (parte.added) {
      doDireito.push({ texto: parte.value, mudou: true });
      mudouNoDireito += parte.value.length;
    } else {
      doEsquerdo.push({ texto: parte.value, mudou: false });
      doDireito.push({ texto: parte.value, mudou: false });
    }
  }

  const fracao = Math.max(mudouNoEsquerdo / esquerda.length, mudouNoDireito / direita.length);
  if (fracao > MUDANCA_MAXIMA) return null;

  return { partesEsquerda: juntar(doEsquerdo), partesDireita: juntar(doDireito) };
}

/**
 * Emparelha um trecho removido com um trecho adicionado.
 *
 * Quando o usuario troca tres linhas por duas, o lado mais curto ganha uma
 * linha vazia no fim para os dois lados continuarem na mesma altura.
 *
 * Os pares que existem dos dois lados ganham, quando vale a pena, os pedacos
 * que mudaram dentro da linha. O emparelhamento e por posicao, entao duas
 * linhas emparelhadas podem nem ter relacao - por isso o limite de quanto
 * pode ter mudado.
 */
function emparelhar(removidas, adicionadas, saida, prazo) {
  const total = Math.max(removidas.length, adicionadas.length);

  for (let i = 0; i < total; i++) {
    const esquerda = i < removidas.length ? removidas[i] : null;
    const direita = i < adicionadas.length ? adicionadas[i] : null;
    const linha = { esquerda, direita, diferente: true };

    if (esquerda !== null && direita !== null) {
      const pedacos = pedacosDaLinha(esquerda, direita, prazo);
      if (pedacos) Object.assign(linha, pedacos);
    }

    saida.push(linha);
  }
}

/**
 * Compara dois textos e devolve as linhas da grade.
 *
 * `a` e o texto da esquerda (o primeiro capturado) e `b` o da direita.
 */
function comparar(a, b) {
  const pedacos = diffLines(normalizar(a), normalizar(b));
  const linhas = [];
  const prazo = { fim: Date.now() + ORCAMENTO_TOTAL };

  let i = 0;
  while (i < pedacos.length) {
    const pedaco = pedacos[i];

    if (!pedaco.added && !pedaco.removed) {
      for (const texto of emLinhas(pedaco.value)) {
        linhas.push({ esquerda: texto, direita: texto, diferente: false });
      }
      i++;
      continue;
    }

    // Um trecho removido seguido de um adicionado e uma alteracao: os dois
    // lados mostram a mesma regiao do texto e ficam lado a lado.
    if (pedaco.removed && pedacos[i + 1] && pedacos[i + 1].added) {
      emparelhar(emLinhas(pedaco.value), emLinhas(pedacos[i + 1].value), linhas, prazo);
      i += 2;
      continue;
    }

    // Sozinho: so foi removido (nada do lado direito) ou so adicionado.
    if (pedaco.removed) {
      emparelhar(emLinhas(pedaco.value), [], linhas, prazo);
    } else {
      emparelhar([], emLinhas(pedaco.value), linhas, prazo);
    }
    i++;
  }

  return linhas;
}

/** Quantas linhas da comparacao tem diferenca. */
function contarDiferencas(linhas) {
  return linhas.filter((linha) => linha.diferente).length;
}

module.exports = { comparar, contarDiferencas };
