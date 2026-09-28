/**
 * Ponto de entrada do Blink.
 *
 * Monta as pecas na ordem e cuida do ciclo de vida do app. A logica de cada
 * parte fica no seu proprio arquivo:
 *
 *   config.js    le e grava %APPDATA%/Blink/config.json
 *   janelas.js   cria e controla as janelas
 *   bandeja.js   o icone do olho ao lado do relogio
 *   atalhos.js   as binds globais
 *   ipc.js       as mensagens que vem das telas
 */

const { app } = require('electron');

const config = require('./config');
const janelas = require('./janelas');
const bandeja = require('./bandeja');
const atalhos = require('./atalhos');
const ipc = require('./ipc');
const ferramentaSql = require('./ferramenta-sql');

/**
 * O que cada bind faz.
 *
 * O SQL Formatter e o unico que nao abre janela: ele troca a selecao no
 * lugar, no programa em que o usuario esta. Os outros dois abrem a janela
 * da ferramenta.
 */
function acionarFerramenta(nome) {
  if (nome === 'sql') return ferramentaSql.executar();
  return janelas.abrirFerramenta(nome);
}

/**
 * Uma instancia so.
 *
 * Duas instancias brigariam pelas mesmas binds globais: a segunda nao
 * conseguiria registrar nenhuma e ficaria muda. Se o usuario abrir o Blink de
 * novo, a instancia que ja esta rodando mostra a janela e a nova encerra.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => janelas.mostrarPrincipal());

  app.whenReady().then(() => {
    atalhos.definirAcao(acionarFerramenta);

    ipc.registrar();
    atalhos.registrarTodas();

    // A janela nasce escondida: o app comeca minimizado na bandeja, como
    // pede o design. Quem mostra e o clique no icone.
    janelas.criarPrincipal();
    bandeja.criar();

    console.log(`[blink] pronto. Configuracoes em: ${config.caminhoArquivo()}`);
  });

  /**
   * No Windows o padrao do Electron e encerrar quando a ultima janela fecha.
   * Aqui nao: o Blink e um app de bandeja e continua rodando sem janela
   * nenhuma aberta. Sair e so pelo menu da bandeja.
   */
  app.on('window-all-closed', () => {});

  app.on('will-quit', () => atalhos.liberarTodas());
}
