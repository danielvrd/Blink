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
 */

const { diffLines } = require('diff');

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

/**
 * Emparelha um trecho removido com um trecho adicionado.
 *
 * Quando o usuario troca tres linhas por duas, o lado mais curto ganha uma
 * linha vazia no fim para os dois lados continuarem na mesma altura.
 */
function emparelhar(removidas, adicionadas, saida) {
  const total = Math.max(removidas.length, adicionadas.length);

  for (let i = 0; i < total; i++) {
    const esquerda = i < removidas.length ? removidas[i] : null;
    const direita = i < adicionadas.length ? adicionadas[i] : null;
    saida.push({ esquerda, direita, diferente: true });
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
      emparelhar(emLinhas(pedaco.value), emLinhas(pedacos[i + 1].value), linhas);
      i += 2;
      continue;
    }

    // Sozinho: so foi removido (nada do lado direito) ou so adicionado.
    if (pedaco.removed) {
      emparelhar(emLinhas(pedaco.value), [], linhas);
    } else {
      emparelhar([], emLinhas(pedaco.value), linhas);
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
