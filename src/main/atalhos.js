/**
 * Atalhos globais (as "binds").
 *
 * Global quer dizer que valem no Windows inteiro, com o Blink escondido na
 * bandeja e outro programa em primeiro plano.
 *
 * Um detalhe importante do Electron: globalShortcut.register devolve false em
 * silencio quando outro programa ja tomou aquela combinacao. Sem checar esse
 * retorno, a bind simplesmente nao funcionaria e nada explicaria o porque.
 * Por isso guardamos o resultado de cada registro e mandamos para a tela.
 */

const { globalShortcut } = require('electron');
const config = require('./config');

const FERRAMENTAS = ['diff', 'note', 'sql'];

/** Qual bind conseguiu se registrar: { diff: true, note: false, sql: true }. */
let situacao = {};

/** O que fazer quando uma bind e pressionada. Definido pelo main.js. */
let aoDisparar = () => {};

function definirAcao(callback) {
  aoDisparar = callback;
}

/** Tenta registrar uma bind. Devolve true se conseguiu. */
function registrarUma(nome, acelerador) {
  try {
    return globalShortcut.register(acelerador, () => aoDisparar(nome));
  } catch (erro) {
    // register() lanca excecao quando o acelerador nem sequer e valido.
    console.warn(`[atalhos] acelerador invalido para ${nome}: "${acelerador}"`, erro.message);
    return false;
  }
}

/**
 * Registra as tres binds do zero.
 *
 * Sempre limpa tudo antes: e mais simples e mais seguro do que tentar
 * descobrir o que mudou desde a ultima vez.
 */
function registrarTodas() {
  globalShortcut.unregisterAll();

  const binds = config.obter('binds');
  situacao = {};

  for (const nome of FERRAMENTAS) {
    situacao[nome] = registrarUma(nome, binds[nome]);
    if (!situacao[nome]) {
      console.warn(`[atalhos] "${binds[nome]}" (${nome}) ja esta em uso por outro programa`);
    }
  }

  return situacao;
}

/** Como esta cada bind agora, sem registrar de novo. */
function obterSituacao() {
  return situacao;
}

/**
 * Troca a bind de uma ferramenta.
 *
 * Devolve { ok, motivo }:
 *   ok: true               gravou e registrou
 *   motivo: 'ferramenta'   o nome da ferramenta nao existe
 *   motivo: 'vazio'        veio um acelerador vazio
 *   motivo: 'duplicado'    outra ferramenta do Blink ja usa essa combinacao
 *   motivo: 'em-uso'       outro programa do Windows ja tomou essa combinacao
 */
function definirBind(nome, acelerador) {
  if (!FERRAMENTAS.includes(nome)) {
    return { ok: false, motivo: 'ferramenta' };
  }

  if (typeof acelerador !== 'string' || acelerador.trim() === '') {
    return { ok: false, motivo: 'vazio' };
  }

  const binds = config.obter('binds');

  // Conflito com outra bind do proprio Blink: recusa antes de gravar, senao
  // as duas ferramentas ficariam presas na mesma combinacao.
  const jaUsadaPor = FERRAMENTAS.find((f) => f !== nome && binds[f] === acelerador);
  if (jaUsadaPor) {
    return { ok: false, motivo: 'duplicado', ferramenta: jaUsadaPor };
  }

  const anterior = binds[nome];
  config.definir(`binds.${nome}`, acelerador);
  registrarTodas();

  // Outro programa do Windows ficou com a combinacao: desfaz a troca para nao
  // deixar o usuario com uma bind gravada que nunca vai disparar.
  if (!situacao[nome]) {
    config.definir(`binds.${nome}`, anterior);
    registrarTodas();
    return { ok: false, motivo: 'em-uso' };
  }

  return { ok: true };
}

/** Solta todas as binds. Chamado quando o app encerra. */
function liberarTodas() {
  globalShortcut.unregisterAll();
}

module.exports = {
  FERRAMENTAS,
  definirAcao,
  registrarTodas,
  obterSituacao,
  definirBind,
  liberarTodas,
};
