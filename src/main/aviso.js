/**
 * Avisos discretos para o usuario.
 *
 * Usa a notificacao do proprio Windows: aparece no canto, some sozinha e
 * fica guardada na central de notificacoes. E onde o usuario ja espera ver
 * recados do sistema, e nao temos mais uma tela para manter.
 *
 * As ferramentas rodam com o Blink escondido na bandeja, entao este e o
 * unico jeito de dizer alguma coisa sem roubar o foco do programa em que a
 * pessoa esta trabalhando.
 */

const path = require('path');
const { Notification } = require('electron');

const ICONE = path.join(__dirname, '..', 'assets', 'icones', 'blink.ico');

/**
 * Mostra um aviso.
 *
 * `silencioso` evita o som do Windows: a ferramenta e acionada por atalho,
 * varias vezes seguidas, e um "pling" a cada erro cansa rapido.
 */
function mostrar(corpo, { titulo = 'Blink', silencioso = true } = {}) {
  if (!Notification.isSupported()) {
    console.warn(`[aviso] notificacoes indisponiveis: ${corpo}`);
    return;
  }

  new Notification({
    title: titulo,
    body: corpo,
    icon: ICONE,
    silent: silencioso,
  }).show();
}

module.exports = { mostrar };
