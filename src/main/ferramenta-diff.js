/**
 * Diff Checker.
 *
 * A bind funciona em dois tempos:
 *
 *   1a vez  captura o texto selecionado e guarda aqui na memoria;
 *   2a vez  captura de novo, compara com o guardado e abre a janela.
 *
 * Ao abrir a janela o guardado e descartado, entao o proximo par de binds
 * comeca do zero. Sem isso o terceiro uso compararia com um texto velho.
 */

const comparador = require('./comparador');
const realce = require('./realce');
const selecao = require('./selecao');
const janelas = require('./janelas');
const aviso = require('./aviso');

/**
 * Por quanto tempo o primeiro texto continua valendo.
 *
 * Passou disso, a proxima bind volta a ser a primeira. E para o caso de
 * capturar um texto, se distrair, e meia hora depois comparar sem lembrar
 * com o que.
 */
const VALIDADE = 2 * 60 * 1000;

/** O primeiro texto: { texto, quando } ou null. */
let guardado = null;

/** Evita dois disparos ao mesmo tempo mexendo na area de transferencia. */
let ocupado = false;

/** Ha um primeiro texto guardado e ainda dentro da validade? */
function temGuardado() {
  return guardado !== null && Date.now() - guardado.quando < VALIDADE;
}

/** Descarta o primeiro texto. */
function limpar() {
  guardado = null;
}

/**
 * Compara dois textos e anexa as cores do codigo (se houver codigo) as linhas.
 *
 * O realce e um enfeite: se falhar por qualquer motivo, a comparacao abre do
 * mesmo jeito, sem cor.
 */
function compararComRealce(a, b, linguagem) {
  const linhas = comparador.comparar(a, b);
  try {
    realce.anexar(linhas, { linguagem });
  } catch (erro) {
    console.warn('[ferramenta-diff] realce falhou:', erro.message);
    for (const linha of linhas) {
      delete linha.tokensEsquerda;
      delete linha.tokensDireita;
    }
  }
  return linhas;
}


/** As linguagens da demonstracao, na ordem do seletor da janela. */
const LINGUAGENS_DO_EXEMPLO = ['javascript', 'sql', 'xml'];

/**
 * Pares de codigo para a demonstracao: servem para ver, no tema escolhido, como ficam as cores de cada
 * linguagem junto com as linhas mudadas, removidas e novas.
 */
const EXEMPLOS = {
  javascript: {
    esquerda: [
      '// Calcula o total do carrinho',
      'const IMPOSTO = 0.1;',
      '',
      'function totalDoCarrinho(itens) {',
      '  let total = 0;',
      '  for (const item of itens) {',
      '    total += item.preco * item.quantidade;',
      '  }',
      '  return total;',
      '}',
      '',
      'const carrinho = [',
      "  { nome: 'Camiseta', preco: 49.9, quantidade: 2 },",
      "  { nome: 'Bone', preco: 29.9, quantidade: 1 },",
      '];',
      '',
      "console.log('Total: ' + totalDoCarrinho(carrinho));",
    ].join('\n'),
    direita: [
      '// Calcula o total do carrinho, com imposto',
      'const IMPOSTO = 0.12;',
      '',
      'function totalDoCarrinho(itens) {',
      '  const subtotal = itens.reduce((soma, item) => soma + item.preco * item.quantidade, 0);',
      '  return subtotal * (1 + IMPOSTO);',
      '}',
      '',
      'const carrinho = [',
      "  { nome: 'Camiseta', preco: 49.9, quantidade: 2 },",
      "  { nome: 'Bone', preco: 29.9, quantidade: 1 },",
      "  { nome: 'Meia', preco: 9.9, quantidade: 3 },",
      '];',
      '',
      'console.log(`Total: ${totalDoCarrinho(carrinho).toFixed(2)}`);',
    ].join('\n'),
  },
  sql: {
    esquerda: [
      'SELECT c.IDCLIENTE,',
      '       c.NOME,',
      '       SUM(p.VALOR) AS TOTAL,',
      "       CASE WHEN SUM(p.VALOR) > 1000 THEN 'GOLD' ELSE 'COMUM' END AS NIVEL",
      'FROM CLIENTE c',
      'INNER JOIN PEDIDO p ON p.IDCLIENTE = c.IDCLIENTE',
      "WHERE p.DATA >= '2026-01-01'",
      '  AND p.STATUS = 1',
      'GROUP BY c.IDCLIENTE, c.NOME',
      'ORDER BY TOTAL DESC;',
    ].join('\n'),
    direita: [
      'SELECT c.IDCLIENTE,',
      '       c.NOME,',
      '       SUM(p.VALOR) AS TOTAL,',
      "       CASE WHEN SUM(p.VALOR) > 5000 THEN 'PLATINA'",
      "            WHEN SUM(p.VALOR) > 1000 THEN 'GOLD'",
      "            ELSE 'COMUM' END AS NIVEL",
      'FROM CLIENTE c',
      'INNER JOIN PEDIDO p ON p.IDCLIENTE = c.IDCLIENTE',
      "WHERE p.DATA >= '2026-07-01'",
      '  AND p.STATUS IN (1, 2)',
      'GROUP BY c.IDCLIENTE, c.NOME',
      'HAVING COUNT(*) > 1',
      'ORDER BY TOTAL DESC;',
    ].join('\n'),
  },
  xml: {
    esquerda: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<pedido numero="1042" status="aberto">',
      '  <!-- dados do cliente -->',
      '  <cliente id="77">',
      '    <nome>Maria Souza</nome>',
      '    <email>maria@exemplo.com</email>',
      '  </cliente>',
      '  <itens>',
      '    <item sku="A-10" quantidade="2">Camiseta</item>',
      '    <item sku="B-20" quantidade="1">Bone</item>',
      '  </itens>',
      '</pedido>',
    ].join('\n'),
    direita: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<pedido numero="1042" status="pago">',
      '  <!-- dados do cliente -->',
      '  <cliente id="77">',
      '    <nome>Maria de Souza</nome>',
      '    <email>maria@exemplo.com</email>',
      '    <telefone>11 99999-0000</telefone>',
      '  </cliente>',
      '  <itens>',
      '    <item sku="A-10" quantidade="2">Camiseta</item>',
      '    <item sku="C-30" quantidade="3">Meia</item>',
      '  </itens>',
      '</pedido>',
    ].join('\n'),
  },
};

/** O que a bind do Diff Checker faz. */
async function executar() {
  if (ocupado) return;
  ocupado = true;

  try {
    const texto = await selecao.capturar();

    if (texto.trim() === '') {
      aviso.mostrar('Selecione um texto antes de usar o atalho.');
      return;
    }

    // Primeira bind (ou a anterior ja venceu): so guarda e avisa.
    if (!temGuardado()) {
      guardado = { texto, quando: Date.now() };
      aviso.mostrar('1º texto capturado — selecione o segundo e use o atalho de novo.');
      return;
    }

    const primeiro = guardado.texto;

    // A comparacao comeca agora, entao o guardado ja cumpriu o papel. Limpar
    // aqui e nao depois garante que o proximo par comeca limpo mesmo que
    // abrir a janela de errado.
    limpar();

    if (primeiro === texto) {
      aviso.mostrar('Os dois textos são iguais. Nada para comparar.');
      return;
    }

    janelas.abrirDiff(compararComRealce(primeiro, texto));
  } catch (erro) {
    console.error('[ferramenta-diff] falhou:', erro);
    aviso.mostrar('Algo deu errado ao comparar os textos.');
    limpar();
  } finally {
    ocupado = false;
  }
}

/**
 * Abre a janela com um exemplo pronto, sem capturar nada.
 *
 * E o botao "Abrir demonstracao" da aba: serve para ver como a comparacao fica, testar o aplicar linha a linha
 * e - com codigo de verdade - conferir as cores do tema escolhido. A janela tem um seletor de linguagem
 * (JavaScript, SQL e XML) que chama esta funcao de novo.
 */
function abrirExemplo(linguagem = 'javascript') {
  const nome = LINGUAGENS_DO_EXEMPLO.includes(linguagem) ? linguagem : 'javascript';
  const { esquerda, direita } = EXEMPLOS[nome];
  janelas.abrirDiff(compararComRealce(esquerda, direita, nome), { exemplo: nome });
}

module.exports = { executar, abrirExemplo, temGuardado, limpar, compararComRealce, LINGUAGENS_DO_EXEMPLO };
