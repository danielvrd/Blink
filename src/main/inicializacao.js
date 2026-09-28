/**
 * "Iniciar com o Windows".
 *
 * Quem guarda essa preferencia e o proprio Windows, nao o config.json: ela
 * vira uma entrada de inicializacao que o usuario pode desligar pelo
 * Gerenciador de Tarefas. Se o Blink guardasse por conta propria, os dois
 * discordariam na primeira vez que ele desligasse por la.
 */

const path = require('path');
const { app } = require('electron');

/**
 * Como o Windows deve chamar o Blink na inicializacao.
 *
 * Instalado, basta o proprio executavel. Rodando pelo npm start, o
 * executavel e o electron.exe do node_modules, que sozinho nao sabe qual
 * app abrir - por isso o caminho do projeto vai junto.
 */
function comoIniciar() {
  if (app.isPackaged) return {};

  return {
    path: process.execPath,
    args: [path.resolve(app.getAppPath())],
  };
}

/** Esta ligado? */
function ligado() {
  return app.getLoginItemSettings(comoIniciar()).openAtLogin;
}

/** Liga ou desliga. */
function definir(deveLigar) {
  app.setLoginItemSettings({
    ...comoIniciar(),
    openAtLogin: deveLigar,
  });
}

/** Inverte e devolve como ficou. */
function alternar() {
  const novo = !ligado();
  definir(novo);
  return novo;
}

module.exports = { ligado, definir, alternar };
