/**
 * Ler o texto selecionado em qualquer programa do Windows.
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

const diagnostico = require('./diagnostico');

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
 * Area de Trabalho Remota.
 *
 * Numa sessao remota o Ctrl+C acontece la no servidor, e so depois a copia
 * atravessa a rede ate a area de transferencia daqui. Isso pode passar de
 * um segundo. Com o limite de 800ms o Blink desistia antes, devolvia a area
 * de transferencia ao que era - e a copia remota chegava logo em seguida,
 * deixando a SQL crua para o usuario colar.
 *
 * Quando a janela da frente e de acesso remoto, as esperas sao maiores. A
 * pausa apos soltar tambem cresce: a janela remota repassa as teclas para
 * o servidor, e Ctrl ou Alt ainda "afundados" la estragariam o Ctrl+C.
 */
const LIMITE_CAPTURA_REMOTO = 3000;
const PAUSA_APOS_SOLTAR_REMOTO = 160;

/**
 * Janelas de acesso remoto, reconhecidas pelo titulo.
 *
 *   mstsc          "servidor - Conexao de Area de Trabalho Remota"
 *                  "servidor - Remote Desktop Connection"
 *   app novo       "Windows App", "Remote Desktop"
 *
 * So trechos SEM acento. O libnut le o titulo da janela estragando os
 * caracteres acentuados - "Produção" chega como "Produ??o" - entao um
 * "Área de Trabalho Remota" com acento nunca casaria no Windows em
 * portugues. "Trabalho Remota" sobrevive intacto.
 */
const TITULO_REMOTO = /Trabalho Remota|Remote Desktop|Windows App/i;

/**
 * Espera tardia: depois do limite, quanto tempo ainda vigiar a area de
 * transferencia por uma copia atrasada.
 *
 * Cobre os clientes remotos que o titulo nao entrega (Citrix, VMware,
 * outros). Custa so no caso de nada selecionado: o aviso "selecione um
 * texto" demora um pouco mais para aparecer.
 */
const ESPERA_TARDIA = 1200;
const ESPERA_TARDIA_REMOTO = 2000;

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
async function esperarTexto(limiteMs) {
  const limite = Date.now() + limiteMs;

  while (Date.now() < limite) {
    await esperar(INTERVALO_CONSULTA);
    const texto = await clipboard.readText();
    if (texto !== '') return texto;
  }

  return '';
}

/**
 * Depois de a area de transferencia ter sido devolvida, vigia se chega um
 * texto novo - a copia remota atrasada. So conta o que for diferente do que
 * estava la antes, senao a propria devolucao pareceria uma chegada.
 */
async function esperarChegadaTardia(textoAntes, limiteMs) {
  const limite = Date.now() + limiteMs;

  while (Date.now() < limite) {
    await esperar(INTERVALO_CONSULTA * 2);
    const atual = await clipboard.readText();
    if (atual !== '' && atual !== textoAntes) return atual;
  }

  return '';
}

/**
 * Titulo da janela em primeiro plano. Leitura instantanea (menos de 2ms) e
 * que nunca pode derrubar a captura: se falhar, vale como janela comum.
 */
function tituloDaJanelaAtiva() {
  try {
    return libnut.getWindowTitle(libnut.getActiveWindow()) || '';
  } catch (erro) {
    return '';
  }
}

/** A janela da frente e de acesso remoto? */
function ehAcessoRemoto(titulo) {
  return TITULO_REMOTO.test(titulo);
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
 *
 * Tres tempos:
 *   1. espera o texto ate o limite (maior se a janela for remota);
 *   2. nao chegou: devolve a area de transferencia ao que era;
 *   3. vigia mais um pouco - se a copia chegar atrasada, ainda vale.
 */
async function capturar() {
  const titulo = tituloDaJanelaAtiva();
  const remoto = ehAcessoRemoto(titulo);
  const limite = remoto ? LIMITE_CAPTURA_REMOTO : LIMITE_CAPTURA;
  const inicio = Date.now();

  const guardado = await guardarAreaDeTransferencia();
  const textoAntes = await clipboard.readText();
  let texto = '';

  try {
    soltarModificadores();
    await esperar(remoto ? PAUSA_APOS_SOLTAR_REMOTO : PAUSA_APOS_SOLTAR);

    clipboard.clear();
    libnut.keyTap('c', ['control']);

    texto = await esperarTexto(limite);
  } finally {
    await devolverAreaDeTransferencia(guardado);
  }

  let tardio = false;
  if (texto === '') {
    texto = await esperarChegadaTardia(textoAntes, remoto ? ESPERA_TARDIA_REMOTO : ESPERA_TARDIA);
    tardio = texto !== '';

    // A copia atrasada ocupou a area de transferencia: devolve de novo o que
    // o usuario tinha, como numa captura normal.
    if (tardio) await devolverAreaDeTransferencia(guardado);
  }

  diagnostico.registrar('captura', {
    janela: titulo,
    remoto,
    limite,
    resultado: texto === '' ? 'nada' : tardio ? 'chegou-tarde' : 'ok',
    ms: Date.now() - inicio,
    caracteres: texto.length,
  });

  return texto;
}

module.exports = { capturar, ehAcessoRemoto };
