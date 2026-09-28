/**
 * Criacao e controle das janelas do Blink.
 *
 * Cada janela e criada uma vez e guardada aqui. Se ja existir, a gente reusa
 * em vez de abrir outra.
 */

const path = require('path');
const { BrowserWindow } = require('electron');

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

/**
 * Abre a janela de uma ferramenta: 'diff' ou 'note'.
 *
 * Este e o ponto de encontro dos dois caminhos que levam a uma ferramenta:
 * a bind global e o botao "Abrir demonstracao" da janela principal. Os dois
 * chamam esta mesma funcao, entao a ferramenta abre igual nos dois casos e
 * sem passar pela janela principal.
 *
 * O SQL Formatter nao passa por aqui: ele troca a selecao no lugar, sem
 * abrir janela (veja ferramenta-sql.js). A tela de demonstracao dele, que o
 * design preve como pre-visualizacao, ainda nao foi feita.
 *
 * TODO etapa 3 (note) e 4 (diff): criar as janelas de verdade.
 * Por enquanto so registra no console.
 */
function abrirFerramenta(nome) {
  console.log(`[janelas] abrirFerramenta("${nome}") ainda nao implementado`);
}

module.exports = {
  criarPrincipal,
  obterPrincipal,
  mostrarPrincipal,
  abrirFerramenta,
  permitirEncerrar,
};
