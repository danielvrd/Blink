/**
 * Fast Note.
 *
 * A bind abre um bloco de notas pequeno, sempre no topo, para anotar um
 * topico sem sair do que voce estava fazendo. Os topicos vao para arquivos
 * .md de uma pasta que voce escolhe.
 *
 * Diferente das outras duas ferramentas, esta nao captura selecao nenhuma:
 * so abre a janela.
 */

const { dialog } = require('electron');

const config = require('./config');
const janelas = require('./janelas');
const aviso = require('./aviso');
const notas = require('./notas');

/**
 * Garante que existe uma pasta de notas configurada.
 *
 * Sem pasta, abre o seletor do Windows na hora em vez de mandar o usuario
 * procurar a configuracao. Devolve false se ele cancelar.
 */
async function garantirPasta() {
  if (notas.pasta()) return true;

  const resultado = await dialog.showOpenDialog({
    title: 'Escolha a pasta das notas',
    message: 'O Fast Note ainda não tem uma pasta. Escolha onde guardar os arquivos .md.',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Usar esta pasta',
  });

  if (resultado.canceled || resultado.filePaths.length === 0) return false;

  config.definir('pastaNotas', resultado.filePaths[0]);
  return true;
}

/** O que a bind do Fast Note faz. */
async function executar() {
  try {
    if (!(await garantirPasta())) return;
    janelas.abrirNota();
  } catch (erro) {
    console.error('[ferramenta-note] falhou:', erro);
    aviso.mostrar('Algo deu errado ao abrir o Fast Note.');
  }
}

module.exports = { executar, garantirPasta };
