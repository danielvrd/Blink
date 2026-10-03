/**
 * As abas do Fast Note: o que fica aberto de uma vez para a outra (como o Bloco de Notas do Windows 11).
 *
 *   config.abasNota   { abertas: [{ tipo: 'arquivo', nome } | { tipo: 'rapida', id }], ativa }   - so nomes e ids
 *   abas-rapidas.json o TEXTO das abas rapidas ainda nao salvas, na pasta de dados do Blink (%APPDATA%\Blink)
 *
 * O texto de uma aba rapida nunca vai para a pasta de notas, para o config.json nem para o log: e um rascunho que o
 * usuario ainda nao decidiu guardar, e fica separado de tudo. Uma aba rapida com texto sobrevive a fechar a janela e
 * a reiniciar o Blink; some quando o usuario salva (ela vira um arquivo), fecha a aba ou diz "Nao salvar".
 *
 * Quem decide o que e uma aba valida e este modulo: a tela manda o estado inteiro e ele confere cada campo.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const config = require('./config');

const MAXIMO_DE_ABAS = 40;
const LIMITE_POR_ABA = 5 * 1024 * 1024;
const LIMITE_TOTAL = 20 * 1024 * 1024;
const ID_VALIDO = /^[0-9a-f-]{8,40}$/i;

/** Onde ficam os textos das abas rapidas. */
function caminhoDosTextos() {
  return path.join(app.getPath('userData'), 'abas-rapidas.json');
}

/** Confere o estado que a tela mandou e devolve a versao limpa, ou null se nao serve. */
function validar(estado) {
  if (!estado || typeof estado !== 'object' || !Array.isArray(estado.abertas) || estado.abertas.length > MAXIMO_DE_ABAS) return null;

  const abertas = [];
  for (const aba of estado.abertas) {
    if (!aba || typeof aba !== 'object') return null;
    if (aba.tipo === 'arquivo' && typeof aba.nome === 'string' && aba.nome.length > 0 && aba.nome.length <= 255) {
      abertas.push({ tipo: 'arquivo', nome: aba.nome });
    } else if (aba.tipo === 'rapida' && typeof aba.id === 'string' && ID_VALIDO.test(aba.id)) {
      abertas.push({ tipo: 'rapida', id: aba.id });
    } else {
      return null;
    }
  }

  const ativa = typeof estado.ativa === 'string' && estado.ativa.length <= 255 ? estado.ativa : '';

  // Os textos: so os das abas rapidas abertas, cada um uma string dentro do limite.
  const rapidas = {};
  let total = 0;
  const textos = estado.rapidas && typeof estado.rapidas === 'object' && !Array.isArray(estado.rapidas) ? estado.rapidas : {};
  for (const aba of abertas) {
    if (aba.tipo !== 'rapida') continue;
    const texto = textos[aba.id];
    if (texto === undefined) continue;
    if (typeof texto !== 'string') return null;
    const tamanho = Buffer.byteLength(texto, 'utf8');
    total += tamanho;
    if (tamanho > LIMITE_POR_ABA || total > LIMITE_TOTAL) return null;
    rapidas[aba.id] = texto;
  }
  return { abertas, ativa, rapidas };
}

/** O que ficou aberto: { abertas, ativa, rapidas } (vazio na primeira vez ou se um arquivo estiver estragado). */
function lerEstado() {
  const salvo = config.obter('abasNota') || {};
  let rapidas = {};
  try {
    const bruto = JSON.parse(fs.readFileSync(caminhoDosTextos(), 'utf8'));
    if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) rapidas = bruto;
  } catch (erro) { /* sem abas rapidas guardadas */ }
  return validar({ abertas: salvo.abertas || [], ativa: salvo.ativa || '', rapidas }) || { abertas: [], ativa: '', rapidas: {} };
}

/** Grava o arquivo dos textos por inteiro (temporario + rename). */
function gravarTextos(rapidas) {
  const completo = caminhoDosTextos();
  if (Object.keys(rapidas).length === 0) {
    try { fs.rmSync(completo, { force: true }); } catch (erro) { /* nada a fazer */ }
    return;
  }
  fs.mkdirSync(path.dirname(completo), { recursive: true });
  const temporario = `${completo}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(rapidas), 'utf8');
  fs.renameSync(temporario, completo);
}

/** Grava o estado das abas. Devolve true se gravou. */
function salvarEstado(estado) {
  const limpo = validar(estado);
  if (!limpo) return false;
  try {
    gravarTextos(limpo.rapidas);
    config.definirAbasNota({ abertas: limpo.abertas, ativa: limpo.ativa });
    return true;
  } catch (erro) {
    console.warn('[abas] nao gravou:', erro.message);
    return false;
  }
}

module.exports = { lerEstado, salvarEstado, validar, caminhoDosTextos, MAXIMO_DE_ABAS, LIMITE_POR_ABA };
