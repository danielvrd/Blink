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
const diagnostico = require('./diagnostico');
const formatadorXml = require('./formatador-xml');

/**
 * Evita dois formatadores rodando ao mesmo tempo.
 *
 * A bind e facil de apertar duas vezes seguidas. Sem isso, o segundo
 * disparo mexeria na area de transferencia no meio do primeiro e os dois
 * devolveriam conteudo trocado.
 */
let ocupado = false;

/**
 * Por quanto tempo vigiar a area de transferencia depois de gravar a SQL
 * formatada, e de quanto em quanto tempo olhar.
 */
const TEMPO_DE_GUARDA = 3000;
const INTERVALO_DA_GUARDA = 150;

/**
 * Qual guarda esta valendo. Cada formatacao nova troca o numero e a guarda
 * anterior percebe e para - senao duas guardas brigariam pela area de
 * transferencia, cada uma regravando a sua SQL.
 */
let guardaAtual = 0;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Protege a SQL formatada de ser atropelada pela copia remota.
 *
 * Numa Area de Trabalho Remota a copia do servidor pode chegar aqui atrasada
 * - depois de o Blink ja ter gravado a versao formatada - e sobrescrever com
 * a SQL crua. Por alguns segundos, se a area de transferencia voltar a ter
 * exatamente o texto cru, a formatada e gravada de novo.
 *
 * So age se o conteudo for exatamente o cru: se o usuario copiar outra
 * coisa nesse meio tempo, a guarda sai de cena e nao atropela nada.
 *
 * Nao e esperada por ninguem: roda em segundo plano, para a bind ficar livre
 * enquanto isso.
 */
async function guardarContraSobrescrita(cru, formatado) {
  const minha = ++guardaAtual;

  // Ja estava formatada: cru e formatado sao o mesmo texto, nao ha o que
  // proteger.
  if (cru === formatado) return 0;

  const fim = Date.now() + TEMPO_DE_GUARDA;
  let regravacoes = 0;

  while (Date.now() < fim && minha === guardaAtual) {
    await esperar(INTERVALO_DA_GUARDA);
    if (minha !== guardaAtual) break;

    const atual = await clipboard.readText();
    if (atual === cru) {
      await clipboard.writeText(formatado);
      regravacoes += 1;
    } else if (atual !== formatado) {
      // O usuario copiou outra coisa: nao e mais problema nosso.
      break;
    }
  }

  if (regravacoes > 0) diagnostico.registrar('sql-guarda', { regravacoes });
  return regravacoes;
}

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
    // Logs de aplicacao mostram a SQL com "?" no lugar dos valores. Sem isto
    // a biblioteca nao reconhece o "?" e recusa a SQL inteira.
    paramTypes: { positional: true },
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

/**
 * O caminho do XML: formata, grava na area de transferencia e avisa.
 *
 * XML quebrado ou cortado nao e gravado - a area de transferencia fica com o
 * que o usuario tinha, como no caso da SQL invalida.
 */
async function formatarComoXml(original) {
  const resultado = formatadorXml.formatarXml(original, config.obter('sql').indentacao);

  if (!resultado.ok) {
    aviso.mostrar('Não foi possível formatar: a seleção parece XML, mas não é um XML válido (pode estar cortado).');
    return;
  }

  await clipboard.writeText(resultado.texto);
  guardarContraSobrescrita(original, resultado.texto).catch((erro) => {
    console.warn('[ferramenta-sql] guarda falhou:', erro.message);
  });

  aviso.mostrar(
    resultado.texto === original.trim()
      ? 'O XML já estava formatado. Copiado para colar.'
      : 'XML formatado e copiado. Cole onde quiser com Ctrl + V.'
  );
}

/** O que a bind do SQL Formatter faz. */
async function executar() {
  if (ocupado) return;
  ocupado = true;

  try {
    const original = await selecao.capturar();

    if (original.trim() === '') {
      aviso.mostrar('Selecione uma SQL ou um XML antes de usar o atalho.');
      return;
    }

    // XML toma um desvio antes do SQL. Uma SQL nunca comeca com "<", entao
    // os dois caminhos nao se cruzam - e o do SQL, daqui para baixo, fica
    // exatamente como era.
    if (formatadorXml.pareceXml(original)) {
      await formatarComoXml(original);
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
    guardarContraSobrescrita(original, resultado.texto).catch((erro) => {
      console.warn('[ferramenta-sql] guarda falhou:', erro.message);
    });

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

module.exports = { executar, formatar, opcoes, guardarContraSobrescrita };
