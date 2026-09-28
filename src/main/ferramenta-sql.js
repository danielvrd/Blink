/**
 * SQL Formatter.
 *
 * No uso real nao abre janela nenhuma: a bind pega a SQL selecionada,
 * formata e devolve o texto formatado no lugar da selecao.
 */

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

    // SQL invalida: nao cola nada e deixa a selecao como estava.
    if (!resultado.ok) {
      aviso.mostrar('Não foi possível formatar: a seleção não parece ser uma SQL válida.');
      return;
    }

    // Ja estava formatada. Colar de novo so sujaria o historico de desfazer
    // do editor sem mudar uma virgula.
    if (resultado.texto === original) return;

    await selecao.substituir(resultado.texto);
  } catch (erro) {
    console.error('[ferramenta-sql] falhou:', erro);
    aviso.mostrar('Algo deu errado ao formatar a SQL.');
  } finally {
    ocupado = false;
  }
}

module.exports = { executar, formatar, opcoes };
