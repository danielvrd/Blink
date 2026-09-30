/**
 * Modo automatico do Formatter para a Area de Trabalho Remota.
 *
 * Em tela cheia, a Area de Trabalho Remota captura todas as combinacoes de
 * teclas e manda para o servidor - o Ctrl+Alt+F nunca chega no Blink. Este
 * modo resolve sem atalho: o usuario da Ctrl+C normal dentro do servidor, e
 * quando a copia chega aqui o Blink formata sozinho.
 *
 * So age quando as duas coisas sao verdade:
 *   - a copia veio de uma janela de Area de Trabalho Remota;
 *   - o texto COMECA com SELECT, INSERT, UPDATE, DELETE, WITH ou DECLARE - ou e
 *     um XML (normal ou escapado, veja formatador-xml.js) - ou e um JSON
 *     de objeto ou lista (veja formatador-json.js).
 *
 * O segundo filtro e o que evita estragar copia comum: uma linha de log com
 * "select" no meio nao e formatada. Ainda assim nao e infalivel, por isso o
 * modo tem liga/desliga na aba Formatter - um para SQL e XML e outro so
 * para JSON.
 */

const { clipboard } = require('electron');

const config = require('./config');
const selecao = require('./selecao');
const ferramentaSql = require('./ferramenta-sql');
const aviso = require('./aviso');
const diagnostico = require('./diagnostico');
const formatadorXml = require('./formatador-xml');
const formatadorJson = require('./formatador-json');

/** De quanto em quanto tempo olhar. */
const INTERVALO = 400;

/**
 * Por quanto tempo, depois de sair da janela remota, uma copia ainda conta
 * como vinda dela. A copia remota atravessa a rede e pode chegar depois de o
 * usuario ja ter trocado de janela.
 */
const TEMPO_APOS_SAIR = 5000;

/**
 * Comeca com uma das palavras de SQL, ignorando espacos e caixa. DECLARE
 * entra porque muito script comeca declarando as variaveis - sem ele, a
 * copia nunca era formatada sozinha.
 */
const PARECE_SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|DECLARE)\b/i;

/** Quando a janela da frente foi remota pela ultima vez. */
let ultimaVezRemoto = 0;

/**
 * O ultimo texto visto na area de transferencia. null = ainda nao olhou
 * desde que entrou numa janela remota; a primeira olhada so anota o que ja
 * estava la, para nao formatar uma copia antiga.
 */
let ultimoVisto = null;

/** Evita duas verificacoes ao mesmo tempo, se uma demorar mais que o intervalo. */
let verificando = false;

/**
 * Os dois interruptores da aba Formatter: um para SQL e XML, outro so para
 * JSON (quem copia JSON minificado para colar num corpo de requisicao pode
 * nao querer que ele chegue indentado).
 *
 * Configuracao antiga, de antes de a opcao existir, nao tem o campo: vale o
 * padrao, que e ligado.
 */
function ligadoSqlXml() {
  return config.obter('sql.autoRemoto') !== false;
}

function ligadoJson() {
  return config.obter('sql.autoRemotoJson') !== false;
}

/**
 * JSON pequeno demais nao vale o aviso: "[1]" ou "{}" copiados por engano
 * viriam identados e atrapalhariam mais do que ajudam.
 */
const TAMANHO_MINIMO_JSON = 20;

function pareceJsonParaFormatar(texto) {
  return texto.trim().length >= TAMANHO_MINIMO_JSON && formatadorJson.pareceJson(texto);
}

/**
 * Uma olhada. A maior parte do tempo sai logo na primeira linha: sem janela
 * remota por perto, nem le a area de transferencia.
 */
async function verificar() {
  if (!ligadoSqlXml() && !ligadoJson()) {
    ultimoVisto = null;
    return;
  }

  const titulo = selecao.tituloDaJanelaAtiva();
  if (selecao.ehAcessoRemoto(titulo)) ultimaVezRemoto = Date.now();

  if (Date.now() - ultimaVezRemoto > TEMPO_APOS_SAIR) {
    ultimoVisto = null;
    return;
  }

  const texto = await clipboard.readText();

  if (ultimoVisto === null) {
    ultimoVisto = texto;
    return;
  }
  if (texto === ultimoVisto) return;
  ultimoVisto = texto;

  // A mudanca foi feita pela captura de um atalho do proprio Blink.
  if (selecao.emUso()) return;

  // XML e JSON tem o seu proprio caminho; o da SQL, abaixo, e o de sempre.
  // A lista de valores nao entra aqui: qualquer copia de varias linhas com
  // uma palavra por linha viraria alvo.
  const ehXml = ligadoSqlXml() && formatadorXml.pareceXml(texto);
  const ehJson = !ehXml && ligadoJson() && pareceJsonParaFormatar(texto);
  const ehSql = !ehXml && !ehJson && ligadoSqlXml() && PARECE_SQL.test(texto);
  if (!ehXml && !ehJson && !ehSql) return;

  const indentacao = config.obter('sql').indentacao;
  const resultado = ehXml
    ? formatadorXml.formatarXml(texto, indentacao)
    : ehJson
      ? formatadorJson.formatarJson(texto, indentacao)
      : ferramentaSql.formatar(texto);

  // XML ou JSON quebrado ou cortado passa intacto, como SQL invalida. Um texto
  // que ja estava formatado (mesmo que com CRLF) tambem: nao ha o que fazer.
  if (!resultado.ok || ferramentaSql.normalizar(resultado.texto) === ferramentaSql.normalizar(texto)) return;

  // Sai com CRLF, como qualquer texto do Windows. O ultimoVisto e o texto
  // gravado, senao a propria gravacao pareceria uma copia nova do usuario.
  const gravado = ferramentaSql.paraWindows(resultado.texto);
  await clipboard.writeText(gravado);
  ultimoVisto = gravado;

  // A mesma protecao do atalho: se uma segunda sincronizacao da copia
  // remota trouxer a crua de volta, a formatada e regravada.
  ferramentaSql.guardarContraSobrescrita(texto, gravado).catch(() => {});

  const tipo = ehXml ? 'xml' : ehJson ? 'json' : 'sql';
  diagnostico.registrar(`${tipo}-auto`, { janela: titulo, caracteres: texto.length });
  aviso.mostrar(
    {
      xml: 'XML da Área de Trabalho Remota formatado. Cole com Ctrl + V.',
      json: 'JSON da Área de Trabalho Remota formatado. Cole com Ctrl + V.',
      sql: 'SQL da Área de Trabalho Remota formatada. Cole com Ctrl + V.',
    }[tipo]
  );
}

/** Liga a vigilancia. Chamado uma vez, na abertura do app. */
function iniciar() {
  setInterval(async () => {
    if (verificando) return;
    verificando = true;
    try {
      await verificar();
    } catch (erro) {
      console.warn('[monitor-sql] falhou:', erro.message);
    } finally {
      verificando = false;
    }
  }, INTERVALO);
}

module.exports = { iniciar, verificar, PARECE_SQL };
