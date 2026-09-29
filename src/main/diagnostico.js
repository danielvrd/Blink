/**
 * Log de diagnostico em %APPDATA%\Blink\blink.log.
 *
 * Uma linha por captura de selecao e por formatacao de SQL: quanto tempo o
 * texto levou para chegar, de que janela veio, se foi preciso regravar. E o
 * que permite entender, na maquina de quem usa, um problema que nao da para
 * reproduzir aqui - como a Area de Trabalho Remota.
 *
 * Nunca grava o CONTEUDO copiado, so o tamanho: uma SQL de log de servidor
 * pode ter dado de cliente.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** Passou disso, o log atual vira blink.log.1 e comeca um novo. */
const TAMANHO_MAXIMO = 200 * 1024;

function caminho() {
  return path.join(app.getPath('userData'), 'blink.log');
}

/** Valor legivel numa linha so: texto entre aspas, sem quebra de linha. */
function formatarValor(valor) {
  if (typeof valor === 'string') return JSON.stringify(valor.replace(/\s+/g, ' '));
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  return String(valor);
}

/**
 * Acrescenta uma linha ao log.
 *
 *   registrar('captura', { remoto: true, ms: 1240, caracteres: 523 })
 *
 * vira
 *
 *   2026-09-28T13:31:02.114Z | captura | remoto=sim | ms=1240 | caracteres=523
 *
 * Falhar ao gravar o log nunca pode derrubar a ferramenta: qualquer erro
 * aqui e engolido.
 */
function registrar(evento, campos = {}) {
  try {
    const arquivo = caminho();

    try {
      if (fs.statSync(arquivo).size > TAMANHO_MAXIMO) {
        fs.renameSync(arquivo, `${arquivo}.1`);
      }
    } catch (erro) {
      // Arquivo ainda nao existe: nada para girar.
    }

    const partes = [new Date().toISOString(), evento];
    for (const [chave, valor] of Object.entries(campos)) {
      partes.push(`${chave}=${formatarValor(valor)}`);
    }

    fs.appendFileSync(arquivo, partes.join(' | ') + '\n', 'utf8');
  } catch (erro) {
    console.warn('[diagnostico] nao consegui gravar o log:', erro.message);
  }
}

module.exports = { registrar, caminho };
