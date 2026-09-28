/**
 * Ler e substituir o texto selecionado em qualquer programa do Windows.
 *
 * O Windows nao deixa um programa perguntar "o que esta selecionado ali?".
 * O jeito que funciona e o que todo app de atalho usa: simular Ctrl+C,
 * olhar a area de transferencia e devolver ela como estava depois.
 *
 * Isso mexe na area de transferencia do usuario, entao cada passo aqui tem
 * o cuidado de nao deixar lixo para tras.
 *
 * A area de transferencia do Electron e assincrona desde a versao 40 e seguio
 * padrao da web: readText() devolve uma Promise, e read() devolve a lista de
 * itens com todos os formatos que o Windows esta oferecendo. E o que permite
 * guardar e devolver o conteudo inteiro, e nao so o texto - se o usuario
 * tinha uma imagem copiada, ela volta igual.
 */

const { clipboard, ClipboardItem } = require('electron');
const libnut = require('@nut-tree-fork/libnut-win32');

/**
 * Quanto esperar o programa da frente responder ao Ctrl+C.
 *
 * Nao da para saber quando ele terminou, entao ficamos olhando a area de
 * transferencia de 25 em 25ms ate ela ter conteudo. Editores leves respondem
 * em menos de 50ms; o limite de 800ms e para quando nada foi selecionado -
 * ai o Ctrl+C nao produz nada e a espera precisa desistir.
 */
const INTERVALO_CONSULTA = 25;
const LIMITE_CAPTURA = 800;

/**
 * Tempo entre soltar as teclas da bind e mandar o Ctrl+C.
 *
 * Quando a bind dispara, o usuario ainda esta com Ctrl e Alt afundados. Se
 * mandarmos o Ctrl+C nesse instante, o programa da frente recebe
 * Ctrl+Alt+C, que nao e copiar. Soltamos os modificadores na marra e damos
 * um respiro antes de seguir.
 */
const PAUSA_APOS_SOLTAR = 90;

/**
 * Tempo que o texto novo fica na area de transferencia antes de ela ser
 * devolvida ao que era.
 *
 * O Ctrl+V so avisa o programa da frente; ler a area de transferencia leva
 * mais um tempinho. Devolver cedo demais faz ele colar o conteudo antigo.
 */
const PAUSA_APOS_COLAR = 180;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Guarda tudo que esta na area de transferencia agora, em todos os formatos
 * que o Windows oferece.
 */
async function guardarAreaDeTransferencia() {
  const itens = await clipboard.read();
  const copia = [];

  for (const item of itens) {
    const formatos = {};
    for (const tipo of item.types) {
      formatos[tipo] = await item.getType(tipo);
    }
    copia.push(formatos);
  }

  return copia;
}

/** Devolve a area de transferencia ao que foi guardado. */
async function devolverAreaDeTransferencia(copia) {
  if (copia.length === 0) {
    // Estava vazia antes: deixar do jeito que achamos.
    clipboard.clear();
    return;
  }

  await clipboard.write(copia.map((formatos) => new ClipboardItem(formatos)));
}

/**
 * Solta Ctrl, Alt e Shift.
 *
 * Sem isto, as teclas que o usuario ainda segura da bind se misturam com as
 * que a gente manda.
 */
function soltarModificadores() {
  for (const tecla of ['control', 'alt', 'shift']) {
    try {
      libnut.keyToggle(tecla, 'up');
    } catch (erro) {
      // Soltar uma tecla que nao estava pressionada nao e problema.
    }
  }
}

/** Fica olhando a area de transferencia ate aparecer texto ou o tempo acabar. */
async function esperarTexto() {
  const limite = Date.now() + LIMITE_CAPTURA;

  while (Date.now() < limite) {
    await esperar(INTERVALO_CONSULTA);
    const texto = await clipboard.readText();
    if (texto !== '') return texto;
  }

  return '';
}

/**
 * Le o texto selecionado no programa da frente.
 *
 * Devolve string vazia quando nada estava selecionado. A area de
 * transferencia volta ao que era antes, deu certo ou nao.
 *
 * Esvaziamos a area antes do Ctrl+C de proposito: sem isso nao daria para
 * diferenciar "nada selecionado" de "o usuario selecionou justamente o texto
 * que ja estava copiado".
 */
async function capturar() {
  const guardado = await guardarAreaDeTransferencia();

  try {
    soltarModificadores();
    await esperar(PAUSA_APOS_SOLTAR);

    clipboard.clear();
    libnut.keyTap('c', ['control']);

    return await esperarTexto();
  } finally {
    await devolverAreaDeTransferencia(guardado);
  }
}

/**
 * Troca o texto selecionado no programa da frente pelo texto passado.
 *
 * Pressupoe que a selecao continua de pe - e o caso, porque o Ctrl+C da
 * captura nao a desfaz.
 */
async function substituir(texto) {
  const guardado = await guardarAreaDeTransferencia();

  try {
    await clipboard.writeText(texto);
    soltarModificadores();
    libnut.keyTap('v', ['control']);
    await esperar(PAUSA_APOS_COLAR);
  } finally {
    await devolverAreaDeTransferencia(guardado);
  }
}

module.exports = { capturar, substituir };
