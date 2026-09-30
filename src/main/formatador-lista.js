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

/**
 * Palavras com que uma linha de mais de uma palavra COMECA quando ela e um
 * pedaco de SQL, e nao um valor: "and ativo", "ELSE 0", "on a.id = b.id".
 * Uma palavra sozinha (ON, OR, END) continua sendo um valor legitimo.
 */
const COMECO_SQL = new RegExp(
  '^(?:select|from|where|and|or|join|on|group|order|having|union|as|set|values|when|then|case|between|like|is|not|null|in|else|end|inner|left|right|full|cross|outer|by|distinct|exists)(?![A-Za-z0-9_])',
  'i'
);

/**
 * Palavras que estruturam uma consulta e nao aparecem no MEIO de um valor:
 * "nome like 'x'", "idade is null". Ja "and", "or", "in", "on" e "as" ficam de
 * fora de proposito - "Black or White", "Paid in full" e "Shipped on time" sao
 * valores comuns.
 */
const PALAVRA_FORTE = new RegExp(
  '(?:^|\\s)(?:select|from|where|join|group|order|having|union|set|values|when|then|case|between|like|is|null)(?:\\s|$)',
  'i'
);

/** Tipos de dado: "ID INT", "NOME VARCHAR(50)" e uma definicao de coluna, nao um valor. */
const TIPO_DE_DADO = new RegExp(
  '^(?:int|integer|bigint|smallint|tinyint|bit|decimal|numeric|float|real|money|smallmoney|varchar|nvarchar|char|nchar|text|ntext|date|datetime|datetime2|smalldatetime|time|timestamp|uniqueidentifier|varbinary|binary|image|xml|number|varchar2|nvarchar2|clob|blob|boolean|bool|double|serial|uuid|json|jsonb)$',
  'i'
);

/** Uma linha comprida demais para ser um valor: e frase, log ou codigo. */
const TAMANHO_MAXIMO = 120;

/** Nome de coluna: letra ou "_" no comeco, sem espaco, com ou sem "alias." na frente. */
const IDENTIFICADOR = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Numero, como o IN aceita: -3, 2.5. */
const NUMERO = /^-?[0-9]+(?:\.[0-9]+)?$/;

/** O texto comeca como uma instrucao SQL? */
function pareceSql(texto) {
  return INICIO_SQL.test(texto);
}

/** Um valor entre aspas simples, com pelo menos as duas aspas. */
function estaEntreAspas(valor) {
  return valor.length >= 2 && valor.startsWith(ASPA) && valor.endsWith(ASPA);
}

/**
 * Uma linha so com valores separados por virgula: 1, 2, 3 ou 'A', 'B'. So vale
 * se TODOS forem numeros ou textos entre aspas - "a.id, b.nome" e uma lista de
 * colunas, e continua sendo SQL. Devolve os valores ou null.
 */
function separarPorVirgula(linha) {
  const valores = [];
  let atual = '';
  let dentroDeTexto = false;

  for (const c of linha) {
    if (c === ASPA) dentroDeTexto = !dentroDeTexto;
    if (c === ',' && !dentroDeTexto) {
      valores.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  if (dentroDeTexto) return null;
  valores.push(atual.trim());

  if (valores.length < 2) return null;
  const legitimo = (valor) => NUMERO.test(valor) || estaEntreAspas(valor);
  return valores.every(legitimo) ? valores : null;
}

/**
 * Tira as virgulas que sobram quando a coluna foi copiada de uma lista
 * ("A," / "B," / "C"): no fim de cada linha, ou no comeco de cada uma menos a
 * primeira (o estilo ", B"). So mexe se o padrao for o mesmo em todas.
 */
function tirarVirgulas(linhas) {
  const menosUltima = linhas.slice(0, -1);
  if (menosUltima.every((l) => l.trim().endsWith(','))) {
    return { valores: linhas.map((l) => l.trim().replace(/,$/, '').trim()), tinhaVirgula: true };
  }
  const menosPrimeira = linhas.slice(1);
  if (menosPrimeira.every((l) => l.trim().startsWith(','))) {
    return { valores: linhas.map((l, i) => (i === 0 ? l.trim() : l.trim().replace(/^,/, '').trim())), tinhaVirgula: true };
  }
  return { valores: linhas, tinhaVirgula: false };
}

/**
 * Separa a selecao em valores, ou devolve null se nao tem forma de coluna.
 * "tinhaVirgula" diz que as linhas terminavam (ou comecavam) com virgula.
 */
function separarValores(texto) {
  const linhas = texto.split(/\r\n|\r|\n/);
  const cheias = linhas.filter((linha) => linha.trim() !== '');

  // Uma linha so: do Excel (celulas separadas por tabulacao) ou com virgulas.
  if (cheias.length === 1) {
    if (cheias[0].includes('\t')) return { valores: cheias[0].split('\t'), tinhaVirgula: false };
    const porVirgula = separarPorVirgula(cheias[0]);
    return porVirgula ? { valores: porVirgula, tinhaVirgula: false } : null;
  }

  // Varias linhas com tabulacao sao varias colunas, nao uma lista.
  if (cheias.some((linha) => linha.includes('\t'))) return null;

  return tirarVirgulas(cheias);
}

/** "ID INT", "NOME VARCHAR(50)", "X NOT NULL": definicao de coluna, nao valor. */
function pareceDefinicaoDeColuna(palavras, valor) {
  if (/(?:^|\s)not\s+null(?:\s|$)/i.test(valor) || /(?:^|\s)primary\s+key(?:\s|$)/i.test(valor)) return true;
  const segunda = palavras[1].replace(/\(.*$/, '');
  return TIPO_DE_DADO.test(segunda);
}

/** Um valor com cara de pedaco de SQL, e nao de dado. */
function pareceFragmento(valor) {
  if (/[=<>;]/.test(valor)) return true;
  if (valor.length > TAMANHO_MAXIMO) return true;

  // Uma palavra sozinha (ON, OR, AS) pode ser um valor legitimo. Com duas ou
  // mais, e pedaco de SQL se comeca com uma palavra de SQL, se tem uma palavra
  // de estrutura no meio ("nome like 'x'"), se e um "x IN (...)" ou se e uma
  // definicao de coluna.
  const palavras = valor.split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return false;
  if (COMECO_SQL.test(valor) || PALAVRA_FORTE.test(valor)) return true;
  if (/(?:^|\s)in\s*\(/i.test(valor)) return true;
  return pareceDefinicaoDeColuna(palavras, valor);
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

  let valores = separados.valores.map((valor) => valor.trim()).filter((valor) => valor !== '');
  if (valores.length < 2) return null;

  if (valores.some(pareceFragmento)) return null;

  // Linhas com virgula no fim, todas com cara de nome de coluna ("a.id,"
  // "b.nome,"): e uma lista de colunas, e fica com o formatador de SQL.
  // Numeros e textos entre aspas, ou qualquer outra coisa, seguem como valores.
  if (separados.tinhaVirgula && valores.every((valor) => IDENTIFICADOR.test(valor))) return null;

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

    // N'texto' (nvarchar do SQL Server) vale como 'texto'.
    if ((interior[i] === 'N' || interior[i] === 'n') && interior[i + 1] === ASPA) i += 1;

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
