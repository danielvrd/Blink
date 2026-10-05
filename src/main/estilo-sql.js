/**
 * Estilo "Alinhado" da SQL formatada (o padrao; o "Classico" e a saida pura da biblioteca).
 *
 * O sql-formatter deixa o FROM sozinho numa linha, os AND de um JOIN soltos na
 * mesma coluna do JOIN, o END de um CASE na coluna do CASE e os CTEs de um WITH
 * dois niveis para dentro. Este arquivo pega a saida dele - depois do layout de
 * procedures (layout-tsql.js) - e muda so isso, no estilo que o Daniel escreve:
 *
 *   FROM TMOV T (NOLOCK)                          o FROM e a primeira tabela, na mesma linha
 *   INNER JOIN B ON B.ID = T.ID                   os JOINs na mesma coluna do FROM, do SELECT e do WHERE
 *                AND B.K = T.K                    AND / OR do ON alinhados sob o ON
 *   LEFT JOIN C ON (C.ID = T.ID                   ON ( ... ): a condicao comeca na linha do ON,
 *               AND C.K = T.K)                    os AND sob o ON e o ")" fecha na ultima condicao
 *   CASE
 *       WHEN ... THEN ...
 *       END AS X                                  o END do CASE na coluna dos WHEN
 *   WITH A AS (                                   WITH e o 1o CTE na mesma linha; os CTEs
 *       SELECT ...                                  um nivel para a esquerda
 *   ),
 *   B AS (
 *   DECLARE @a INT = 1;                           DECLAREs seguidos sem linha em branco
 *   DECLARE @b INT = 2;
 *
 * Como o layout-tsql.js: trabalha por linhas, so MEXE EM ESPACOS E QUEBRAS DE
 * LINHA, e uma TRAVA no fim garante isso - a sequencia de tokens (lexer-sql.js)
 * da saida tem que ser identica a da entrada. Qualquer duvida em qualquer regra
 * (algo aninhado, comentario no meio, texto de varias linhas) deixa aquele trecho
 * como esta; trava reprovada devolve null e fica a saida de antes.
 *
 * Linhas que comecam DENTRO de um texto 'com varias linhas' ou de um comentario de
 * bloco nunca sao tocadas: o conteudo delas faz parte do token.
 *
 * Idempotente: aplicar de novo na saida nao muda mais nada.
 *
 * Puro: sem Electron e sem area de transferencia.
 */

const { tokenizar, assinatura } = require('./lexer-sql');

/** Comecos de linha de um JOIN que pode ter ON. (CROSS JOIN nao tem; sem ON a linha e ignorada.) */
const INICIO_JOIN = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'JOIN']);

/** Comecos de linha de um JOIN ou de um APPLY (CROSS APPLY / OUTER APPLY): os que vao para a coluna do FROM. */
const INICIO_JUNCAO = new Set([...INICIO_JOIN, 'OUTER']);

/** Palavras que abrem uma clausula: um JOIN que tem uma delas na sua propria coluna ja esta alinhado com o FROM dele. */
const CLAUSULAS = new Set(['FROM', 'SELECT', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'UNION', 'EXCEPT', 'INTERSECT', 'SET', 'UPDATE', 'DELETE', 'INSERT', 'INTO', 'VALUES', 'WITH']);

/** Atalho: sem uma destas palavras nao ha nada para arrumar (e nem vale tokenizar). */
const PALAVRA_CANDIDATA = /(?:^|[^A-Za-z0-9_])(?:FROM|WITH|JOIN|CASE|DECLARE)(?![A-Za-z0-9_])/i;

/**
 * As linhas do texto, cada uma com o que as regras precisam saber:
 *   texto   a linha inteira        ind    a indentacao (espacos e tabs do comeco)
 *   corpo   o que vem depois dela, sem espacos no fim
 *   opaca   comeca dentro de um token de varias linhas (nao mexer)
 *   toks    os tokens significativos da linha, com a coluna (col) e se atravessam linhas (multi)
 */
function linhasDe(texto) {
  const tokens = tokenizar(texto);
  if (!tokens) return null;

  const partes = texto.split('\n');
  const linhas = [];
  let pos = 0;
  for (const parte of partes) {
    const ind = /^[ \t]*/.exec(parte)[0];
    linhas.push({ texto: parte, ind, corpo: parte.slice(ind.length).replace(/[ \t\r]+$/, ''), ini: pos, opaca: false, toks: [] });
    pos += parte.length + 1;
  }

  let li = 0;
  for (const tok of tokens) {
    if (tok.t === 'nl' || tok.t === 'esp') continue;
    while (li + 1 < linhas.length && linhas[li + 1].ini <= tok.i) li += 1;

    // As linhas que este token atravessa (texto ou comentario de varias linhas).
    const fim = tok.i + tok.s.length;
    let lf = li;
    while (lf + 1 < linhas.length && linhas[lf + 1].ini < fim) lf += 1;
    for (let k = li + 1; k <= lf; k++) linhas[k].opaca = true;

    linhas[li].toks.push({ t: tok.t, s: tok.s, u: tok.t === 'pal' ? tok.s.toUpperCase() : null, col: tok.i - linhas[li].ini, multi: lf > li });
  }
  return linhas;
}

const primeiroU = (l) => (l.toks.length > 0 ? l.toks[0].u : null);
const ultimo = (l) => (l.toks.length > 0 ? l.toks[l.toks.length - 1] : null);
const abre = (t) => t && t.t === 'sim' && t.s === '(';
const fecha = (t) => t && t.t === 'sim' && t.s === ')';

/** O saldo de parenteses de uma linha (abre menos fecha), so com os tokens dela. */
function saldo(l) {
  let s = 0;
  for (const t of l.toks) {
    if (abre(t)) s += 1;
    else if (fecha(t)) s -= 1;
  }
  return s;
}

/** A linha tem um token que atravessa linhas, ou termina em comentario de linha? (nao da para anexar nada depois dela) */
const temMulti = (l) => l.toks.some((t) => t.multi);
const terminaEmComentario = (l) => {
  const u = ultimo(l);
  return !!u && (u.t === 'com1' || u.t === 'comN');
};

/** FROM sozinho + a primeira tabela na linha de baixo -> "FROM tabela". */
function regraFrom(linhas) {
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const prox = linhas[i + 1];
    if (
      !l.opaca && l.corpo.toUpperCase() === 'FROM' &&
      prox && !prox.opaca && prox.corpo !== '' && prox.ind.length > l.ind.length &&
      !/^(\(|--|\/\*)/.test(prox.corpo)
    ) {
      saida.push(l.ind + l.corpo + ' ' + prox.corpo);
      i += 1;
      continue;
    }
    saida.push(l.texto);
  }
  return saida;
}

/** WITH sozinho + CTEs -> "WITH Nome AS (" e a secao dos CTEs um nivel para a esquerda. */
function regraWith(linhas, unidade) {
  const saida = linhas.map((l) => l.texto);

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const prox = linhas[i + 1];
    if (l.opaca || l.corpo.toUpperCase() !== 'WITH' || !prox || prox.opaca || prox.corpo === '') continue;
    if (prox.ind !== l.ind + unidade) continue;
    if (/^(--|\/\*)/.test(prox.corpo)) continue;

    // A secao: da linha do 1o CTE ate antes da proxima linha que volta ao nivel do WITH (ou menos).
    let fim = i + 1;
    while (fim + 1 < linhas.length && (linhas[fim + 1].corpo === '' || linhas[fim + 1].opaca || linhas[fim + 1].ind.length > l.ind.length)) fim += 1;

    // Toda linha da secao (menos as de dentro de um texto de varias linhas) tem que ter um nivel a tirar.
    let cabe = true;
    for (let k = i + 1; k <= fim; k++) {
      const x = linhas[k];
      if (x.opaca || x.corpo === '') continue;
      if (!x.ind.startsWith(l.ind + unidade)) { cabe = false; break; }
    }
    if (!cabe) continue;

    saida[i] = l.ind + 'WITH ' + prox.corpo;
    saida[i + 1] = null; // a linha do 1o CTE foi para cima
    for (let k = i + 2; k <= fim; k++) {
      const x = linhas[k];
      if (x.opaca || x.corpo === '') continue;
      saida[k] = l.ind + x.texto.slice((l.ind + unidade).length);
    }
    i = fim;
  }

  return saida.filter((t) => t !== null);
}

/**
 * AND / OR do ON alinhados sob o ON.
 *
 * "JOIN x ON a = b" + linhas AND/OR na mesma coluna do JOIN -> as linhas AND/OR comecam na coluna do ON.
 * "JOIN x ON (" + bloco de condicoes + ")" -> "JOIN x ON (cond1" / AND sob o ON / ")" colado na ultima.
 * Em tabulacao, o nivel continua sendo tabulacao e o alinhamento (a distancia ate o ON) vira espacos.
 */
function regraOn(linhas, unidade) {
  const saida = linhas.map((l) => l.texto);

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (l.opaca || !INICIO_JOIN.has(primeiroU(l)) || temMulti(l)) continue;

    // O ON do JOIN: o primeiro "ON" fora de parenteses.
    let profundidade = 0;
    let indiceOn = -1;
    for (let k = 0; k < l.toks.length; k++) {
      const t = l.toks[k];
      if (abre(t)) profundidade += 1;
      else if (fecha(t)) profundidade -= 1;
      else if (profundidade === 0 && t.u === 'ON') { indiceOn = k; break; }
    }
    if (indiceOn < 0) continue;

    const colunaOn = l.toks[indiceOn].col - l.ind.length;
    const alinhar = ' '.repeat(colunaOn);
    const ehBloco = indiceOn === l.toks.length - 2 && abre(l.toks[indiceOn + 1]);

    if (ehBloco) {
      // "ON (" + condicoes um nivel abaixo + ")" sozinho no nivel do JOIN.
      let fim = -1;
      for (let k = i + 1; k < linhas.length; k++) {
        const x = linhas[k];
        if (x.opaca) break;
        if (x.corpo === ')' && x.ind === l.ind) { fim = k; break; }
        if (x.ind !== l.ind + unidade || x.corpo === '' || temMulti(x) || saldo(x) !== 0) break;
      }
      if (fim < 0 || fim === i + 1) continue;

      const bloco = linhas.slice(i + 1, fim);
      // O ")" vai para o fim da ultima condicao: com um comentario de linha ali, ele cairia dentro do comentario.
      if (terminaEmComentario(bloco[bloco.length - 1])) continue;

      const novas = [l.texto.replace(/[ \t\r]+$/, '') + bloco[0].corpo];
      for (let k = 1; k < bloco.length; k++) novas.push(l.ind + alinhar + bloco[k].corpo);
      novas[novas.length - 1] += ')';

      // As linhas do JOIN, do bloco e do ")" viram essas (uma entrada com varias linhas; o resto some).
      saida[i] = novas.join('\n');
      for (let k = i + 1; k <= fim; k++) saida[k] = null;
      i = fim;
      continue;
    }

    // ON simples: as linhas AND/OR logo abaixo, na mesma coluna do JOIN.
    if (saldo(l) !== 0) continue;
    const seguintes = [];
    for (let k = i + 1; k < linhas.length; k++) {
      const x = linhas[k];
      if (x.opaca || x.ind !== l.ind || (primeiroU(x) !== 'AND' && primeiroU(x) !== 'OR')) break;
      seguintes.push(k);
    }
    if (seguintes.length === 0) continue;
    if (seguintes.some((k) => saldo(linhas[k]) !== 0 || temMulti(linhas[k]))) continue;

    for (const k of seguintes) saida[k] = l.ind + alinhar + linhas[k].corpo;
    i = seguintes[seguintes.length - 1];
  }

  return saida.filter((t) => t !== null);
}

/**
 * Os JOINs (e APPLYs) na coluna do FROM, em vez de um nivel para dentro.
 *
 * A biblioteca poe o FROM e, um nivel para dentro, a tabela e os JOINs. Aqui cada JOIN que esta um nivel abaixo de um
 * FROM (a primeira linha de MENOR indentacao antes dele e um FROM, na coluna do JOIN menos um nivel) sobe um nivel
 * junto com tudo o que e dele: as linhas mais fundas (o ON alinhado, os AND, uma subconsulta) e as que fecham ou
 * continuam o JOIN na coluna dele (")" e AND / OR). Quem ja esta na coluna de um FROM / SELECT / WHERE fica como esta
 * (e por isso aplicar de novo nao muda nada). Um bloco com texto de varias linhas dentro nao e tocado.
 *
 * Um JOIN dentro da subconsulta de outro JOIN tambem sobe: cada linha sobe um nivel por JOIN que a contem (`niveis`),
 * tudo medido nas linhas como chegaram - assim uma so volta resolve qualquer profundidade.
 */
function regraJuncao(linhas, unidade) {
  const niveis = linhas.map(() => 0);

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (l.opaca || !INICIO_JUNCAO.has(primeiroU(l))) continue;

    // O FROM deste JOIN: subindo, a primeira linha de indentacao menor. Uma clausula na MESMA coluna do JOIN
    // (o proprio FROM, um SELECT) quer dizer que ele ja esta alinhado.
    let de = -1;
    let jaAlinhado = false;
    for (let k = i - 1; k >= 0; k--) {
      const x = linhas[k];
      if (x.opaca || x.corpo === '') continue;
      if (x.ind.length > l.ind.length) continue;
      if (x.ind.length === l.ind.length) {
        if (CLAUSULAS.has(primeiroU(x))) { jaAlinhado = true; break; }
        continue;
      }
      if (primeiroU(x) === 'FROM' && l.ind === x.ind + unidade) de = k;
      break;
    }
    if (jaAlinhado || de < 0) continue;

    // O bloco do JOIN: as linhas mais fundas, e as da coluna dele que fecham ou continuam o JOIN.
    let fim = i;
    for (let k = i + 1; k < linhas.length; k++) {
      const x = linhas[k];
      if (x.opaca) { fim = -1; break; }
      if (x.corpo === '') {
        // Linha em branco: o bloco so continua se a proxima linha ainda e dele.
        continue;
      }
      const continua = x.ind.length > l.ind.length || (x.ind === l.ind && (x.corpo.startsWith(')') || primeiroU(x) === 'AND' || primeiroU(x) === 'OR'));
      if (!continua) break;
      fim = k;
    }
    if (fim < 0) continue;

    const prefixo = linhas[de].ind + unidade;
    let cabe = true;
    for (let k = i; k <= fim; k++) {
      if (linhas[k].corpo !== '' && !linhas[k].texto.startsWith(prefixo)) { cabe = false; break; }
    }
    if (!cabe) continue;

    for (let k = i; k <= fim; k++) if (linhas[k].corpo !== '') niveis[k] += 1;
  }

  // Cada linha perde `niveis` unidades do comeco (a indentacao e feita so de unidades, e depois o alinhamento do ON).
  return linhas.map((l, k) => {
    if (niveis[k] === 0) return l.texto;
    const tirar = unidade.repeat(niveis[k]);
    if (!l.texto.startsWith(tirar)) throw new Error('indentacao inesperada');
    return l.texto.slice(tirar.length);
  });
}

/** O END de um CASE de varias linhas, na coluna dos WHEN. */
function regraCase(linhas) {
  const saida = linhas.map((l) => l.texto);
  const pilha = [];

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    for (let k = 0; k < l.toks.length; k++) {
      const t = l.toks[k];
      if (t.u === 'CASE') {
        pilha.push(i);
      } else if (t.u === 'END' && pilha.length > 0) {
        const linhaCase = pilha.pop();
        const when = linhas[linhaCase + 1];
        if (k === 0 && !l.opaca && linhaCase < i && when && !when.opaca && when.corpo !== '' && when.ind.length > linhas[linhaCase].ind.length) {
          saida[i] = when.ind + l.corpo;
        }
      }
    }
  }
  return saida;
}

/**
 * ";" sozinho abrindo um WITH -> ";WITH ...". E o jeito de comecar um CTE no SQL Server, e a biblioteca
 * parte em duas linhas (o ";", uma linha em branco e o WITH). So o ";" que ABRE o comando (nada antes, ou
 * so comentario): um ";" que fecha o comando anterior fica onde esta.
 */
function regraPontoEVirgulaWith(linhas) {
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.opaca && l.corpo === ';') {
      let p = i - 1;
      while (p >= 0 && linhas[p].corpo === '') p -= 1;
      const abreOComando = p < 0 || (linhas[p].toks.length > 0 && linhas[p].toks.every((t) => t.t === 'com1' || t.t === 'comN'));

      let n = i + 1;
      while (n < linhas.length && linhas[n].corpo === '') n += 1;
      if (abreOComando && n < linhas.length && !linhas[n].opaca && linhas[n].ind === l.ind && primeiroU(linhas[n]) === 'WITH') {
        saida.push(l.ind + ';' + linhas[n].corpo);
        i = n;
        continue;
      }
    }
    saida.push(l.texto);
  }
  return saida;
}

/** Dois DECLAREs seguidos: sem a linha em branco que a biblioteca poe depois de cada ";". */
function regraDeclare(linhas) {
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (l.corpo !== '' || l.opaca) {
      saida.push(l.texto);
      continue;
    }

    // O trecho de linhas em branco [i..fim] e o comando que vem logo depois dele.
    let fim = i;
    while (fim + 1 < linhas.length && linhas[fim + 1].corpo === '' && !linhas[fim + 1].opaca) fim += 1;
    const depois = linhas[fim + 1];

    let remover = false;
    if (i > 0 && depois && !depois.opaca && primeiroU(depois) === 'DECLARE') {
      // O inicio do comando anterior: sobe saltando o que e continuacao (mais fundo, ou fechando parenteses).
      let s = i - 1;
      while (s >= 0 && (linhas[s].corpo === '' || linhas[s].opaca || linhas[s].ind.length > depois.ind.length || fecha(linhas[s].toks[0]))) s -= 1;
      remover = s >= 0 && linhas[s].ind === depois.ind && primeiroU(linhas[s]) === 'DECLARE';
    }

    if (!remover) for (let k = i; k <= fim; k++) saida.push(linhas[k].texto);
    i = fim;
  }
  return saida;
}

/**
 * Arruma o estilo da saida do sql-formatter (depois do layout de procedures).
 * Devolve o texto novo, ou null se nada mudou, se o texto nao pode ser lido
 * (aspas ou comentario sem fechar) ou se a trava reprovou.
 */
function aplicar(texto, unidade) {
  if (!PALAVRA_CANDIDATA.test(texto)) return null;

  const passos = [regraWith, regraPontoEVirgulaWith, regraFrom, regraOn, regraJuncao, regraCase, regraDeclare];
  let atual = texto;

  try {
    for (const passo of passos) {
      const linhas = linhasDe(atual);
      if (!linhas) return null;
      atual = passo(linhas, unidade).join('\n');
    }
  } catch (erro) {
    return null;
  }

  if (atual === texto) return null;

  // A TRAVA: os mesmos tokens, na mesma ordem - so espacos e quebras de linha mudaram.
  const antes = assinatura(texto);
  const depois = assinatura(atual);
  if (antes === null || depois === null || antes !== depois) return null;
  if (atual.replace(/\s+/g, '') !== texto.replace(/\s+/g, '')) return null;

  return atual;
}

module.exports = { aplicar };
