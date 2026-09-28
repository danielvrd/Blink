/**
 * Criacao e controle das janelas do Blink.
 *
 * Cada janela e criada uma vez e guardada aqui. Se ja existir, a gente reusa
 * em vez de abrir outra.
 */

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');
const ICONE = path.join(__dirname, '..', 'assets', 'icones', 'blink.ico');

/**
 * Tamanho da janela principal.
 *
 * O design pede 460px de largura e "altura pelo conteudo". Como a aba do SQL
 * Formatter e bem mais alta que as outras duas, a janela usa a altura dela e
 * o rodape de cada aba fica colado embaixo (veja `margin-top: auto` no CSS).
 * Assim a janela nao muda de tamanho a cada troca de aba.
 */
const LARGURA_PRINCIPAL = 460;
const ALTURA_PRINCIPAL = 471;

let principal = null;

/**
 * Vira true quando o usuario escolhe "Sair" na bandeja.
 *
 * Enquanto for false, fechar a janela principal so esconde: o app continua
 * vivo na bandeja, como pede o design.
 */
let encerrando = false;

/** Chamado antes de o app fechar de verdade. */
function permitirEncerrar() {
  encerrando = true;
}

/** Cria a janela principal (escondida). Nao mostra: quem mostra e a bandeja. */
function criarPrincipal() {
  principal = new BrowserWindow({
    width: LARGURA_PRINCIPAL,
    height: ALTURA_PRINCIPAL,
    show: false,
    // Sem a moldura do Windows: a barra de titulo e desenhada por nos, no HTML.
    frame: false,
    // Deixa o fundo da janela vazar, que e o que permite o canto arredondado
    // de 16px do design. Em troca a janela perde a sombra do sistema.
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    icon: ICONE,
    title: 'Blink',
    webPreferences: {
      preload: PRELOAD,
      // As telas nao tem acesso ao Node. Tudo que elas podem fazer passa
      // pelo preload, que expoe uma lista curta de funcoes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  principal.loadFile(path.join(RENDERER, 'principal', 'index.html'));

  // O X da barra de titulo esconde, nao fecha. Sair e so pela bandeja.
  principal.on('close', (evento) => {
    if (!encerrando) {
      evento.preventDefault();
      principal.hide();
    }
  });

  principal.on('closed', () => {
    principal = null;
  });

  return principal;
}

/** Devolve a janela principal, criando se ainda nao existir. */
function obterPrincipal() {
  if (!principal || principal.isDestroyed()) return criarPrincipal();
  return principal;
}

/** Mostra e traz a janela principal para a frente. */
function mostrarPrincipal() {
  const janela = obterPrincipal();
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

// --- Janela do Diff Checker -------------------------------------------------

/** Tamanho que a janela da comparacao gostaria de ter. */
const LARGURA_DIFF = 1040;
const ALTURA_DIFF = 680;

let diff = null;

/**
 * As linhas da comparacao que a janela vai desenhar.
 *
 * Ficam aqui e nao vao na URL: sao dois textos inteiros, que podem ser
 * grandes. A tela pede por IPC assim que carrega.
 */
let linhasDiff = [];

/** As linhas da comparacao aberta agora. Usado pelo ipc.js. */
function obterLinhasDiff() {
  return linhasDiff;
}

/**
 * Abre a janela de comparacao com as linhas passadas.
 *
 * Fica no monitor onde o mouse esta, e nao sempre no principal: a pessoa
 * acabou de selecionar um texto la, entao e onde ela esta olhando.
 */
function abrirDiff(linhas) {
  linhasDiff = linhas;

  // Ja tem uma comparacao aberta: recarrega com as linhas novas em vez de
  // empilhar uma segunda janela.
  if (diff && !diff.isDestroyed()) {
    diff.reload();
    diff.show();
    diff.focus();
    return diff;
  }

  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workAreaSize;
  const largura = Math.min(LARGURA_DIFF, Math.round(area.width * 0.9));
  const altura = Math.min(ALTURA_DIFF, Math.round(area.height * 0.8));

  diff = new BrowserWindow({
    width: largura,
    height: altura,
    minWidth: 520,
    minHeight: 320,
    show: false,
    frame: false,
    transparent: true,
    // Sempre no topo: a bind e usada de dentro de outro programa e a
    // comparacao precisa aparecer na frente dele.
    alwaysOnTop: true,
    icon: ICONE,
    title: 'Comparação de texto',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  diff.loadFile(path.join(RENDERER, 'diff', 'index.html'));

  diff.once('ready-to-show', () => {
    diff.show();
    diff.focus();
  });

  // Fechar descarta a comparacao, como pede o design.
  diff.on('closed', () => {
    diff = null;
    linhasDiff = [];
  });

  return diff;
}


// --- Janela do Fast Note ----------------------------------------------------

/** Tamanho do bloco de notas, fixo como no design. */
const LARGURA_NOTA = 320;
const ALTURA_NOTA = 380;

let nota = null;

/**
 * Abre o bloco de notas.
 *
 * Fica no monitor onde o mouse esta: a bind e usada no meio de outra coisa,
 * entao a janela precisa aparecer onde a pessoa esta olhando.
 */
function abrirNota() {
  if (nota && !nota.isDestroyed()) {
    // Ja esta aberto: recarrega para a lista de arquivos vir atualizada,
    // caso algum .md tenha sido criado ou apagado por fora.
    nota.reload();
    nota.show();
    nota.focus();
    return nota;
  }

  nota = new BrowserWindow({
    width: LARGURA_NOTA,
    height: ALTURA_NOTA,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    icon: ICONE,
    title: 'Fast Note',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  nota.loadFile(path.join(RENDERER, 'note', 'index.html'));

  nota.once('ready-to-show', () => {
    nota.show();
    nota.focus();
  });

  nota.on('closed', () => {
    nota = null;
  });

  return nota;
}

module.exports = {
  criarPrincipal,
  obterPrincipal,
  mostrarPrincipal,
  abrirDiff,
  abrirNota,
  obterLinhasDiff,
  permitirEncerrar,
};
