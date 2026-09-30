/**
 * Nomes neutros: o formatador de SQL sem tropecar no que ele nao conhece.
 *
 * O sql-formatter erra de tres jeitos com SQL que vem de log e de codigo:
 *
 *   1. Placeholders que ele nao reconhece. Em alguns casos ele ESTRAGA em
 *      silencio (":nome" vira "=: nome", "#{id}" vira "# {id}"); em outros
 *      recusa a SQL inteira ("$1", "${id}").
 *   2. Um pedaco estranho qualquer (um GUID sem aspas, "C:\temp" fora de
 *      texto) que faz ele recusar tudo por causa de uma coisa so.
 *   3. Colunas com nome de palavra reservada do T-SQL (user, type, role...):
 *      ele as trata como palavra-chave e quebra a indentacao.
 *
 * A saida para os tres e a mesma: troca o pedaco por um nome neutro
 * (BLINKX0X), formata, e poe o pedaco original de volta no lugar. O que
 * garante que isso nunca estraga nada e a TRAVA no fim: o resultado, sem
 * espacos e sem diferenciar caixa, tem que ser igual ao que entrou, e cada
 * nome neutro tem que voltar exatamente uma vez. Qualquer falha e o caminho de
 * sempre, como se este arquivo nao existisse.
 *
 * Puro: quem formata de verdade e passado como funcao.
 */

const { tokenizar } = require('./lexer-sql');

/** Palavras reservadas do T-SQL que aparecem como nome de coluna. */
const RESERVADA_NO_TEXTO = /(?:^|[^A-Za-z0-9_])(?:user|type|role|language|schema|table|index|rule|option)(?![A-Za-z0-9_])/i;
const RESERVADAS = new Set(['user', 'type', 'role', 'language', 'schema', 'table', 'index', 'rule', 'option']);

/** So vale olhar o texto por dentro se ele tem alguma marca de placeholder. */
const MARCA_DE_PLACEHOLDER = /[:#${%]/;

/** A rede de seguranca so age em texto que tem cara de SQL. */
const PALAVRA_DE_SQL = /(?:^|[^A-Za-z0-9_])(?:select|insert|update|delete|from|where|exec|execute|set|create|alter|drop|merge|declare|with)(?![A-Za-z0-9_])/i;

/** Comandos de manipulacao de dados: so neles uma reservada vira coluna. */
const COMANDO_DML = new Set(['SELECT', 'UPDATE', 'DELETE', 'INSERT', 'WITH', 'MERGE']);

/** O que vem antes de um nome de coluna (palavra ou simbolo). */
const ANTES_DE_COLUNA_PALAVRA = new Set(['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'BY', 'DISTINCT', 'WHEN', 'THEN', 'ELSE', 'NOT', 'HAVING', 'AS']);
const ANTES_DE_COLUNA_SIMBOLO = new Set([',', '(', '=', '<', '>', '+', '-', '*', '/']);

const MAXIMO_DE_TROCAS_NA_REDE = 10;

const semEspacos = (texto) => texto.replace(/\s+/g, '').toLowerCase();

/** O texto de dentro do token nao encosta no anterior/seguinte? */
const colado = (a, b) => Boolean(a && b) && a.i + a.s.length === b.i;

/** Um prefixo para os nomes neutros que nao aparece em lugar nenhum do texto. */
function escolherPrefixo(texto) {
  const alto = texto.toUpperCase();
  for (const prefixo of ['BLINKX', 'BLINKY', 'BLINKZ', 'QBLINKX', 'QBLINKY']) {
    if (!alto.includes(prefixo)) return prefixo;
  }
  return null;
}

/**
 * Acha o que trocar por nome neutro no texto: placeholders (todos os dialetos)
 * e colunas com nome reservado (so T-SQL). Devolve a lista de trechos
 * { ini, fim } ou [] se nao tem nada.
 */
function localizarTrechos(tokens, dialeto) {
  const trechos = [];
  const consumidos = new Set();

  for (let k = 0; k < tokens.length; k++) {
    if (consumidos.has(k)) continue;
    const tok = tokens[k];
    const prox = tokens[k + 1];
    const ant = tokens[k - 1];

    // ":nome" e ":1" (Hibernate, JPA, Oracle). Nao vale "::" (cast), "x:y" e "label:".
    if (tok.t === 'sim' && tok.s === ':' && prox && prox.t === 'pal' && colado(tok, prox) && /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+)$/.test(prox.s)) {
      const depois = tokens[k + 2];
      // Colado numa palavra, texto, nome entre colchetes ou em ")" / "]" / ":" e outra coisa ("x:y", "label:", "::").
      const grudadoAntes = colado(ant, tok)
        && (ant.t === 'pal' || ant.t === 'str' || ant.t === 'id' || (ant.t === 'sim' && (ant.s === ':' || ant.s === ')' || ant.s === ']')));
      const doisPontosDepois = colado(prox, depois) && depois.t === 'sim' && depois.s === ':';
      if (!grudadoAntes && !doisPontosDepois) {
        trechos.push({ ini: tok.i, fim: prox.i + prox.s.length });
        consumidos.add(k + 1);
        continue;
      }
    }

    // "#{id}" (MyBatis) e "${id}" (template): o "#" ou "$" sozinho, colado num "{" que fecha na mesma linha.
    if (tok.t === 'pal' && (tok.s === '#' || tok.s === '$') && prox && prox.t === 'sim' && prox.s === '{' && colado(tok, prox)) {
      let j = k + 2;
      while (j < tokens.length && tokens[j].t !== 'nl' && !(tokens[j].t === 'sim' && tokens[j].s === '}')) j += 1;
      if (j < tokens.length && tokens[j].t === 'sim') {
        trechos.push({ ini: tok.i, fim: tokens[j].i + 1 });
        for (let m = k + 1; m <= j; m++) consumidos.add(m);
        continue;
      }
    }

    // "{0}" (String.Format): "{" digitos "}" colados.
    if (tok.t === 'sim' && tok.s === '{' && prox && prox.t === 'pal' && /^[0-9]+$/.test(prox.s) && colado(tok, prox)) {
      const fecha = tokens[k + 2];
      if (fecha && fecha.t === 'sim' && fecha.s === '}' && colado(prox, fecha)) {
        trechos.push({ ini: tok.i, fim: fecha.i + 1 });
        consumidos.add(k + 1);
        consumidos.add(k + 2);
        continue;
      }
    }

    // "%s" e "%d" (printf) depois de espaco, "=", "(" ou ",".
    if (tok.t === 'sim' && tok.s === '%' && prox && prox.t === 'pal' && (prox.s === 's' || prox.s === 'd') && colado(tok, prox)) {
      const antesOk = !ant || ant.t === 'esp' || ant.t === 'nl' || (ant.t === 'sim' && '=(,<>+-*/'.includes(ant.s));
      if (antesOk) {
        trechos.push({ ini: tok.i, fim: prox.i + prox.s.length });
        consumidos.add(k + 1);
        continue;
      }
    }

    // "$1" (PostgreSQL). "$10.00" e um valor de dinheiro do T-SQL, nao um placeholder.
    if (tok.t === 'pal' && /^\$[0-9]+$/.test(tok.s)) {
      const ponto = tokens[k + 1];
      const cents = tokens[k + 2];
      const dinheiro = colado(tok, ponto) && ponto.t === 'sim' && ponto.s === '.' && colado(ponto, cents) && cents.t === 'pal' && /^[0-9]/.test(cents.s);
      if (!dinheiro) {
        trechos.push({ ini: tok.i, fim: tok.i + tok.s.length });
        continue;
      }
    }
  }

  if (dialeto === 'transactsql') localizarReservadas(tokens, trechos);
  return trechos;
}

/** Colunas com nome de palavra reservada, em comandos de manipulacao de dados. */
function localizarReservadas(tokens, trechos) {
  // Os tokens que importam (sem espacos, quebras e comentarios), com a posicao original.
  const sig = tokens.filter((tok) => tok.t !== 'esp' && tok.t !== 'nl' && tok.t !== 'com1' && tok.t !== 'comN');

  let comando = null;
  let inicio = true;
  for (let k = 0; k < sig.length; k++) {
    const tok = sig[k];

    if (inicio) {
      comando = tok.t === 'pal' ? tok.s.toUpperCase() : null;
      inicio = false;
    }
    if (tok.t === 'sim' && tok.s === ';') {
      inicio = true;
      continue;
    }

    if (tok.t !== 'pal' || !RESERVADAS.has(tok.s.toLowerCase()) || !COMANDO_DML.has(comando)) continue;

    const ant = sig[k - 1];
    const prox = sig[k + 1];
    if (!ant) continue;
    if (prox && prox.t === 'sim' && (prox.s === '(' || prox.s === ':')) continue;

    const palavraAnterior = ant.t === 'pal' ? ant.s.toUpperCase() : null;
    const depoisDeContexto = (ant.t === 'sim' && ANTES_DE_COLUNA_SIMBOLO.has(ant.s))
      || (palavraAnterior !== null && ANTES_DE_COLUNA_PALAVRA.has(palavraAnterior))
      || (palavraAnterior === 'SET' && comando === 'UPDATE');
    if (depoisDeContexto) trechos.push({ ini: tok.i, fim: tok.i + tok.s.length });
  }
}

/**
 * Monta a troca: { texto, trocas, prefixo } com o texto onde cada trecho virou
 * um nome neutro, ou null se nao ha o que trocar.
 */
function planejar(texto, dialeto) {
  const tsql = dialeto === 'transactsql';
  if (!MARCA_DE_PLACEHOLDER.test(texto) && !(tsql && RESERVADA_NO_TEXTO.test(texto))) return null;

  const tokens = tokenizar(texto);
  if (!tokens) return null;

  const trechos = localizarTrechos(tokens, dialeto).sort((a, b) => a.ini - b.ini);
  if (trechos.length === 0) return null;

  const prefixo = escolherPrefixo(texto);
  if (!prefixo) return null;

  let saida = '';
  let pos = 0;
  const trocas = [];
  trechos.forEach((trecho, n) => {
    const nome = prefixo + n + 'X';
    saida += texto.slice(pos, trecho.ini) + nome;
    trocas.push({ nome, original: texto.slice(trecho.ini, trecho.fim) });
    pos = trecho.fim;
  });
  saida += texto.slice(pos);

  return { texto: saida, trocas, prefixo };
}

/** Poe de volta o que estava no lugar de cada nome neutro. null se algum nome nao voltou exatamente uma vez. */
function restaurar(saida, trocas) {
  let atual = saida;
  for (const { nome, original } of trocas) {
    const busca = new RegExp(nome, 'gi');
    const achados = atual.match(busca);
    if (!achados || achados.length !== 1) return null;
    // Funcao, e nao texto, na troca: o original pode ter "$1", que a troca por texto leria como grupo.
    atual = atual.replace(busca, () => original);
  }
  return atual;
}

/** A trava: o resultado so difere do que entrou em espacos, quebras e caixa. */
function confere(resultado, entrada) {
  return semEspacos(resultado) === semEspacos(entrada);
}

/**
 * Le "Unexpected "X" at line L column C" da mensagem da sql-formatter e devolve
 * { ini, fim } do pedaco estranho no texto (estendido ate os separadores dos
 * dois lados), ou null.
 */
function localizarErro(mensagem, texto) {
  const achado = /Unexpected "([\s\S]*?)" at line (\d+) column (\d+)/.exec(mensagem);
  if (!achado) return null;

  const linhas = texto.split('\n');
  const linha = Number(achado[2]);
  const coluna = Number(achado[3]);
  if (linha < 1 || linha > linhas.length) return null;

  let posicao = coluna - 1;
  for (let l = 0; l < linha - 1; l++) posicao += linhas[l].length + 1;
  if (texto.substr(posicao, achado[1].length) !== achado[1]) return null;

  const separador = (c) => c === undefined || /[\s,()=;]/.test(c);
  let ini = posicao;
  while (ini > 0 && !separador(texto[ini - 1])) ini -= 1;
  let fim = posicao;
  while (fim < texto.length && !separador(texto[fim])) fim += 1;
  return fim > ini ? { ini, fim } : null;
}

/**
 * O pedaco pode ser trocado? Nunca um texto entre aspas ou colchetes (uma
 * string aberta continua sendo recusada) e nunca uma palavra comum: tem que
 * ter algum caractere fora de letras, digitos, "_", "@" e "#", ou comecar com digito.
 */
function trocavel(pedaco) {
  if (pedaco === '' || pedaco.length > 200) return false;
  if (/^['"[]/.test(pedaco)) return false;
  return /[^A-Za-z0-9_@#]/.test(pedaco) || /^[0-9]/.test(pedaco);
}

/**
 * A rede de seguranca: a sql-formatter recusou por causa de UM pedaco. Troca ele
 * por nome neutro e tenta de novo, ate MAXIMO_DE_TROCAS_NA_REDE vezes.
 * Devolve o texto formatado ou null.
 */
function rede(entrada, base, erro, formatarFn) {
  if (!PALAVRA_DE_SQL.test(entrada)) return null;

  const prefixo = base.prefixo || escolherPrefixo(entrada);
  if (!prefixo) return null;

  let atual = base.texto;
  const trocas = base.trocas.slice();
  let erroAtual = erro;

  for (let n = 0; n < MAXIMO_DE_TROCAS_NA_REDE; n++) {
    const local = localizarErro(erroAtual.message, atual);
    if (!local) return null;
    const pedaco = atual.slice(local.ini, local.fim);
    if (!trocavel(pedaco)) return null;

    const nome = prefixo + trocas.length + 'X';
    atual = atual.slice(0, local.ini) + nome + atual.slice(local.fim);
    trocas.push({ nome, original: pedaco });

    try {
      const restaurado = restaurar(formatarFn(atual), trocas);
      return restaurado !== null && confere(restaurado, entrada) ? restaurado : null;
    } catch (novoErro) {
      erroAtual = novoErro;
    }
  }
  return null;
}

/**
 * Formata "texto" com formatarFn, com os nomes neutros onde precisar.
 * Devolve { ok: true, texto } ou { ok: false, erro }.
 *
 * Sem nada a trocar, e exatamente formatarFn(texto): o caminho de sempre.
 */
function formatar(texto, formatarFn, dialeto) {
  const plano = planejar(texto, dialeto);
  let erroDoPlano = null;

  if (plano) {
    try {
      const restaurado = restaurar(formatarFn(plano.texto), plano.trocas);
      if (restaurado !== null && confere(restaurado, texto)) return { ok: true, texto: restaurado };
    } catch (erro) {
      erroDoPlano = erro;
    }
  }

  try {
    return { ok: true, texto: formatarFn(texto) };
  } catch (erro) {
    const base = plano && erroDoPlano
      ? { texto: plano.texto, trocas: plano.trocas, prefixo: plano.prefixo, erro: erroDoPlano }
      : { texto, trocas: [], prefixo: null, erro };
    const salvo = rede(texto, base, base.erro, formatarFn);
    return salvo !== null ? { ok: true, texto: salvo } : { ok: false, erro: erro.message };
  }
}

module.exports = { formatar, planejar, restaurar, confere, localizarErro, trocavel };
