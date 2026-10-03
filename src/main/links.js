/**
 * Abrir links no navegador padrao, com seguranca.
 *
 * O texto das anotacoes e dos arquivos vem de fora (colado, de outros programas): um link nunca pode virar
 * "abrir um programa" ou "abrir um arquivo". So passam http:, https: e mailto:. Tudo o mais (file:, javascript:,
 * ms-msdt:, data:, caminhos, ...) e recusado. `shell.openExternal` e chamado pelo objeto `shell` na hora (e nao
 * guardado), para os testes poderem trocar por um falso.
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { shell } = require('electron');

const PROTOCOLOS_PERMITIDOS = new Set(['http:', 'https:', 'mailto:']);
const TAMANHO_MAXIMO = 2048;

/** As paginas do proprio Blink: um quadro (iframe) carregando uma delas nao e "navegar para fora". */
const PAGINAS_DO_BLINK = pathToFileURL(path.join(__dirname, '..', 'renderer')).href;

/** A URL (normalizada pelo parser) se ela pode ser aberta, ou null. */
function validar(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > TAMANHO_MAXIMO) return null;
  let analisada;
  try {
    analisada = new URL(url);
  } catch (erro) {
    return null;
  }
  return PROTOCOLOS_PERMITIDOS.has(analisada.protocol) ? analisada.href : null;
}

/** Abre no navegador padrao. Devolve true se abriu (ou pediu para abrir), false se a URL nao serve. */
async function abrir(url) {
  const segura = validar(url);
  if (!segura) return false;
  try {
    await shell.openExternal(segura);
    return true;
  } catch (erro) {
    console.warn('[links] nao abriu:', erro.message);
    return false;
  }
}

/**
 * Trava de navegacao para TODAS as janelas (chamado uma vez, em main.js): uma tela do Blink nunca navega para
 * outro endereco nem abre janela nova. Um link http/https clicado vai para o navegador padrao.
 */
function protegerNavegacao(app) {
  app.on('web-contents-created', (_evento, conteudo) => {
    conteudo.setWindowOpenHandler(({ url }) => {
      abrir(url);
      return { action: 'deny' };
    });

    const bloquear = (evento, url) => {
      if (url === conteudo.getURL()) return;
      evento.preventDefault();
      abrir(url);
    };
    conteudo.on('will-navigate', bloquear);
    conteudo.on('will-frame-navigate', (evento) => {
      if (!evento.isMainFrame && evento.url.startsWith(PAGINAS_DO_BLINK)) return;
      bloquear(evento, evento.url);
    });
  });
}

module.exports = { validar, abrir, protegerNavegacao };
