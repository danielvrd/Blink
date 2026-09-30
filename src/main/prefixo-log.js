/**
 * Prefixo de linha de log: "2026-09-28 10:00:01.123 [INFO] SELECT ...".
 *
 * Copiada assim, a linha inteira ia para o formatador de SQL, que trata a data
 * e a hora como se fossem SQL e devolve "2026 -09 -28 10: 00: 01". Aqui o
 * prefixo e separado: ele fica intacto numa linha, e so o resto e formatado.
 *
 * A regra e ESTREITA de proposito: so vale se a linha comeca com data e hora
 * e/ou nivel (INFO, DEBUG, ERRO...) E o que vem depois e claramente um
 * comando SQL, um XML ou um JSON valido. Texto livre com data
 * ("2026-09-28 ERRO ao executar select * from t") nao e tocado.
 *
 * Puro: sem Electron e sem area de transferencia.
 */

const formatadorXml = require('./formatador-xml');
const formatadorJson = require('./formatador-json');

// A hora e opcional na data ("2026-09-28 INFO select ..."), mas ai o nivel e obrigatorio (veja separar).
const DATA_HORA = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{2}/\\d{2}/\\d{4})(?:[ T]\\d{2}:\\d{2}(?::\\d{2}(?:[.,]\\d+)?)?)?';
const NIVEL = '(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|ERRO|FATAL)';
const TEM_HORA = /\d{2}:\d{2}/;
const TEM_NIVEL = new RegExp('\\b' + NIVEL + '\\b', 'i');
const SEPARADOR = '(?:\\s*[-:|]\\s*|\\s+)';

// [data hora] e/ou [nivel], cada um com ou sem colchetes, seguidos de separador.
const PREFIXO = new RegExp(
  '^\\s*((?:\\[?' + DATA_HORA + '\\]?' + SEPARADOR + ')?(?:\\[?' + NIVEL + '\\]?' + SEPARADOR + ')?)',
  'i'
);

/** Um comando de SQL logo no comeco (a mesma ideia do PARECE_SQL do monitor, com MERGE e EXEC). */
const COMANDO_SQL = /^(?:SELECT|INSERT|UPDATE|DELETE|WITH|MERGE|EXEC(?:UTE)?)(?![A-Za-z0-9_])/i;

/**
 * Separa o prefixo do log. Devolve { prefixo, resto } ou null quando o texto
 * nao tem um prefixo de log seguido de SQL, XML ou JSON.
 */
function separar(texto) {
  const achado = PREFIXO.exec(texto);
  if (!achado || achado[1].trim() === '') return null;

  // Uma data sozinha ("2026-09-28 select ...") nao basta: tem que ter hora ou nivel.
  if (!TEM_HORA.test(achado[1]) && !TEM_NIVEL.test(achado[1])) return null;

  const resto = texto.slice(achado[0].length);
  if (resto.trim() === '') return null;

  const ehSql = COMANDO_SQL.test(resto);
  const ehXml = !ehSql && formatadorXml.pareceXml(resto);
  // Um "{" ou "[" so conta se o JSON for valido - "[dbo].[t]" e nome de tabela.
  const ehJson = !ehSql && !ehXml && /^\s*[{[]/.test(resto) && formatadorJson.formatarJson(resto, '4').ok;
  if (!ehSql && !ehXml && !ehJson) return null;

  return { prefixo: achado[1].trim(), resto };
}

module.exports = { separar };
