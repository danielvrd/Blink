/**
 * Arquivos do Fast Note em "quadro branco": o Excalidraw dentro do Blink (renderer/quadro).
 *
 * Como a folha livre, o .md NUNCA muda neste modo. O quadro mora ao lado dele, numa pasta escondida da pasta de notas:
 *
 *   <pasta>/.blink/quadro/<nome>.excalidraw     o JSON do Excalidraw ({ type: 'excalidraw', elements, appState, files })
 *
 * E o formato do proprio Excalidraw (serializeAsJSON): o arquivo abre no excalidraw.com ("Abrir"). As imagens coladas
 * no quadro ficam DENTRO do arquivo (em `files`, como data URL), entao nao ha pasta de anexos.
 *
 * Ligar cria um quadro vazio (os topicos do .md nao viram desenho). Desligar so tira o arquivo da lista de
 * "notasQuadro": o .excalidraw fica no disco, para quando ligar de novo - nada se perde.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { shell, clipboard, ClipboardItem, nativeImage } = require('electron');

const config = require('./config');
const notas = require('./notas');

/** Tamanho maximo do arquivo do quadro (uma cena com varias imagens pode ser grande). */
const LIMITE_DA_CENA = 40 * 1024 * 1024;
const MAXIMO_DE_ELEMENTOS = 50000;
const LIMITE_DA_IMAGEM = 60 * 1024 * 1024;

// --- Caminhos ----------------------------------------------------------------------------

function pastaBlink() {
  const raiz = notas.pasta();
  return raiz ? path.join(raiz, '.blink') : null;
}

/** O .excalidraw de um arquivo ("a.md" -> .blink/quadro/a.excalidraw), ou null se o nome nao servir. */
function caminhoDoQuadro(arquivo) {
  const nome = notas.nomeDeArquivo(arquivo);
  const base = pastaBlink();
  if (!nome || !base) return null;
  return path.join(base, 'quadro', nome.replace(/\.md$/i, '') + '.excalidraw');
}

// --- Quem esta em quadro branco ------------------------------------------------------------------

/** Os arquivos em quadro branco que ainda existem na pasta. */
async function arquivosQuadro() {
  const marcados = config.obter('notasQuadro') || [];
  const existentes = await notas.listar();
  return marcados.map((m) => existentes.find((a) => notas.mesmoArquivo(a, m))).filter(Boolean);
}

/** O arquivo esta em quadro branco? (so olha a lista) */
function ehQuadro(arquivo) {
  return (config.obter('notasQuadro') || []).some((m) => notas.mesmoArquivo(m, arquivo));
}

// --- Gravar e ler ----------------------------------------------------------------------------------

async function gravarPorInteiro(completo, texto) {
  await fs.mkdir(path.dirname(completo), { recursive: true });
  const temporario = `${completo}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporario, texto, 'utf8');
    await fs.rename(temporario, completo);
  } catch (erro) {
    try { await fs.rm(temporario, { force: true }); } catch (e) { /* nada a fazer */ }
    throw erro;
  }
}

/** Um quadro vazio, no formato do Excalidraw. O fundo e BRANCO de proposito: no tema escuro o Excalidraw inverte as cores (o branco aparece escuro). */
function cenaVazia() {
  return { type: 'excalidraw', version: 2, source: 'blink', elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} };
}

/** A cena e um JSON do Excalidraw: o tipo certo, uma lista de elementos { id, type }, e appState/files como objetos. */
function cenaValida(cena) {
  if (!cena || typeof cena !== 'object' || Array.isArray(cena) || cena.type !== 'excalidraw') return false;
  if (!Array.isArray(cena.elements) || cena.elements.length > MAXIMO_DE_ELEMENTOS) return false;
  if (!cena.elements.every((e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.type === 'string')) return false;
  const objetoOuAusente = (v) => v === undefined || (v !== null && typeof v === 'object' && !Array.isArray(v));
  return objetoOuAusente(cena.appState) && objetoOuAusente(cena.files);
}

/** Le o quadro de um arquivo. null se ainda nao existe ou o arquivo esta estragado. */
async function lerQuadro(arquivo) {
  const completo = caminhoDoQuadro(arquivo);
  if (!completo) return null;
  try {
    const cena = JSON.parse(await fs.readFile(completo, 'utf8'));
    return cenaValida(cena) ? cena : null;
  } catch (erro) {
    if (erro.code !== 'ENOENT') console.warn('[notas-quadro] nao consegui ler o quadro:', erro.message);
    return null;
  }
}

/** Grava o quadro (so de um arquivo em quadro branco, e so uma cena valida). */
async function salvar(arquivo, cena) {
  if (!ehQuadro(arquivo)) return { ok: false, motivo: 'nao-quadro' };
  const completo = caminhoDoQuadro(arquivo);
  if (!completo) return { ok: false, motivo: 'nome' };
  if (!cenaValida(cena)) return { ok: false, motivo: 'entrada' };
  const texto = JSON.stringify(cena);
  if (Buffer.byteLength(texto, 'utf8') > LIMITE_DA_CENA) return { ok: false, motivo: 'grande' };
  await gravarPorInteiro(completo, texto);
  return { ok: true };
}

/** O mesmo, sincrono: para o fechamento da janela. */
function salvarSincrono(arquivo, cena) {
  try {
    if (!ehQuadro(arquivo)) return false;
    const completo = caminhoDoQuadro(arquivo);
    if (!completo || !cenaValida(cena)) return false;
    const texto = JSON.stringify(cena);
    if (Buffer.byteLength(texto, 'utf8') > LIMITE_DA_CENA) return false;
    fsSync.mkdirSync(path.dirname(completo), { recursive: true });
    const temporario = `${completo}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fsSync.writeFileSync(temporario, texto, 'utf8');
    fsSync.renameSync(temporario, completo);
    return true;
  } catch (erro) {
    return false;
  }
}

// --- Ligar e desligar -------------------------------------------------------------------------------

/**
 * Liga o quadro branco num arquivo comum. Recusa o task.md, arquivo com relogio, com cadeado ou em folha livre.
 * Devolve { ok, cena }: o quadro guardado (ligado antes) ou um quadro vazio.
 */
async function ativar(arquivo) {
  const nome = notas.nomeDeArquivo(arquivo);
  if (!nome) return { ok: false, motivo: 'nome' };

  const existente = (await notas.listar()).find((a) => notas.mesmoArquivo(a, nome));
  if (!existente) return { ok: false, motivo: 'inexistente' };
  if (notas.mesmoArquivo(existente, notas.ARQUIVO_TAREFAS)) return { ok: false, motivo: 'tarefas' };
  if ((config.obter('notasHistorico') || []).some((h) => notas.mesmoArquivo(h, existente))) return { ok: false, motivo: 'historico' };
  if (notas.ehArquivoLivre(existente)) return { ok: false, motivo: 'livre' };
  if (notas.ehArquivoTexto(existente)) return { ok: false, motivo: 'texto' };
  if (await notas.ehArquivoPrivado(notas.caminhoDe(existente))) return { ok: false, motivo: 'privado' };

  const atuais = config.obter('notasQuadro') || [];
  let cena = await lerQuadro(existente);
  if (!cena) {
    cena = cenaVazia();
    await gravarPorInteiro(caminhoDoQuadro(existente), JSON.stringify(cena));
  }
  if (!atuais.some((a) => notas.mesmoArquivo(a, existente))) {
    config.definirNotasQuadro([...atuais, existente]);
  }
  return { ok: true, cena };
}

/** Desliga: tira da lista. O .excalidraw continua no disco, para quando ligar de novo. */
async function desativar(arquivo) {
  const atuais = config.obter('notasQuadro') || [];
  const restantes = atuais.filter((a) => !notas.mesmoArquivo(a, arquivo));
  if (restantes.length === atuais.length) return { ok: false, motivo: 'nao-quadro' };
  config.definirNotasQuadro(restantes);
  return { ok: true };
}

/** Manda para a Lixeira o .excalidraw de um arquivo e tira o arquivo da lista (quando o arquivo vai para a Lixeira). */
async function descartarQuadro(arquivo) {
  const completo = caminhoDoQuadro(arquivo);
  if (completo) {
    try { await shell.trashItem(completo); } catch (erro) { /* ja nao estava la */ }
  }
  const atuais = config.obter('notasQuadro') || [];
  config.definirNotasQuadro(atuais.filter((a) => !notas.mesmoArquivo(a, arquivo)));
}

// --- Copiar como imagem ------------------------------------------------------------------------------------

/** Poe uma imagem PNG (bytes vindos da tela, do exportToBlob do Excalidraw) na area de transferencia. */
async function copiarImagem(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes || []);
  if (buffer.length === 0 || buffer.length > LIMITE_DA_IMAGEM) return { ok: false, motivo: 'entrada' };
  const imagem = nativeImage.createFromBuffer(buffer);
  if (imagem.isEmpty()) return { ok: false, motivo: 'imagem' };
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([buffer], { type: 'image/png' }) })]);
  const { width, height } = imagem.getSize();
  return { ok: true, largura: width, altura: height };
}

module.exports = {
  arquivosQuadro, ehQuadro, caminhoDoQuadro, lerQuadro, salvar, salvarSincrono, ativar, desativar, descartarQuadro,
  copiarImagem, cenaVazia, cenaValida, LIMITE_DA_CENA,
};
