/**
 * Canais de comunicacao entre o processo principal e as telas.
 *
 * As telas (src/renderer) nao tem acesso ao Node nem ao Electron. Quando
 * precisam ler a configuracao, minimizar a janela ou abrir o seletor de
 * pasta, elas chamam uma funcao do `window.blink` (veja src/preload), que
 * manda a mensagem para ca.
 *
 * Toda funcao aqui trata o que chega como entrada desconhecida e confere
 * antes de usar.
 */

const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const config = require('./config');
const atalhos = require('./atalhos');
const janelas = require('./janelas');

/** A janela que enviou a mensagem, ou null se ela ja tiver sido fechada. */
function janelaDoEvento(evento) {
  return BrowserWindow.fromWebContents(evento.sender);
}

function registrar() {
  // --- Configuracoes -------------------------------------------------------

  ipcMain.handle('config:ler', () => ({
    valores: config.obterTudo(),
    // A tela usa isto para marcar em vermelho as binds que nao conseguiram
    // se registrar porque outro programa ja usa a combinacao.
    situacaoBinds: atalhos.obterSituacao(),
    caminhoArquivo: config.caminhoArquivo(),
  }));

  ipcMain.handle('config:gravar', (_evento, caminho, valor) => {
    if (typeof caminho !== 'string') return false;
    return config.definir(caminho, valor);
  });

  // --- Janela --------------------------------------------------------------

  ipcMain.handle('janela:minimizar', (evento) => {
    janelaDoEvento(evento)?.minimize();
  });

  ipcMain.handle('janela:esconder', (evento) => {
    janelaDoEvento(evento)?.hide();
  });

  // --- Atalhos -------------------------------------------------------------

  ipcMain.handle('atalhos:definir', (_evento, nome, acelerador) => {
    if (typeof nome !== 'string' || typeof acelerador !== 'string') {
      return { ok: false, motivo: 'vazio' };
    }
    return atalhos.definirBind(nome, acelerador);
  });

  // --- Pasta das notas -----------------------------------------------------

  ipcMain.handle('pasta:escolher', async (evento) => {
    const janela = janelaDoEvento(evento);
    const atual = config.obter('pastaNotas');

    const resultado = await dialog.showOpenDialog(janela, {
      title: 'Escolha a pasta das notas',
      // Abre na pasta ja configurada; se ainda nao houver, nos Documentos.
      defaultPath: atual || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Usar esta pasta',
    });

    if (resultado.canceled || resultado.filePaths.length === 0) return null;

    const escolhida = resultado.filePaths[0];
    config.definir('pastaNotas', escolhida);
    return escolhida;
  });

  // --- Demonstracao --------------------------------------------------------

  // O botao "Abrir demonstracao" de cada aba. Ele chama a mesma funcao que a
  // bind global chama, entao os dois caminhos abrem a mesma janela.
  ipcMain.handle('demonstracao:abrir', (_evento, nome) => {
    if (!atalhos.FERRAMENTAS.includes(nome)) return false;
    janelas.abrirFerramenta(nome);
    return true;
  });
}

module.exports = { registrar };
