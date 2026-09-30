/**
 * Formatador de JSON.
 *
 * Puro: sem Electron, sem area de transferencia. A ferramenta-sql.js e o
 * monitor-sql.js decidem quando chamar; aqui so se reconhece e se formata.
 *
 * Diferente do XML, o JSON NAO e formatado com JSON.stringify(JSON.parse(..)).
 * Esse caminho mexeria no conteudo: um inteiro grande como
 * 12345678901234567890 perde precisao, 1.0 vira 1, chaves que parecem
 * numeros sobem para o inicio do objeto e chaves repetidas somem - e o
 * texto de um log nao pode sair diferente do que entrou. Por isso o JSON e
 * validado com JSON.parse, mas reindentado percorrendo o proprio texto:
 * strings e numeros saem exatamente como vieram, so mudam os espacos e as
 * quebras de linha.
 */

const CONTRABARRA = String.fromCharCode(92);
const ESPACOS = ' \n\r\t';

/** Tira o BOM e os espacos das pontas. */
function limpar(texto) {
  const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  return semBom.trim();
}

/** '2' e '4' viram espacos, 'tab' vira uma tabulacao (mesmas opcoes do XML). */
function indentacaoDe(opcao) {
  return opcao === 'tab' ? '\t' : ' '.repeat(Number(opcao) || 4);
}

/**
 * O texto comeca como um objeto ou uma lista JSON?
 *
 * So olha o comeco, como o pareceXml: quem decide o que fazer com um JSON
 * quebrado e o chamador. Um "[" sozinho e ambiguo (o SQL Server usa colchetes
 * para nomes, como em [dbo].[tabela]), entao para ele vale conferir com o
 * formatarJson se e valido de verdade.
 */
function pareceJson(texto) {
  const limpo = limpar(texto);
  return limpo.startsWith('{') || limpo.startsWith('[');
}

/**
 * Comeca com "{"? Um "{" nunca abre uma SQL nem uma lista, entao mesmo
 * quebrado ou cortado o texto e um JSON - e o certo e avisar, nao mandar
 * para o formatador de SQL.
 */
function comecaComChave(texto) {
  return limpar(texto).startsWith('{');
}

/** Reindenta um JSON JA validado, sem tocar em strings nem numeros. */
function reindentar(texto, unidade) {
  let saida = '';
  let nivel = 0;
  let dentroDeTexto = false;
  let escapando = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentroDeTexto) {
      saida += c;
      if (escapando) escapando = false;
      else if (c === CONTRABARRA) escapando = true;
      else if (c === '"') dentroDeTexto = false;
      continue;
    }

    if (c === '"') {
      dentroDeTexto = true;
      saida += c;
      continue;
    }

    if (ESPACOS.includes(c)) continue;

    if (c === '{' || c === '[') {
      const fecha = c === '{' ? '}' : ']';

      // Vazio fica compacto: {} e [] em vez de duas linhas sem nada dentro.
      let j = i + 1;
      while (j < texto.length && ESPACOS.includes(texto[j])) j++;
      if (texto[j] === fecha) {
        saida += c + fecha;
        i = j;
        continue;
      }

      nivel += 1;
      saida += c + '\n' + unidade.repeat(nivel);
      continue;
    }

    if (c === '}' || c === ']') {
      nivel -= 1;
      saida += '\n' + unidade.repeat(nivel) + c;
      continue;
    }

    if (c === ',') {
      saida += ',\n' + unidade.repeat(nivel);
      continue;
    }

    if (c === ':') {
      saida += ': ';
      continue;
    }

    saida += c;
  }

  return saida;
}

/**
 * Formata um JSON. Devolve { ok, texto } ou { ok: false }.
 *
 * A raiz tem que ser objeto ou lista: o JSON.parse tambem aceita 123, "abc"
 * e true, mas isso nao e o que alguem seleciona para formatar.
 */
function formatarJson(texto, opcaoIndentacao) {
  const limpo = limpar(texto);

  let valor;
  try {
    valor = JSON.parse(limpo);
  } catch (erro) {
    return { ok: false };
  }

  if (valor === null || typeof valor !== 'object') return { ok: false };

  return { ok: true, texto: reindentar(limpo, indentacaoDe(opcaoIndentacao)) };
}

module.exports = { pareceJson, comecaComChave, formatarJson };
