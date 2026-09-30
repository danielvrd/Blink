/**
 * Formatacao de XML - o desvio que o SQL Formatter toma quando a selecao
 * nao e SQL, e sim XML.
 *
 * Os logs do servidor trazem XML de dois jeitos: normal, e "escapado" -
 * com &lt; e &gt; no lugar de < e > - quando o XML vai dentro de outro XML,
 * como num envelope SOAP. Os dois viram XML legivel.
 */

const formatarBiblioteca = require('xml-formatter');
const { motor, LIMITE_CAPACIDADE } = require('./motor-xml');

/** Comeca como XML: declaracao, comentario ou uma tag. */
const INICIO_XML = /^(<\?xml|<!--|<[A-Za-z_])/;

/** A mesma coisa, so que escapada. */
const INICIO_XML_ESCAPADO = /^(&lt;\?xml|&lt;!--|&lt;[A-Za-z_])/;

/**
 * Escapada DUAS vezes (&amp;lt;a&amp;gt;): o XML estava dentro de um texto que
 * por sua vez estava dentro de outro XML - um envelope SOAP dentro de um campo
 * de log em XML, por exemplo.
 */
const INICIO_XML_ESCAPADO_DUPLO = /^(&amp;lt;\?xml|&amp;lt;!--|&amp;lt;[A-Za-z_])/;

/** Tira espacos e a marca de BOM que alguns programas poem no inicio. */
function limpar(texto) {
  return texto.replace(/^﻿/, '').trim();
}

/** O texto parece XML - normal ou escapado? */
function pareceXml(texto) {
  const limpo = limpar(texto);
  return INICIO_XML.test(limpo) || INICIO_XML_ESCAPADO.test(limpo) || INICIO_XML_ESCAPADO_DUPLO.test(limpo);
}

/**
 * Troca as entidades pelos caracteres de verdade.
 *
 * O &amp; vai por ultimo de proposito: um "&amp;lt;" no original quer dizer
 * o TEXTO "&lt;", e trocando o &amp; antes ele viraria um "<" de verdade.
 */
function desescapar(texto) {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A opcao "Indentacao" da aba vira o texto que a biblioteca espera. */
function indentacaoDe(opcao) {
  if (opcao === 'tab') return '\t';
  return ' '.repeat(Number(opcao) || 4);
}

/**
 * Formata UM documento com a biblioteca. Devolve o texto, ou null se ela recusar.
 *
 * Usa o modo estrito da biblioteca. Sem ele, um XML quebrado - uma tag
 * fechada errada, ou um XML CORTADO no meio, que e o comum em log - era
 * "consertado" em silencio, com a estrutura inventada. Estrito, o que nao
 * fecha direito e recusado e o usuario fica sabendo.
 */
function viaBiblioteca(xml, indentacao) {
  try {
    return formatarBiblioteca(xml, {
      indentation: indentacao,
      collapseContent: true,
      lineSeparator: '\n',
      throwOnFailure: true,
      strictMode: true,
    });
  } catch (erro) {
    return null;
  }
}

/** O motor linear, sem nunca deixar uma excecao dele escapar ("nao sei" = null). */
function viaMotor(xml, indentacao) {
  try {
    return motor(xml, indentacao);
  } catch (erro) {
    return null;
  }
}

/**
 * Onde termina o elemento que comeca em "inicio"? Devolve o indice logo depois
 * do fechamento, ou -1 se o elemento nao fecha direito (ou tem algo que este
 * leitor leve nao sabe pular: instrucao de processamento, DOCTYPE...).
 *
 * Leitura de uma passada, com pilha de nomes: pula comentarios, CDATA e o
 * ">" dentro de valor de atributo entre aspas.
 */
// Letras que a biblioteca aceita no comeco de um nome: ASCII, "_" e a faixa
// latina (U+00C0 a U+024F), montada com fromCharCode para nao depender de como
// o arquivo e gravado.
const LATINO = String.fromCharCode(0xc0) + '-' + String.fromCharCode(0x24f);
const INICIO_NOME = new RegExp('[A-Za-z_' + LATINO + ']');
const ABRE_TAG = new RegExp('<([A-Za-z_' + LATINO + '][^ \\t\\r\\n/>]*)', 'y');
function fimDoElemento(xml, inicio) {
  const n = xml.length;
  const pilha = [];
  let i = inicio;

  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) return -1;
    i = lt;

    if (xml.startsWith('<!--', i)) {
      const fim = xml.indexOf('-->', i + 4);
      if (fim < 0) return -1;
      i = fim + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const fim = xml.indexOf(']]>', i + 9);
      if (fim < 0) return -1;
      i = fim + 3;
      continue;
    }
    if (xml[i + 1] === '/') {
      const fim = xml.indexOf('>', i);
      if (fim < 0) return -1;
      if (pilha.pop() !== xml.slice(i + 2, fim).trim()) return -1;
      i = fim + 1;
      if (pilha.length === 0) return i;
      continue;
    }

    ABRE_TAG.lastIndex = i;
    const abre = ABRE_TAG.exec(xml);
    if (!abre) return -1;

    // Acha o ">" que fecha a tag, sem cair no que esta entre aspas.
    let j = i + abre[0].length;
    let aspa = null;
    for (; j < n; j++) {
      const c = xml[j];
      if (aspa) {
        if (c === aspa) aspa = null;
      } else if (c === '"' || c === "'") {
        aspa = c;
      } else if (c === '>') {
        break;
      }
    }
    if (j >= n) return -1;

    i = j + 1;
    if (xml[j - 1] !== '/') pilha.push(abre[1]);
    else if (pilha.length === 0) return i;
  }
  return -1;
}

/**
 * Um texto com VARIOS elementos no topo (<a/><b/>), que a biblioteca recusa
 * por nao ser um documento so: comum em log, onde se copia uma sequencia de
 * elementos irmaos. Devolve a lista de pedacos, um por elemento, ou null.
 *
 * Comentarios soltos vao junto com o elemento vizinho: os que vem antes, com o
 * proximo; os do fim, com o ultimo. Texto solto entre os elementos, instrucao
 * de processamento, DOCTYPE, elemento que nao fecha: null, e o texto continua
 * sendo recusado como sempre foi.
 */
function dividirIrmaos(xml) {
  const n = xml.length;
  const pecas = [];
  let comentarios = '';
  let i = 0;

  while (i < n) {
    const c = xml[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i += 1;
      continue;
    }
    if (xml.startsWith('<!--', i)) {
      const fim = xml.indexOf('-->', i + 4);
      if (fim < 0) return null;
      comentarios += xml.slice(i, fim + 3);
      i = fim + 3;
      continue;
    }
    if (c !== '<' || !INICIO_NOME.test(xml[i + 1] || '')) return null;

    const fim = fimDoElemento(xml, i);
    if (fim < 0) return null;
    pecas.push(comentarios + xml.slice(i, fim));
    comentarios = '';
    i = fim;
  }

  if (pecas.length < 2) return null;
  if (comentarios) pecas[pecas.length - 1] += comentarios;
  return pecas;
}

/**
 * Formata um pedaco: o motor linear se for grande, senao a biblioteca. Devolve
 * o texto ou null (recusado).
 */
function formatarPeca(xml, indentacao) {
  if (xml.length > LIMITE_CAPACIDADE) {
    const doMotor = viaMotor(xml, indentacao);
    if (doMotor === false) return null;
    if (doMotor !== null) return doMotor;
  }
  return viaBiblioteca(xml, indentacao);
}

/** Formata cada elemento do topo e junta, um por linha. null se algum for recusado. */
function formatarIrmaos(pecas, indentacao) {
  const saidas = [];
  for (const peca of pecas) {
    const saida = formatarPeca(peca, indentacao);
    if (saida === null) return null;
    saidas.push(saida);
  }
  return saidas.join('\n');
}

/**
 * Formata. Devolve { ok, texto, escapado } ou { ok: false }.
 *
 * Aceita o XML normal, escapado (&lt;a&gt;) e escapado duas vezes
 * (&amp;lt;a&amp;gt;), e tambem varios elementos no topo, formatados um a um.
 */
function formatarXml(texto, opcaoIndentacao) {
  const limpo = limpar(texto);
  const escapadoUmaVez = !INICIO_XML.test(limpo) && INICIO_XML_ESCAPADO.test(limpo);
  const escapadoDuasVezes = !INICIO_XML.test(limpo) && !escapadoUmaVez && INICIO_XML_ESCAPADO_DUPLO.test(limpo);
  const escapado = escapadoUmaVez || escapadoDuasVezes;

  // O segundo nivel se desfaz trocando so o "&amp;" - o resto e o mesmo
  // caminho de sempre. ("&amp;amp;" vira "&amp;" e, no passo seguinte, "&": o
  // texto original de um "&amp;" dentro do XML.)
  let xml = limpo;
  if (escapadoDuasVezes) xml = desescapar(limpo.replace(/&amp;/g, '&'));
  else if (escapadoUmaVez) xml = desescapar(limpo);

  const indentacao = indentacaoDe(opcaoIndentacao);
  const grande = xml.length > LIMITE_CAPACIDADE;

  // Documento grande: a biblioteca e quadratica (1,2 MB levam ~20 s com o app
  // parado), entao o motor linear tenta primeiro. Ele so responde quando tem
  // certeza; "nao sei" (null) cai no que sempre foi: os pedacos, se forem
  // varios elementos no topo, ou a biblioteca.
  if (grande) {
    const doMotor = viaMotor(xml, indentacao);
    if (doMotor === false) return { ok: false };
    if (doMotor !== null) return { ok: true, texto: doMotor, escapado };

    const pecas = dividirIrmaos(xml);
    if (pecas) {
      const juntos = formatarIrmaos(pecas, indentacao);
      return juntos === null ? { ok: false } : { ok: true, texto: juntos, escapado, irmaos: pecas.length };
    }
  }

  const unico = viaBiblioteca(xml, indentacao);
  if (unico !== null) return { ok: true, texto: unico, escapado };

  // A biblioteca recusou: pode ser um fragmento com varios elementos no topo.
  const pecas = grande ? null : dividirIrmaos(xml);
  if (pecas) {
    const juntos = formatarIrmaos(pecas, indentacao);
    if (juntos !== null) return { ok: true, texto: juntos, escapado, irmaos: pecas.length };
  }
  return { ok: false };
}

module.exports = { pareceXml, formatarXml, desescapar, dividirIrmaos };
