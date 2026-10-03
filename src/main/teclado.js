/**
 * Estado das teclas no Windows - hoje, so o Ctrl.
 *
 * A libnut manda teclas, mas nao sabe dizer se uma esta apertada. Quem sabe e
 * a user32, pelo GetAsyncKeyState, chamado aqui pelo koffi (uma ponte para
 * funcoes C que ja vem compilada, sem precisar de compilador).
 *
 * Para que serve: o Ctrl+Alt+F e o Ctrl+C que o Blink manda por baixo. Quem
 * solta so o Alt e o F e segura o Ctrl para ja emendar um Ctrl+V esperava que o
 * Ctrl continuasse valendo - mas o Blink "soltava" o Ctrl (um aperto falso) e
 * o Windows passava a achar que ele estava solto, entao o V saia como "v".
 * Sabendo se o Ctrl esta mesmo apertado, ele fica como o usuario deixou.
 *
 * Tudo aqui e opcional: se o koffi nao carregar (outro sistema, binario
 * faltando), as funcoes devolvem null e o Blink se comporta como antes.
 */

const VK_CONTROL = 0x11;
const BIT_APERTADA = 0x8000;

let funcao = null;
let tentou = false;

/** O retorno do GetAsyncKeyState diz "apertada agora"? (separado para dar para testar) */
const apertada = (estado) => (estado & BIT_APERTADA) !== 0;

/** Carrega a user32 uma vez. Qualquer falha deixa a funcao como null. */
function carregar() {
  if (tentou) return;
  tentou = true;

  if (process.platform !== 'win32') return;

  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    funcao = user32.func('short __stdcall GetAsyncKeyState(int vKey)');
  } catch (erro) {
    console.warn('[teclado] nao consegui ler o estado das teclas:', erro.message);
    funcao = null;
  }
}

/**
 * O Ctrl (qualquer um dos dois) esta apertado agora?
 * true / false, ou null se nao da para saber.
 */
function ctrlPressionado() {
  carregar();
  if (!funcao) return null;

  try {
    // O retorno e um "short" com sinal: o bit mais alto (0x8000) diz "apertada
    // agora". O bit mais baixo e "foi apertada desde a ultima consulta" e nao
    // interessa.
    return apertada(funcao(VK_CONTROL));
  } catch (erro) {
    return null;
  }
}

module.exports = { ctrlPressionado, apertada };
