/**
 * Lista de valores <-> IN (...).
 *
 *   ALFA           IN ('ALFA', 'BETA', 'GAMA')
 *   BETA     ->
 *   GAMA
 *
 * e o caminho de volta: um IN ('A', 'B') vira uma linha por valor.
 *
 * Puro, como o formatador-xml.js e o formatador-json.js. O que e delicado
 * aqui e o reconhecimento: o sql-formatter aceita QUALQUER texto (uma lista
 * de palavras ele "formata" achatando numa linha so), entao a bind nao pode
 * tratar como SQL tudo que nao for outra coisa - e tambem nao pode tratar
 * como lista um pedaco de SQL. Por isso a lista so e reconhecida quando o
 * texto tem cara de uma coluna de valores e nenhuma cara de SQL.
 */

const ASPA = "'";

/**
 * Comeco de uma instrucao SQL. Um texto que comeca assim nunca e lista.
 * Mesma ideia do PARECE_SQL do monitor-sql.js, so que mais larga: la so
 * importa o que se copia de um log, aqui vale qualquer coisa que se
 * selecione para formatar.
 */
const INICIO_SQL = new RegExp(
  '^\\s*(?:(?:SELECT|INSERT|UPDATE|DELETE|WITH|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXEC|EXECUTE|DECLARE|SET|BEGIN|IF|USE)(?![A-Za-z0-9_])|--|/\\*)',
  'i'
);

/** Palavras que estruturam uma SQL. Uma linha com mais de uma palavra e uma delas nao e valor. */
const PALAVRA_SQL = new RegExp(
  '(?:^|\\s)(?:select|from|where|and|or|join|on|group|order|having|union|as|set|values|when|then|case|between|like|is|not|null|in)(?:\\s|$)',
  'i'
);

/** Uma linha comprida demais para ser um valor: e frase, log ou codigo. */
const TAMANHO_MAXIMO = 120;

/** O texto comeca como uma instrucao SQL? */
function pareceSql(texto) {
  return INICIO_SQL.test(texto);
}

/** Um valor entre aspas simples, com pelo menos as duas aspas. */
function estaEntreAspas(valor) {
  return valor.length >= 2 && valor.startsWith(ASPA) && valor.endsWith(ASPA);
}

/** Separa a selecao em valores, ou devolve null se nao tem forma de coluna. */
function separarValores(texto) {
  const linhas = texto.split(/\r\n|\r|\n/);
  const cheias = linhas.filter((linha) => linha.trim() !== '');

  // Uma linha so, vinda do Excel: as celulas chegam separadas por tabulacao.
  if (cheias.length === 1) {
    return cheias[0].includes('\t') ? cheias[0].split('\t') : null;
  }

  // Varias linhas com tabulacao sao varias colunas, nao uma lista.
  if (cheias.some((linha) => linha.includes('\t'))) return null;

  return cheias;
}

/** Um valor com cara de pedaco de SQL, e nao de dado. */
function pareceFragmento(valor) {
  if (/[=<>;]/.test(valor)) return true;
  if (valor.length > TAMANHO_MAXIMO) return true;

  // Uma palavra sozinha (ON, OR, AS) pode ser um valor legitimo; so duas ou
  // mais palavras com uma palavra de SQL no meio e que parecem estrutura.
  const palavras = valor.split(/\s+/).filter(Boolean);
  return palavras.length >= 2 && PALAVRA_SQL.test(valor);
}

/**
 * Uma coluna de valores vira IN ('A', 'B').
 *
 * Devolve null quando o texto nao e uma lista: menos de dois valores, uma
 * instrucao SQL, ou qualquer valor com cara de fragmento de SQL. Todo valor
 * sai entre aspas simples, numero inclusive; aspa simples dentro do valor e
 * dobrada. Se todos ja vierem entre aspas, as aspas antigas saem antes -
 * senao virariam aspa dentro de aspa.
 */
function paraIn(texto) {
  if (pareceSql(texto)) return null;

  const separados = separarValores(texto);
  if (!separados) return null;

  let valores = separados.map((valor) => valor.trim()).filter((valor) => valor !== '');
  if (valores.length < 2) return null;

  if (valores.some(pareceFragmento)) return null;

  if (valores.every(estaEntreAspas)) {
    valores = valores.map((valor) => valor.slice(1, -1).split(ASPA + ASPA).join(ASPA));
  }

  const entreAspas = valores.map((valor) => ASPA + valor.split(ASPA).join(ASPA + ASPA) + ASPA);
  return `IN (${entreAspas.join(', ')})`;
}

/**
 * Le os literais de dentro dos parenteses de um IN: 'texto' (com '' para uma
 * aspa) ou numero, separados por virgula. Devolve a lista de valores, ou null
 * se aparecer qualquer outra coisa - uma subconsulta, uma coluna, uma funcao.
 */
function lerLiterais(interior) {
  const valores = [];
  let i = 0;

  const pularEspacos = () => {
    while (i < interior.length && /\s/.test(interior[i])) i++;
  };

  while (true) {
    pularEspacos();
    if (i >= interior.length) return null;

    if (interior[i] === ASPA) {
      let valor = '';
      i += 1;
      while (true) {
        if (i >= interior.length) return null;
        if (interior[i] === ASPA) {
          if (interior[i + 1] === ASPA) {
            valor += ASPA;
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        valor += interior[i];
        i += 1;
      }
      valores.push(valor);
    } else {
      const numero = /^-?[0-9]+(?:\.[0-9]+)?/.exec(interior.slice(i));
      if (!numero) return null;
      valores.push(numero[0]);
      i += numero[0].length;
    }

    pularEspacos();
    if (i >= interior.length) return valores;
    if (interior[i] !== ',') return null;
    i += 1;
  }
}

/**
 * IN ('A', 'B') vira uma linha por valor.
 *
 * A selecao INTEIRA tem que ser o IN (ou so os parenteses, se tiver dois
 * valores ou mais - "(1)" sozinho e SQL comum). "NOT IN" e uma subconsulta
 * dentro do IN nao entram: viram SQL e sao formatadas como sempre.
 */
function paraLinhas(texto) {
  const partes = /^\s*(IN\s*)?\(([\s\S]*)\)\s*;?\s*$/i.exec(texto);
  if (!partes) return null;

  const valores = lerLiterais(partes[2]);
  if (!valores) return null;

  const temIn = Boolean(partes[1]);
  if (!temIn && valores.length < 2) return null;

  return valores.join('\n');
}

module.exports = { pareceSql, paraIn, paraLinhas };
