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
 * que estiver aberta no meio do trabalho - ou quando o usuario clica em
 * "Atualizacao disponivel" (no botao das janelas ou no menu da bandeja).
 *
 * Sempre a versao MAIS NOVA, nao a primeira que apareceu:
 *   - com uma versao ja baixada, o Blink continua procurando (a cada 6 horas
 *     e na abertura). Antes, "pronta" parava a busca - e quem ficava dias
 *     sem fechar o app instalava a 0.5.0 mesmo com a 0.6.0 ja publicada;
 *   - ao clicar para reiniciar, uma ultima olhada antes de instalar: se saiu
 *     algo mais novo que o baixado, baixa e instala essa.
 */

const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

const aviso = require('./aviso');

/** De quanto em quanto tempo procurar, com o app aberto. */
const INTERVALO = 6 * 60 * 60 * 1000;

/**
 * Quanto esperar a ultima olhada que antecede o reinicio. Sem internet o
 * clique nao pode ficar preso: passou do limite, instala o que ja esta baixado.
 */
const LIMITE_ULTIMA_OLHADA = 10 * 1000;

/**
 * Em que pe esta a atualizacao. O menu da bandeja e o botao das janelas
 * leem isto para saber o que mostrar.
 *
 *   'ocioso'     nada acontecendo
 *   'checando'   consultando o GitHub
 *   'baixando'   baixando o instalador
 *   'pronta'     baixada, entra no proximo fechamento do app
 */
let estado = 'ocioso';

/** A versao a que o `estado` se refere (a que esta baixando ou pronta). */
let versaoNova = null;

/**
 * A versao do instalador que ja esta no disco, esperando. Fica guardada mesmo
 * durante uma checagem de fundo: checar de novo nao pode apagar o botao nem o
 * item do menu de uma atualizacao que ja esta pronta.
 */
let versaoBaixada = null;

/**
 * O usuario clicou em reiniciar e o Blink esta olhando se saiu algo mais novo
 * (ou baixando isso). O botao e o menu mostram "aguarde" nesse meio tempo.
 */
let instalando = false;

/**
 * Quando ha uma versao mais nova sendo baixada por causa do clique em
 * reiniciar: o que fazer ao terminar. Guarda o permitirEncerrar para instalar
 * no update-downloaded. null = nenhum reinicio pendente.
 */
let instalarAoBaixar = null;

/** O quitAndInstall ja foi pedido (nunca pedir duas vezes). */
let reiniciando = false;

/** Avisa a bandeja para redesenhar o menu. Definido pelo main.js. */
let aoMudar = () => {};

function definirAoMudar(callback) {
  aoMudar = callback;
}

function situacao() {
  return { estado, versao: versaoNova, disponivel: app.isPackaged, instalando };
}

/** Manda o estado atual para todas as janelas abertas (o botao de atualizar). */
function avisarJanelas() {
  const atual = situacao();
  for (const janela of BrowserWindow.getAllWindows()) {
    if (janela.isDestroyed()) continue;
    janela.webContents.send('atualizacao:situacao', atual);
  }
}

function mudarPara(novo, versao) {
  estado = novo;
  if (versao !== undefined) versaoNova = versao;
  aoMudar();
  avisarJanelas();
}

/** Volta ao estado "pronta" da versao que ja esta baixada. */
function voltarParaPronta() {
  mudarPara('pronta', versaoBaixada);
}

/**
 * "a" e uma versao mais nova que "b"? Compara numero a numero (0.10.0 > 0.9.0).
 * Sufixos como "-beta" sao ignorados: as Releases do Blink sao so X.Y.Z.
 */
function maisNova(a, b) {
  const partes = (v) => String(v).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Procurar foi pedido pelo usuario?
 *
 * Muda o que fazer em caso de erro ou de "ja esta atualizado": quando a
 * checagem e automatica, ficar sem internet nao merece uma notificacao a
 * cada seis horas. Quando o usuario clicou, o silencio pareceria travamento.
 */
let pedidoPeloUsuario = false;

/** Fecha o app e instala. Nunca roda duas vezes. */
function reiniciar(permitirEncerrar) {
  if (reiniciando) return;
  reiniciando = true;

  try {
    permitirEncerrar();
    autoUpdater.quitAndInstall();
  } catch (erro) {
    // Nao conseguiu: libera o botao para uma nova tentativa.
    reiniciando = false;
    instalando = false;
    instalarAoBaixar = null;
    console.warn('[atualizacao] quitAndInstall:', erro.message);
    avisarJanelas();
  }
}

function ligarEventos() {
  autoUpdater.on('checking-for-update', () => {
    // Com um instalador ja baixado o estado continua 'pronta'.
    if (!versaoBaixada) mudarPara('checando');
  });

  autoUpdater.on('update-available', (info) => {
    // A mesma que ja esta baixada: o electron-updater reaproveita o arquivo,
    // nao ha o que mostrar nem avisar de novo.
    if (versaoBaixada && info.version === versaoBaixada) return;

    mudarPara('baixando', info.version);
    // Com o reinicio pendente, quem avisa e o instalarAgora ("Saiu a versao X...").
    if (!instalarAoBaixar) aviso.mostrar(`Versão ${info.version} disponível. Baixando em segundo plano…`);
  });

  autoUpdater.on('update-not-available', () => {
    if (versaoBaixada) {
      voltarParaPronta();
    } else {
      mudarPara('ocioso', null);
      if (pedidoPeloUsuario) {
        aviso.mostrar(`O Blink já está na versão mais recente (${app.getVersion()}).`);
      }
    }
    pedidoPeloUsuario = false;
  });

  autoUpdater.on('update-downloaded', (info) => {
    const eNova = info.version !== versaoBaixada;
    versaoBaixada = info.version;
    mudarPara('pronta', info.version);
    pedidoPeloUsuario = false;

    // O usuario ja tinha pedido para reiniciar e a versao mais nova acabou de
    // chegar: instala essa.
    if (instalarAoBaixar) {
      const permitirEncerrar = instalarAoBaixar;
      instalarAoBaixar = null;
      instalando = false;
      reiniciar(permitirEncerrar);
      return;
    }

    if (eNova) {
      aviso.mostrar(
        `Versão ${info.version} pronta. Ela entra quando o Blink fechar, ` +
          'ou clique em "Atualização disponível" (também no menu da bandeja).'
      );
    }
  });

  autoUpdater.on('error', (erro) => {
    console.warn('[atualizacao] falhou:', erro.message);

    const estavaBaixando = estado === 'baixando';
    if (versaoBaixada) voltarParaPronta();
    else mudarPara('ocioso');

    if (pedidoPeloUsuario) {
      aviso.mostrar('Não foi possível procurar atualizações agora.');
    }
    pedidoPeloUsuario = false;

    // A versao mais nova nao baixou, mas o usuario quer reiniciar: instala a
    // que ja esta pronta em vez de deixa-lo esperando.
    if (instalarAoBaixar && estavaBaixando) {
      const permitirEncerrar = instalarAoBaixar;
      instalarAoBaixar = null;
      instalando = false;
      aviso.mostrar(`Não deu para baixar a versão mais nova; instalando a ${versaoBaixada}.`);
      reiniciar(permitirEncerrar);
    }
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

  // Baixando, so esperar. Com a versao ja baixada ("pronta") a busca CONTINUA:
  // pode ter saido uma mais nova que ela.
  if (estado === 'baixando') {
    if (manual) aviso.mostrar(`Baixando a versão ${versaoNova}…`);
    return;
  }

  if (estado === 'pronta' && manual) {
    aviso.mostrar(`Versão ${versaoNova} já está baixada, esperando o Blink fechar.`);
  }

  pedidoPeloUsuario = manual && estado !== 'pronta';
  autoUpdater.checkForUpdates().catch((erro) => {
    // O evento 'error' ja trata; este catch evita uma promessa sem dono.
    console.warn('[atualizacao] checkForUpdates:', erro.message);
  });
}

/**
 * A ultima olhada antes de reiniciar: saiu algo mais novo que o baixado?
 * Devolve a versao achada, ou null (nada novo, sem internet ou passou do
 * limite - em qualquer duvida, vale o que ja esta baixado).
 */
function olharSeSaiuMaisNova(limiteMs) {
  return new Promise((resolve) => {
    const limite = setTimeout(() => resolve(null), limiteMs);

    autoUpdater.checkForUpdates().then(
      (resultado) => {
        clearTimeout(limite);
        const achada = resultado && resultado.updateInfo ? resultado.updateInfo.version : null;
        resolve(achada && maisNova(achada, versaoBaixada) ? achada : null);
      },
      () => {
        clearTimeout(limite);
        resolve(null);
      }
    );
  });
}

/**
 * Fecha o app e instala agora - a versao mais nova que existir.
 *
 * O permitirEncerrar vem de fora para nao trazer o modulo de janelas para
 * ca: sem ele, o tratador que esconde a janela principal no lugar de
 * fechar impediria o app de sair.
 *
 * `limiteMs` so existe para os testes encurtarem a espera da ultima olhada.
 */
async function instalarAgora(permitirEncerrar, { limiteMs = LIMITE_ULTIMA_OLHADA } = {}) {
  if (estado !== 'pronta' || instalando || reiniciando) return;

  instalando = true;
  // Se a versao mais nova chegar logo (o evento pode vir antes da resposta da
  // checagem), o update-downloaded ja sabe que e para instalar.
  instalarAoBaixar = permitirEncerrar;
  avisarJanelas();
  aoMudar();

  const achada = await olharSeSaiuMaisNova(limiteMs);

  if (achada) {
    // O electron-updater ja comecou a baixar (autoDownload). Quem termina o
    // servico e o update-downloaded.
    aviso.mostrar(`Saiu a versão ${achada}; o Blink reinicia quando terminar de baixar.`);
    return;
  }

  // Nada mais novo: instala o que esta baixado.
  instalarAoBaixar = null;
  instalando = false;
  reiniciar(permitirEncerrar);
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

module.exports = { iniciar, procurar, instalarAgora, situacao, definirAoMudar, maisNova };
