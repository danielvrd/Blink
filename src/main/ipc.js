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

const { ipcMain, dialog, BrowserWindow, app, clipboard } = require('electron');
const config = require('./config');
const atalhos = require('./atalhos');
const janelas = require('./janelas');
const ferramentaDiff = require('./ferramenta-diff');
const ferramentaNote = require('./ferramenta-note');
const notas = require('./notas');

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

  // Fecha de verdade. E o X e o Esc das janelas das ferramentas, que sao
  // descartaveis - ao contrario da janela principal, que so esconde.
  ipcMain.handle('janela:fechar', (evento) => {
    janelaDoEvento(evento)?.close();
  });

  // --- Comparacao de texto -------------------------------------------------

  // A janela do diff pede as linhas assim que carrega. Elas nao vao na URL
  // porque sao dois textos inteiros.
  ipcMain.handle('diff:linhas', () => janelas.obterLinhasDiff());

  // --- Fast Note -----------------------------------------------------------

  // Tudo que a janela de notas precisa para se montar, em uma leitura so.
  ipcMain.handle('notas:estado', async () => ({
    pasta: notas.pasta(),
    arquivos: await notas.listar(),
  }));

  ipcMain.handle('notas:ler', async (_evento, arquivo) => {
    if (typeof arquivo !== 'string') return { topicos: [] };
    return notas.ler(arquivo);
  });

  // Acrescenta um topico. Serve tanto para arquivo existente quanto para
  // um novo: o notas.adicionar cria o arquivo se ele nao existir.
  ipcMain.handle('notas:adicionar', async (_evento, arquivo, texto) => {
    if (typeof arquivo !== 'string' || typeof texto !== 'string') return null;

    const limpo = texto.trim();
    if (limpo === '') return null;

    return notas.adicionar(arquivo, limpo);
  });

  // Regrava a lista inteira. Usado por apagar e por reordenar.
  ipcMain.handle('notas:salvar', async (_evento, arquivo, topicos) => {
    if (typeof arquivo !== 'string' || !Array.isArray(topicos)) return false;
    if (!topicos.every((t) => typeof t === 'string')) return false;
    return notas.salvarTopicos(arquivo, topicos);
  });

  ipcMain.handle('notas:limpar', async (_evento, arquivo) => {
    if (typeof arquivo !== 'string') return false;
    return notas.limpar(arquivo);
  });

  // --- Area de transferencia -----------------------------------------------

  // O navigator.clipboard do navegador nao e confiavel em paginas abertas
  // pelo protocolo file:, entao copiar passa por aqui.
  ipcMain.handle('areaTransferencia:escrever', async (_evento, texto) => {
    if (typeof texto !== 'string') return false;
    await clipboard.writeText(texto);
    return true;
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

  // O botao "Abrir demonstracao" de cada aba.
  ipcMain.handle('demonstracao:abrir', (_evento, nome) => {
    if (!atalhos.FERRAMENTAS.includes(nome)) return false;

    // O Diff Checker abre a mesma janela da bind, com dois textos de
    // exemplo, para dar para ver como fica sem capturar nada.
    if (nome === 'diff') {
      ferramentaDiff.abrirExemplo();
      return true;
    }

    // O Fast Note nao tem o que demonstrar: o botao abre o bloco de notas
    // de verdade, igual a bind.
    if (nome === 'note') {
      ferramentaNote.executar();
      return true;
    }

    // TODO etapa 2b: a tela de pre-visualizacao do SQL Formatter.
    console.log(`[ipc] demonstracao de "${nome}" ainda nao implementada`);
    return true;
  });
}

module.exports = { registrar };
