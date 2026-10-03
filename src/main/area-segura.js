/**
 * Escrever um segredo (a senha de uma credencial) na area de transferencia SEM deixar o Windows guarda-lo.
 *
 * O Windows mantem o historico da area de transferencia (Win+V) e pode sincroniza-lo com a nuvem; uma
 * senha copiada normalmente entraria ali, em texto puro. Os programas de senha pedem para ficar de fora
 * marcando o conteudo com formatos especiais da area de transferencia:
 *
 *   ExcludeClipboardContentFromMonitorProcessing   presente = nenhum monitor de area de transferencia processa
 *   CanIncludeInClipboardHistory                   DWORD 0 = fora do historico (Win+V)
 *   CanUploadToCloudClipboard                      DWORD 0 = fora da sincronizacao com a nuvem
 *
 * A API de area de transferencia do Electron nao da: cada escrita de um formato proprio (writeBuffer) apaga
 * o que estava la, entao nao ha como juntar o texto com os formatos. Aqui e feito direto pelo Win32, com o
 * koffi (o mesmo de teclado.js): abre a area de transferencia, esvazia e poe o texto e os tres formatos
 * numa operacao so.
 *
 * Qualquer falha (sem janela para ser a dona da area de transferencia, area ocupada, koffi indisponivel,
 * outro sistema) cai no clipboard.writeText de sempre, e escrever() devolve false: a senha foi copiada, mas
 * pode aparecer no historico. A tela avisa nesse caso.
 */

const { BrowserWindow, clipboard } = require('electron');

const CF_UNICODETEXT = 13;
/** Memoria movel e ZERADA: os formatos de exclusao sao so zeros (um DWORD 0, ou presenca), sem escrever nada. */
const GMEM_MOVEABLE_ZERADA = 0x0042;
const FORMATOS_DE_EXCLUSAO = [
  { nome: 'ExcludeClipboardContentFromMonitorProcessing', bytes: 1 },
  { nome: 'CanIncludeInClipboardHistory', bytes: 4 },
  { nome: 'CanUploadToCloudClipboard', bytes: 4 },
];

let api = null;
let tentou = false;

/** Carrega o Win32 uma vez. Qualquer falha deixa `api` como null. */
function carregar() {
  if (tentou) return;
  tentou = true;
  if (process.platform !== 'win32') return;

  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    api = {
      koffi,
      OpenClipboard: user32.func('bool __stdcall OpenClipboard(uintptr_t hWnd)'),
      CloseClipboard: user32.func('bool __stdcall CloseClipboard()'),
      EmptyClipboard: user32.func('bool __stdcall EmptyClipboard()'),
      SetClipboardData: user32.func('void *__stdcall SetClipboardData(uint32_t uFormat, void *hMem)'),
      RegisterClipboardFormatW: user32.func('uint32_t __stdcall RegisterClipboardFormatW(str16 lpszFormat)'),
      IsClipboardFormatAvailable: user32.func('bool __stdcall IsClipboardFormatAvailable(uint32_t format)'),
      GlobalAlloc: kernel32.func('void *__stdcall GlobalAlloc(uint32_t uFlags, size_t dwBytes)'),
      GlobalLock: kernel32.func('void *__stdcall GlobalLock(void *hMem)'),
      GlobalUnlock: kernel32.func('bool __stdcall GlobalUnlock(void *hMem)'),
      GlobalFree: kernel32.func('void *__stdcall GlobalFree(void *hMem)'),
      lstrcpyW: kernel32.func('void *__stdcall lstrcpyW(void *destino, str16 origem)'),
    };
  } catch (erro) {
    console.warn('[area-segura] nao consegui carregar o Win32:', erro.message);
    api = null;
  }
}

/** O numero da janela de uma BrowserWindow viva (a dona da area de transferencia), ou 0. */
function donaDaAreaDeTransferencia() {
  for (const janela of BrowserWindow.getAllWindows()) {
    if (janela.isDestroyed()) continue;
    const alca = janela.getNativeWindowHandle();
    if (alca && alca.length >= 8) return alca.readBigUInt64LE(0);
  }
  return 0n;
}

/**
 * Entrega um bloco de memoria para a area de transferencia. Aceitou: o bloco e do Windows e nao se libera.
 * Recusou: libera aqui.
 *
 * NUNCA se escreve na memoria nativa pelo JavaScript: o Electron proibe um ArrayBuffer sobre memoria de fora
 * (koffi.view derruba o processo inteiro, sem excecao para capturar). O bloco ja nasce zerado, e o texto
 * entra pelo lstrcpyW, que o koffi chama com a string do JavaScript.
 */
function entregar(formato, bytes, texto) {
  const memoria = api.GlobalAlloc(GMEM_MOVEABLE_ZERADA, bytes);
  if (!memoria) return false;

  if (texto !== undefined) {
    const destino = api.GlobalLock(memoria);
    if (!destino) {
      api.GlobalFree(memoria);
      return false;
    }
    api.lstrcpyW(destino, texto);
    api.GlobalUnlock(memoria);
  }

  if (!api.SetClipboardData(formato, memoria)) {
    api.GlobalFree(memoria);
    return false;
  }
  return true;
}

/** Tenta escrever pelo Win32. Devolve true se o texto E os tres formatos foram escritos. */
function escreverMarcado(texto) {
  const dona = donaDaAreaDeTransferencia();
  if (dona === 0n) return false;

  // A area de transferencia pode estar ocupada por outro programa naquele instante: algumas tentativas.
  let aberta = false;
  for (let i = 0; i < 6 && !aberta; i++) {
    aberta = api.OpenClipboard(dona);
    if (!aberta) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  if (!aberta) return false;

  try {
    if (!api.EmptyClipboard()) return false;

    // O texto, em UTF-16, com lugar para o zero do fim (a memoria ja vem zerada).
    if (!entregar(CF_UNICODETEXT, (texto.length + 1) * 2, texto)) return false;

    let marcado = true;
    for (const { nome, bytes } of FORMATOS_DE_EXCLUSAO) {
      const formato = api.RegisterClipboardFormatW(nome);
      if (!formato || !entregar(formato, bytes)) marcado = false;
    }
    return marcado;
  } finally {
    api.CloseClipboard();
  }
}

/**
 * Escreve o texto na area de transferencia, marcado para ficar fora do historico e da nuvem.
 * Devolve true se foi marcado; false se caiu no clipboard.writeText comum (o texto foi copiado do mesmo jeito).
 */
function escrever(texto) {
  carregar();

  if (api) {
    try {
      if (escreverMarcado(texto)) return true;
    } catch (erro) {
      console.warn('[area-segura] falhou, copiando sem a marca:', erro.message);
    }
  }

  clipboard.writeText(texto);
  return false;
}

/** Os nomes dos formatos de exclusao e se estao na area de transferencia agora (para os testes). */
function formatosDeExclusaoPresentes() {
  carregar();
  if (!api) return null;
  const presentes = {};
  for (const { nome } of FORMATOS_DE_EXCLUSAO) presentes[nome] = api.IsClipboardFormatAvailable(api.RegisterClipboardFormatW(nome));
  return presentes;
}

module.exports = { escrever, formatosDeExclusaoPresentes };
