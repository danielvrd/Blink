/**
 * Icone do Blink na bandeja do sistema (ao lado do relogio).
 *
 * E o unico lugar de onde o app pode ser aberto ou encerrado: a janela
 * principal so esconde quando fecha.
 */

const path = require('path');
const { Tray, Menu, app } = require('electron');
const janelas = require('./janelas');

const ICONE = path.join(__dirname, '..', 'assets', 'icones', 'blink.ico');

/**
 * A referencia precisa viver enquanto o app viver. Se ficasse so dentro da
 * funcao, o coletor de lixo levaria o objeto embora e o icone sumiria da
 * bandeja sozinho depois de um tempo.
 */
let bandeja = null;

function criar() {
  bandeja = new Tray(ICONE);
  bandeja.setToolTip('Blink');

  // Etapa 5 acrescenta aqui os atalhos para cada ferramenta e a opcao de
  // iniciar com o Windows. Agora elas ainda nao tem o que abrir.
  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir Blink',
      click: () => janelas.mostrarPrincipal(),
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        janelas.permitirEncerrar();
        app.quit();
      },
    },
  ]);

  bandeja.setContextMenu(menu);

  // Clique esquerdo abre a janela principal.
  bandeja.on('click', () => janelas.mostrarPrincipal());

  return bandeja;
}

module.exports = { criar };
