/**
 * Criacao e controle das janelas do Blink.
 *
 * Cada janela e criada uma vez e guardada aqui. Se ja existir, a gente reusa
 * em vez de abrir outra.
 *
 * As tres janelas sao sem moldura (a barra de titulo e desenhada no HTML) e
 * redimensionaveis por qualquer borda. O tamanho que o usuario deixar fica
 * salvo e volta na proxima abertura.
 *
 * Elas NAO sao transparentes. Transparencia era o que dava os cantos de
 * 16px do design, mas o Electron nao deixa redimensionar janela
 * transparente ("Transparent windows are not resizable", na documentacao).
 * Sem ela, o Windows 11 arredonda os cantos e desenha a sombra sozinho.
 */

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const config = require('./config');

const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');
const ICONE = path.join(__dirname, '..', 'assets', 'icones', 'blink.ico');

/**
 * Tamanho padrao e minimo de cada janela.
 *
 * Principal: o design pede 460px de largura. A altura e a da aba do
 * Formatter, a mais alta (com os dois interruptores do modo automatico, o de
 * SQL/XML e o de JSON); abaixo desse minimo o rodape das abas encavala no
 * conteudo. Foi medido: com os dois interruptores faltavam 40px nos 490 de
 * antes, entao 530.
 *
 * Diff: grande, porque sao dois textos lado a lado. O padrao e reduzido se o
 * monitor for menor.
 *
 * Nota: pequena, e um bloco de notas rapido.
 */
const TAMANHOS = {
  principal: { largura: 460, altura: 530, minLargura: 460, minAltura: 530 },
  diff: { largura: 1040, altura: 680, minLargura: 520, minAltura: 320 },
  nota: { largura: 320, altura: 380, minLargura: 300, minAltura: 320 },
};

/**
 * Nunca abrir maior que isso da area util do monitor. Protege o caso de o
 * tamanho ter sido salvo num monitor grande e a janela abrir agora num
 * notebook.
 */
const LIMITE_DA_TELA = 0.95;

/** Mesma cor do fundo das telas: aparece por um instante antes do HTML carregar. */
const COR_DE_FUNDO = '#0a0a0a';

/** Opcoes que valem para as tres janelas. */
const OPCOES_COMUNS = {
  show: false,
  // Sem a moldura do Windows: a barra de titulo e desenhada por nos, no HTML.
  frame: false,
  backgroundColor: COR_DE_FUNDO,
  resizable: true,
  icon: ICONE,
  webPreferences: {
    preload: PRELOAD,
    // As telas nao tem acesso ao Node. Tudo que elas podem fazer passa
    // pelo preload, que expoe uma lista curta de funcoes.
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
};

/**
 * Tamanho e posicao para abrir uma janela.
 *
 * Usa o tamanho salvo, se houver, limitado ao minimo da janela e ao tamanho
 * da tela. Centraliza no monitor onde o mouse esta: a pessoa acabou de usar
 * um atalho ou clicar na bandeja, entao e ali que ela esta olhando.
 */
function posicaoInicial(nome) {
  const padrao = TAMANHOS[nome];
  const salvo = config.obterTamanho(nome);
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;

  const maxLargura = Math.round(area.width * LIMITE_DA_TELA);
  const maxAltura = Math.round(area.height * LIMITE_DA_TELA);

  const largura = Math.max(padrao.minLargura, Math.min(salvo ? salvo.largura : padrao.largura, maxLargura));
  const altura = Math.max(padrao.minAltura, Math.min(salvo ? salvo.altura : padrao.altura, maxAltura));

  return {
    width: largura,
    height: altura,
    minWidth: padrao.minLargura,
    minHeight: padrao.minAltura,
    x: Math.round(area.x + (area.width - largura) / 2),
    y: Math.round(area.y + (area.height - altura) / 2),
  };
}

/**
 * Reaplica o tamanho depois que a janela ja esta no monitor certo.
 *
 * Com dois monitores de escalas diferentes (um em 100%, outro em 125%), o
 * Electron cria a janela na escala de um e a converte para a do outro - e o
 * arredondamento faz ela nascer 5 ou 6 pixels maior que o pedido. Aplicar o
 * tamanho de novo, com a janela ja posicionada, acerta.
 */
function acertarTamanho(janela, { width, height }) {
  const [largura, altura] = janela.getContentSize();
  if (largura !== width || altura !== height) janela.setContentSize(width, height);
}

/**
 * Guarda o tamanho quando o usuario termina de redimensionar.
 *
 * O evento 'resized' chega uma vez, no fim do arrasto - e nao a cada pixel
 * como o 'resize', que gravaria o arquivo dezenas de vezes por segundo.
 * Janela maximizada nao conta: o tamanho a lembrar e o de antes de
 * maximizar.
 */
function lembrarTamanho(janela, nome) {
  janela.on('resized', () => {
    if (janela.isDestroyed() || janela.isMaximized()) return;
    // Tamanho do conteudo, nao da janela: e o mesmo que se pede ao criar,
    // entao reabrir devolve exatamente o que o usuario deixou.
    const [largura, altura] = janela.getContentSize();
    config.salvarTamanho(nome, largura, altura);
  });
}

// --- Janela principal -------------------------------------------------------

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
  const inicial = posicaoInicial('principal');
  principal = new BrowserWindow({
    ...OPCOES_COMUNS,
    ...inicial,
    fullscreenable: false,
    title: 'Blink',
  });

  acertarTamanho(principal, inicial);
  principal.loadFile(path.join(RENDERER, 'principal', 'index.html'));
  lembrarTamanho(principal, 'principal');

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

/**
 * Mostra e traz a janela principal para a frente.
 *
 * Com `aba` ('diff', 'note', 'sql', 'i18n'), abre ja nela: e o olho do
 * cabecalho de uma ferramenta. A aba vai por dois caminhos - gravada no
 * config (vale se a tela ainda esta carregando: ela le na abertura) e
 * mandada para a tela, que so le o config uma vez e ja pode estar aberta.
 */
function mostrarPrincipal(aba) {
  const janela = obterPrincipal();

  if (aba) {
    config.definir('abaAtiva', aba);
    janela.webContents.send('principal:aba', aba);
  }

  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

// --- Janela do Diff Checker -------------------------------------------------

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

/** Abre a janela de comparacao com as linhas passadas. */
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

  const inicial = posicaoInicial('diff');
  diff = new BrowserWindow({
    ...OPCOES_COMUNS,
    ...inicial,
    // Sempre no topo: a bind e usada de dentro de outro programa e a
    // comparacao precisa aparecer na frente dele.
    alwaysOnTop: true,
    title: 'Comparação de texto',
  });

  acertarTamanho(diff, inicial);
  diff.loadFile(path.join(RENDERER, 'diff', 'index.html'));
  lembrarTamanho(diff, 'diff');

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

let nota = null;

/** Abre o bloco de notas. */
function abrirNota() {
  if (nota && !nota.isDestroyed()) {
    // Ja esta aberto: recarrega para a lista de arquivos vir atualizada,
    // caso algum .md tenha sido criado ou apagado por fora.
    nota.reload();
    nota.show();
    nota.focus();
    return nota;
  }

  const inicial = posicaoInicial('nota');
  nota = new BrowserWindow({
    ...OPCOES_COMUNS,
    ...inicial,
    alwaysOnTop: true,
    title: 'Fast Note',
  });

  acertarTamanho(nota, inicial);
  nota.loadFile(path.join(RENDERER, 'note', 'index.html'));
  lembrarTamanho(nota, 'nota');

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
  TAMANHOS,
  criarPrincipal,
  obterPrincipal,
  mostrarPrincipal,
  abrirDiff,
  abrirNota,
  obterLinhasDiff,
  permitirEncerrar,
};
