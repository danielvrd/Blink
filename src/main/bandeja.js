/**
 * Icone do Blink na bandeja do sistema (ao lado do relogio).
 *
 * E o unico lugar de onde o app pode ser aberto ou encerrado: a janela
 * principal so esconde quando fecha.
 */

const path = require('path');
const { Tray, Menu, app } = require('electron');
const janelas = require('./janelas');
const inicializacao = require('./inicializacao');
const atualizacao = require('./atualizacao');

const ICONE = path.join(__dirname, '..', 'assets', 'icones', 'blink.ico');

/**
 * A referencia precisa viver enquanto o app viver. Se ficasse so dentro da
 * funcao, o coletor de lixo levaria o objeto embora e o icone sumiria da
 * bandeja sozinho depois de um tempo.
 */
let bandeja = null;

/**
 * O que fazer quando um item de ferramenta e escolhido.
 *
 * Vem de fora (do main.js) em vez de a bandeja chamar as ferramentas
 * direto: as ferramentas precisam das janelas, e as janelas nao precisam
 * saber que existe uma bandeja. Assim o require nao anda em circulo.
 */
let acionarFerramenta = () => {};

function definirAcao(callback) {
  acionarFerramenta = callback;
}

/**
 * O item de atualizacao, que muda conforme o que esta acontecendo.
 *
 * Rodando pelo npm start ele aparece desabilitado: nao ha instalador para
 * trocar, e um item que nao faz nada sem explicacao confunde mais do que
 * ajuda.
 */
function itemDeAtualizacao() {
  const { estado, versao, disponivel } = atualizacao.situacao();

  if (!disponivel) {
    return { label: 'Atualizações (só no Blink instalado)', enabled: false };
  }

  if (estado === 'pronta') {
    return {
      label: `Reiniciar para atualizar (${versao})`,
      click: () => atualizacao.instalarAgora(janelas.permitirEncerrar),
    };
  }

  if (estado === 'baixando') {
    return { label: `Baixando a versão ${versao}…`, enabled: false };
  }

  if (estado === 'checando') {
    return { label: 'Procurando atualizações…', enabled: false };
  }

  return {
    label: 'Procurar atualizações',
    click: () => atualizacao.procurar({ manual: true }),
  };
}

/**
 * Monta o menu do zero.
 *
 * Chamado de novo a cada mudanca porque o Menu do Electron e imutavel: nao
 * da para so trocar a marca de selecao de um item ja montado.
 */
function montarMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Abrir Blink',
      click: () => janelas.mostrarPrincipal(),
    },
    { type: 'separator' },
    {
      label: 'Diff Checker',
      // Pela bandeja nao ha selecao para capturar: o clique no menu tira o
      // foco do programa onde o texto estava. Entao aqui o item abre a
      // comparacao de exemplo, que e para o que ele serve na pratica.
      click: () => acionarFerramenta('diff-exemplo'),
    },
    {
      label: 'Fast Note',
      click: () => acionarFerramenta('note'),
    },
    {
      label: 'SQL Formatter',
      // Este depende de uma selecao, que o menu nao tem. O clique so
      // lembra qual e o atalho.
      click: () => acionarFerramenta('sql-ajuda'),
    },
    { type: 'separator' },
    itemDeAtualizacao(),
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: inicializacao.ligado(),
      click: () => {
        inicializacao.alternar();
        atualizarMenu();
      },
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
}

/** Redesenha o menu, para a marca de selecao acompanhar o estado. */
function atualizarMenu() {
  if (bandeja && !bandeja.isDestroyed()) {
    bandeja.setContextMenu(montarMenu());
  }
}

function criar() {
  bandeja = new Tray(ICONE);
  bandeja.setToolTip('Blink');
  bandeja.setContextMenu(montarMenu());

  // Clique esquerdo abre a janela principal.
  bandeja.on('click', () => janelas.mostrarPrincipal());

  return bandeja;
}

module.exports = { criar, definirAcao, atualizarMenu };
