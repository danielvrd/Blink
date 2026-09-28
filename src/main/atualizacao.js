/**
 * Atualizacao automatica.
 *
 * O app nao le o codigo do repositorio. Ele le um arquivo latest.yml
 * publicado numa Release do GitHub, compara a versao de la com a que esta
 * rodando e, se houver novidade, baixa o instalador em segundo plano.
 *
 * Quer dizer: fazer push nao atualiza ninguem. O que atualiza e publicar
 * uma Release - veja "npm run publicar" no README.
 *
 * A instalacao acontece quando o Blink fecha, para nao derrubar a janela
 * que estiver aberta no meio do trabalho.
 */

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

const aviso = require('./aviso');

/** De quanto em quanto tempo procurar, com o app aberto. */
const INTERVALO = 6 * 60 * 60 * 1000;

/**
 * Em que pe esta a atualizacao. O menu da bandeja le isto para saber o que
 * mostrar.
 *
 *   'ocioso'     nada acontecendo
 *   'checando'   consultando o GitHub
 *   'baixando'   baixando o instalador
 *   'pronta'     baixada, entra no proximo fechamento do app
 */
let estado = 'ocioso';
let versaoNova = null;

/** Avisa a bandeja para redesenhar o menu. Definido pelo main.js. */
let aoMudar = () => {};

function definirAoMudar(callback) {
  aoMudar = callback;
}

function mudarPara(novo, versao) {
  estado = novo;
  if (versao !== undefined) versaoNova = versao;
  aoMudar();
}

function situacao() {
  return { estado, versao: versaoNova, disponivel: app.isPackaged };
}

/**
 * Procurar foi pedido pelo usuario?
 *
 * Muda o que fazer em caso de erro ou de "ja esta atualizado": quando a
 * checagem e automatica, ficar sem internet nao merece uma notificacao a
 * cada seis horas. Quando o usuario clicou, o silencio pareceria travamento.
 */
let pedidoPeloUsuario = false;

function ligarEventos() {
  autoUpdater.on('checking-for-update', () => mudarPara('checando'));

  autoUpdater.on('update-available', (info) => {
    mudarPara('baixando', info.version);
    aviso.mostrar(`Versão ${info.version} disponível. Baixando em segundo plano…`);
  });

  autoUpdater.on('update-not-available', () => {
    mudarPara('ocioso', null);
    if (pedidoPeloUsuario) {
      aviso.mostrar(`O Blink já está na versão mais recente (${app.getVersion()}).`);
    }
    pedidoPeloUsuario = false;
  });

  autoUpdater.on('update-downloaded', (info) => {
    mudarPara('pronta', info.version);
    aviso.mostrar(
      `Versão ${info.version} pronta. Ela entra quando o Blink fechar, ` +
        'ou use "Reiniciar para atualizar" no menu da bandeja.'
    );
    pedidoPeloUsuario = false;
  });

  autoUpdater.on('error', (erro) => {
    mudarPara('ocioso');
    console.warn('[atualizacao] falhou:', erro.message);
    if (pedidoPeloUsuario) {
      aviso.mostrar('Não foi possível procurar atualizações agora.');
    }
    pedidoPeloUsuario = false;
  });
}

/**
 * Procura uma versao nova.
 *
 * `manual` marca que o pedido veio do menu da bandeja, e nao do relogio.
 */
function procurar({ manual = false } = {}) {
  // Rodando pelo npm start nao ha instalador para trocar: o autoUpdater
  // procuraria um app-update.yml que so existe no app empacotado.
  if (!app.isPackaged) {
    if (manual) aviso.mostrar('As atualizações só funcionam no Blink instalado.');
    return;
  }

  if (estado === 'baixando' || estado === 'pronta') {
    if (manual) {
      aviso.mostrar(
        estado === 'pronta'
          ? `Versão ${versaoNova} já está baixada, esperando o Blink fechar.`
          : `Baixando a versão ${versaoNova}…`
      );
    }
    return;
  }

  pedidoPeloUsuario = manual;
  autoUpdater.checkForUpdates().catch((erro) => {
    // O evento 'error' ja trata; este catch evita uma promessa sem dono.
    console.warn('[atualizacao] checkForUpdates:', erro.message);
  });
}

/**
 * Fecha o app e instala agora.
 *
 * O permitirEncerrar vem de fora para nao trazer o modulo de janelas para
 * ca: sem ele, o tratador que esconde a janela principal no lugar de
 * fechar impediria o app de sair.
 */
function instalarAgora(permitirEncerrar) {
  if (estado !== 'pronta') return;
  permitirEncerrar();
  autoUpdater.quitAndInstall();
}

/** Liga a checagem periodica. Chamado uma vez, na abertura do app. */
function iniciar() {
  // Baixa sozinho; instala quando o app fechar.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  ligarEventos();

  procurar();
  setInterval(() => procurar(), INTERVALO);
}

module.exports = { iniciar, procurar, instalarAgora, situacao, definirAoMudar };
