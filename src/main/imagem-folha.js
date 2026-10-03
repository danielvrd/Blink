/**
 * "Copiar como imagem" de uma folha livre: um print da folha INTEIRA (texto, imagens e desenho), na largura real
 * de 794 px e sem o zoom, e nao so do pedaco que a janela mostra.
 *
 * Abre uma janela escondida com renderer/note/impressao.html, entrega a folha (o Delta e a tinta, lidos do disco),
 * espera o desenho ficar pronto (a pagina devolve a altura usada), tira o `capturePage` e poe a imagem na area de
 * transferencia. Quem chama grava a folha ANTES (o que esta na tela e o que vai na imagem).
 *
 * Folhas muito compridas passam do limite de textura da placa de video: acima de ALTURA_MAXIMA copia so o comeco
 * (o resultado diz `cortada`).
 */

const path = require('path');
const { BrowserWindow, clipboard, ClipboardItem } = require('electron');

const config = require('./config');
const livres = require('./notas-livres');

const LARGURA = 794;
const ALTURA_MAXIMA = 12000;

const PAGINA = path.join(__dirname, '..', 'renderer', 'note', 'impressao.html');

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** O capturePage de uma janela escondida falha nas primeiras tentativas (ainda nao pintou): tenta algumas vezes. */
async function capturar(janela) {
  for (let i = 0; i < 8; i++) {
    try {
      const imagem = await janela.webContents.capturePage();
      if (!imagem.isEmpty()) return imagem;
    } catch (erro) { /* ainda nao pintou */ }
    await esperar(150);
  }
  return null;
}

/**
 * Copia a folha de um arquivo como imagem. Devolve { ok: true, largura, altura, cortada } (em pixels da imagem,
 * ja com a escala do monitor) ou { ok: false, motivo }.
 */
async function copiar(arquivo) {
  if (!livres.ehLivre(arquivo)) return { ok: false, motivo: 'nao-livre' };
  const folha = await livres.lerFolha(arquivo);
  if (!folha) return { ok: false, motivo: 'sem-folha' };

  const janela = new BrowserWindow({
    show: false,
    width: LARGURA,
    height: 1000,
    useContentSize: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#19191d',
    webPreferences: { backgroundThrottling: false },
  });

  try {
    await janela.loadFile(PAGINA);
    const aparencia = config.obterAparencia('note');
    const altura = await janela.webContents.executeJavaScript(
      `window.Blink.aparencia.aplicar(${JSON.stringify(aparencia)}); window.Blink.folha.montarImpressao(document.getElementById('raiz'), ${JSON.stringify({ conteudo: folha.conteudo, tinta: folha.tinta })})`
    );

    const cortada = altura > ALTURA_MAXIMA;
    janela.setContentSize(LARGURA, Math.min(altura, ALTURA_MAXIMA));
    await esperar(250);

    const imagem = await capturar(janela);
    if (!imagem) return { ok: false, motivo: 'captura' };
    // O clipboard desta versao do Electron so tem a API assincrona (modelada no navegador): a imagem vai como PNG.
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([imagem.toPNG()], { type: 'image/png' }) })]);
    const { width, height } = imagem.getSize();
    return { ok: true, largura: width, altura: height, cortada };
  } catch (erro) {
    console.warn('[imagem-folha] falhou:', erro.message);
    return { ok: false, motivo: 'erro' };
  } finally {
    if (!janela.isDestroyed()) janela.destroy();
  }
}

module.exports = { copiar, LARGURA, ALTURA_MAXIMA };
