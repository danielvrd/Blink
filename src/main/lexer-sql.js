/**
 * Lexer minimo de SQL.
 *
 * Nao entende SQL: so separa o texto em pedacos que nunca se misturam - o que
 * e comentario, texto entre aspas, nome entre colchetes, palavra ou simbolo.
 * E o que basta para enxergar "o que esta fora de uma string" (nomes neutros) e
 * para olhar a saida do sql-formatter palavra por palavra (layout de procedure).
 *
 * Tipos de token ({ t, s, i } = tipo, texto, posicao):
 *   nl    uma quebra de linha ("\n")
 *   esp   espacos, tabulacoes e "\r"
 *   com1  comentario de linha (-- ate o fim da linha, sem a quebra)
 *   comN  comentario de bloco, com aninhamento (T-SQL aceita)
 *   str   'texto' (com '' para uma aspa), com ou sem o N na frente
 *   id    [nome] (com ]] para um colchete) ou "nome" (com "" para uma aspa)
 *   pal   palavra: letras, digitos, _ @ # $
 *   sim   qualquer outro caractere, um por token
 *
 * Devolve null se algo ficar aberto (aspa, colchete ou comentario sem fechar):
 * quem chama desiste e segue o caminho de sempre. Juntar os "s" dos tokens
 * devolve o texto original, sem tirar nem por nada.
 */

const PALAVRA = /[\p{L}\p{N}_@#$]+/uy;

function tokenizar(texto) {
  const n = texto.length;
  const tokens = [];
  let i = 0;

  while (i < n) {
    const c = texto[i];

    if (c === '\n') {
      tokens.push({ t: 'nl', s: c, i });
      i += 1;
      continue;
    }

    if (c === ' ' || c === '\t' || c === '\r') {
      let j = i + 1;
      while (j < n && (texto[j] === ' ' || texto[j] === '\t' || texto[j] === '\r')) j += 1;
      tokens.push({ t: 'esp', s: texto.slice(i, j), i });
      i = j;
      continue;
    }

    if (c === '-' && texto[i + 1] === '-') {
      let j = texto.indexOf('\n', i);
      if (j < 0) j = n;
      tokens.push({ t: 'com1', s: texto.slice(i, j), i });
      i = j;
      continue;
    }

    if (c === '/' && texto[i + 1] === '*') {
      let profundidade = 1;
      let j = i + 2;
      while (j < n && profundidade > 0) {
        if (texto[j] === '/' && texto[j + 1] === '*') {
          profundidade += 1;
          j += 2;
        } else if (texto[j] === '*' && texto[j + 1] === '/') {
          profundidade -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      if (profundidade > 0) return null;
      tokens.push({ t: 'comN', s: texto.slice(i, j), i });
      i = j;
      continue;
    }

    if (c === "'" || ((c === 'N' || c === 'n') && texto[i + 1] === "'")) {
      let j = c === "'" ? i + 1 : i + 2;
      for (;;) {
        const f = texto.indexOf("'", j);
        if (f < 0) return null;
        if (texto[f + 1] === "'") {
          j = f + 2;
          continue;
        }
        j = f + 1;
        break;
      }
      tokens.push({ t: 'str', s: texto.slice(i, j), i });
      i = j;
      continue;
    }

    if (c === '[' || c === '"') {
      const fecha = c === '[' ? ']' : '"';
      let j = i + 1;
      for (;;) {
        const f = texto.indexOf(fecha, j);
        if (f < 0) return null;
        if (texto[f + 1] === fecha) {
          j = f + 2;
          continue;
        }
        j = f + 1;
        break;
      }
      tokens.push({ t: 'id', s: texto.slice(i, j), i });
      i = j;
      continue;
    }

    PALAVRA.lastIndex = i;
    const palavra = PALAVRA.exec(texto);
    if (palavra) {
      tokens.push({ t: 'pal', s: palavra[0], i });
      i += palavra[0].length;
      continue;
    }

    // Um caractere por token, sem partir um par substituto (emoji) ao meio.
    const simbolo = String.fromCodePoint(texto.codePointAt(i));
    tokens.push({ t: 'sim', s: simbolo, i });
    i += simbolo.length;
  }

  return tokens;
}

module.exports = { tokenizar };
