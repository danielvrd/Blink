/**
 * SQL Formatter.
 *
 * Nao abre janela nenhuma. A bind pega a SQL selecionada, formata e deixa o
 * resultado na area de transferencia, pronto para colar.
 *
 * O arquivo de origem nao e tocado de proposito: a ideia e selecionar a SQL
 * onde ela esta, apertar a bind e colar a versao formatada em outro lugar.
 */

const { clipboard } = require('electron');
const { format } = require('sql-formatter');

const config = require('./config');
const selecao = require('./selecao');
const aviso = require('./aviso');

/**
 * Evita dois formatadores rodando ao mesmo tempo.
 *
 * A bind e facil de apertar duas vezes seguidas. Sem isso, o segundo
 * disparo mexeria na area de transferencia no meio do primeiro e os dois
 * devolveriam conteudo trocado.
 */
let ocupado = false;

/** Traduz as opcoes salvas para o que a sql-formatter espera. */
function opcoes() {
  const sql = config.obter('sql');

  return {
    language: sql.dialeto,
    keywordCase: sql.palavrasChave,
    // 'tab' nao e um numero de espacos: vira useTabs e o tabWidth passa a
    // ser so o tamanho visual da tabulacao.
    tabWidth: sql.indentacao === 'tab' ? 4 : Number(sql.indentacao),
    useTabs: sql.indentacao === 'tab',
  };
}

/**
 * Formata um texto. Devolve { ok, texto } ou { ok: false, erro }.
 *
 * Separado do executar() para dar para testar a formatacao sem mexer no
 * teclado nem na area de transferencia.
 */
function formatar(texto) {
  try {
    return { ok: true, texto: format(texto, opcoes()) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** O que a bind do SQL Formatter faz. */
async function executar() {
  if (ocupado) return;
  ocupado = true;

  try {
    const original = await selecao.capturar();

    if (original.trim() === '') {
      aviso.mostrar('Selecione uma SQL antes de usar o atalho.');
      return;
    }

    const resultado = formatar(original);

    // SQL invalida: nao mexe na area de transferencia, para nao atropelar o
    // que o usuario tinha copiado por causa de um erro de digitacao.
    if (!resultado.ok) {
      aviso.mostrar('Não foi possível formatar: a seleção não parece ser uma SQL válida.');
      return;
    }

    // O capturar() devolveu a area de transferencia ao que era antes; agora
    // ela passa a ser o resultado, que e o que o usuario vai colar.
    await clipboard.writeText(resultado.texto);

    // Sem este aviso a bind nao daria nenhum sinal de vida: o arquivo de
    // origem fica igual e a area de transferencia nao aparece na tela.
    aviso.mostrar(
      resultado.texto === original
        ? 'A SQL já estava formatada. Copiada para colar.'
        : 'SQL formatada e copiada. Cole onde quiser com Ctrl + V.'
    );
  } catch (erro) {
    console.error('[ferramenta-sql] falhou:', erro);
    aviso.mostrar('Algo deu errado ao formatar a SQL.');
    // Nao mexe na area de transferencia aqui: o capturar() ja devolveu ela
    // ao que era, mesmo tendo dado erro.
  } finally {
    ocupado = false;
  }
}

module.exports = { executar, formatar, opcoes };
