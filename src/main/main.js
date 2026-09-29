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
const ferramentaDiff = require('./ferramenta-diff');
const ferramentaNote = require('./ferramenta-note');
const ferramentaI18n = require('./ferramenta-i18n');
const aviso = require('./aviso');
const atualizacao = require('./atualizacao');
const monitorSql = require('./monitor-sql');

/**
 * O que cada bind faz.
 *
 * O SQL Formatter nao abre janela: formata a selecao e deixa na area de
 * transferencia. O Diff Checker funciona em dois tempos - a primeira bind
 * guarda o texto, a segunda compara e abre a janela. O Fast Note so abre o
 * bloco de notas.
 */
const FERRAMENTAS = {
  sql: () => ferramentaSql.executar(),
  diff: () => ferramentaDiff.executar(),
  note: () => ferramentaNote.executar(),
  i18n: () => ferramentaI18n.executar(),

  // Estes tres so vem do menu da bandeja. Clicar em um item de menu tira o
  // foco do programa onde o texto estava selecionado, entao as ferramentas
  // que dependem de selecao nao tem o que capturar por ali.
  'diff-exemplo': () => ferramentaDiff.abrirExemplo(),
  'sql-ajuda': () => {
    const bind = config.obter('binds').sql;
    aviso.mostrar(`Selecione uma SQL em qualquer programa e use ${bind}.`);
  },
  'i18n-ajuda': () => {
    const bind = config.obter('binds').i18n;
    aviso.mostrar(`Selecione um texto em qualquer programa e use ${bind}.`);
  },
};

function acionarFerramenta(nome) {
  const acao = FERRAMENTAS[nome];
  if (acao) return acao();
  console.warn(`[blink] ferramenta desconhecida: ${nome}`);
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
    /**
     * Identificacao do app para o Windows.
     *
     * Sem isto as notificacoes aparecem como "electron.app.Blink" e o
     * Windows pode agrupar os icones da barra de tarefas errado.
     */
    app.setAppUserModelId('com.danielvrd.blink');

    atalhos.definirAcao(acionarFerramenta);
    bandeja.definirAcao(acionarFerramenta);

    ipc.registrar();
    atalhos.registrarTodas();

    // A janela nasce escondida: o app comeca minimizado na bandeja, como
    // pede o design. Quem mostra e o clique no icone.
    janelas.criarPrincipal();
    bandeja.criar();

    // O menu mostra em que pe esta a atualizacao, entao precisa ser
    // redesenhado a cada mudanca de estado.
    atualizacao.definirAoMudar(() => bandeja.atualizarMenu());
    atualizacao.iniciar();

    // Formata sozinho a SQL copiada da Area de Trabalho Remota, onde o
    // atalho nao chega em tela cheia.
    monitorSql.iniciar();

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
