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

/** Tira espacos e a marca de BOM que alguns programas poem no inicio. */
function limpar(texto) {
  return texto.replace(/^﻿/, '').trim();
}

/** O texto parece XML - normal ou escapado? */
function pareceXml(texto) {
  const limpo = limpar(texto);
  return INICIO_XML.test(limpo) || INICIO_XML_ESCAPADO.test(limpo);
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
 * Formata. Devolve { ok, texto, escapado } ou { ok: false }.
 *
 * Usa o modo estrito da biblioteca. Sem ele, um XML quebrado - uma tag
 * fechada errada, ou um XML CORTADO no meio, que e o comum em log - era
 * "consertado" em silencio, com a estrutura inventada. Estrito, o que nao
 * fecha direito e recusado e o usuario fica sabendo.
 */
function formatarXml(texto, opcaoIndentacao) {
  const limpo = limpar(texto);
  const escapado = !INICIO_XML.test(limpo) && INICIO_XML_ESCAPADO.test(limpo);
  const xml = escapado ? desescapar(limpo) : limpo;
  const indentacao = indentacaoDe(opcaoIndentacao);

  // Documento grande: a biblioteca e quadratica (1,2 MB levam ~20 s com o app
  // parado), entao o motor linear tenta primeiro. Ele so responde quando tem
  // certeza; "nao sei" (null) segue para a biblioteca, como sempre foi.
  if (xml.length > LIMITE_CAPACIDADE) {
    let doMotor = null;
    try {
      doMotor = motor(xml, indentacao);
    } catch (erro) {
      doMotor = null;
    }
    if (doMotor === false) return { ok: false };
    if (doMotor !== null) return { ok: true, texto: doMotor, escapado };
  }

  try {
    const saida = formatarBiblioteca(xml, {
      indentation: indentacao,
      collapseContent: true,
      lineSeparator: '\n',
      throwOnFailure: true,
      strictMode: true,
    });
    return { ok: true, texto: saida, escapado };
  } catch (erro) {
    return { ok: false };
  }
}

module.exports = { pareceXml, formatarXml, desescapar };
