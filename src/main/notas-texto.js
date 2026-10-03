/**
 * Arquivos do Fast Note em "modo texto": o .md inteiro aberto como um editor de texto simples (como o Bloco de Notas),
 * sem a lista de topicos.
 *
 * E o modo em que um arquivo nasce quando uma aba rapida (so texto) e salva, e tambem se liga e desliga no seletor. O
 * conteudo e EXATAMENTE o texto do .md: o Blink nao acrescenta nem tira nada (nem a linha final em branco). Quem esta
 * em modo texto fica numa lista do config ("notasTexto"); fora dela o arquivo volta a ser lido como topicos, com o
 * mesmo .md.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('./config');
const notas = require('./notas');

/** O maior texto que o editor aceita (um .md maior que isso nao e uma anotacao). */
const LIMITE_DO_TEXTO = 10 * 1024 * 1024;

// --- Quem esta em modo texto ------------------------------------------------------------------

function ehTexto(arquivo) {
  return (config.obter('notasTexto') || []).some((a) => notas.mesmoArquivo(a, arquivo));
}

/** Os arquivos em modo texto que ainda existem na pasta. */
async function arquivosTexto() {
  const marcados = config.obter('notasTexto') || [];
  const existentes = await notas.listar();
  return marcados.map((m) => existentes.find((a) => notas.mesmoArquivo(a, m))).filter(Boolean);
}

// --- Gravar e ler ----------------------------------------------------------------------------------

async function gravarPorInteiro(completo, texto) {
  const temporario = `${completo}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporario, texto, 'utf8');
    await fs.rename(temporario, completo);
  } catch (erro) {
    try { await fs.rm(temporario, { force: true }); } catch (e) { /* nada a fazer */ }
    throw erro;
  }
}

/** Le o .md inteiro de um arquivo em modo texto. */
async function ler(arquivo) {
  if (!ehTexto(arquivo)) return { ok: false, motivo: 'nao-texto' };
  const completo = notas.caminhoDe(arquivo);
  if (!completo) return { ok: false, motivo: 'nome' };
  try {
    return { ok: true, texto: await fs.readFile(completo, 'utf8') };
  } catch (erro) {
    return { ok: false, motivo: erro.code === 'ENOENT' ? 'inexistente' : 'erro' };
  }
}

/** Regrava o .md inteiro com o texto recebido (so de um arquivo em modo texto). */
async function salvar(arquivo, texto) {
  if (!ehTexto(arquivo)) return { ok: false, motivo: 'nao-texto' };
  const completo = notas.caminhoDe(arquivo);
  if (!completo) return { ok: false, motivo: 'nome' };
  if (typeof texto !== 'string') return { ok: false, motivo: 'entrada' };
  if (Buffer.byteLength(texto, 'utf8') > LIMITE_DO_TEXTO) return { ok: false, motivo: 'grande' };
  await gravarPorInteiro(completo, texto);
  return { ok: true };
}

/** O mesmo, sincrono: para o fechamento da janela. */
function salvarSincrono(arquivo, texto) {
  try {
    if (!ehTexto(arquivo) || typeof texto !== 'string' || Buffer.byteLength(texto, 'utf8') > LIMITE_DO_TEXTO) return false;
    const completo = notas.caminhoDe(arquivo);
    if (!completo) return false;
    const temporario = `${completo}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fsSync.writeFileSync(temporario, texto, 'utf8');
    fsSync.renameSync(temporario, completo);
    return true;
  } catch (erro) {
    return false;
  }
}

/** Acrescenta uma linha no fim (o "/nome texto" escrito em outra nota). */
async function adicionarTexto(arquivo, texto) {
  const atual = await ler(arquivo);
  if (!atual.ok) return false;
  const separador = atual.texto === '' || atual.texto.endsWith('\n') ? '' : '\n';
  const r = await salvar(arquivo, `${atual.texto}${separador}${texto}\n`);
  return r.ok;
}

// --- Ligar, desligar e criar --------------------------------------------------------------------------

/** Liga o modo texto num arquivo comum. Recusa o task.md, relogio, cadeado, folha livre e quadro. */
async function ativar(arquivo) {
  const nome = notas.nomeDeArquivo(arquivo);
  if (!nome) return { ok: false, motivo: 'nome' };
  const existente = (await notas.listar()).find((a) => notas.mesmoArquivo(a, nome));
  if (!existente) return { ok: false, motivo: 'inexistente' };
  if (notas.mesmoArquivo(existente, notas.ARQUIVO_TAREFAS)) return { ok: false, motivo: 'tarefas' };
  if ((config.obter('notasHistorico') || []).some((h) => notas.mesmoArquivo(h, existente))) return { ok: false, motivo: 'historico' };
  if (notas.ehArquivoLivre(existente)) return { ok: false, motivo: 'livre' };
  if (notas.ehArquivoQuadro(existente)) return { ok: false, motivo: 'quadro' };
  if (await notas.ehArquivoPrivado(notas.caminhoDe(existente))) return { ok: false, motivo: 'privado' };

  const atuais = config.obter('notasTexto') || [];
  if (!atuais.some((a) => notas.mesmoArquivo(a, existente))) config.definirNotasTexto([...atuais, existente]);
  const lido = await ler(existente);
  return lido.ok ? { ok: true, texto: lido.texto } : { ok: false, motivo: lido.motivo };
}

/** Desliga: o arquivo volta a ser lido como topicos (o .md nao muda). */
async function desativar(arquivo) {
  const atuais = config.obter('notasTexto') || [];
  const restantes = atuais.filter((a) => !notas.mesmoArquivo(a, arquivo));
  if (restantes.length === atuais.length) return { ok: false, motivo: 'nao-texto' };
  config.definirNotasTexto(restantes);
  return { ok: true };
}

/** O arquivo foi para a Lixeira: tira da lista. */
function esquecer(arquivo) {
  const atuais = config.obter('notasTexto') || [];
  config.definirNotasTexto(atuais.filter((a) => !notas.mesmoArquivo(a, arquivo)));
}

/**
 * Cria um .md novo com o texto exato de uma aba rapida e o poe em modo texto. Recusa nome invalido, o nome do
 * task.md e um nome que ja existe (nunca sobrescreve). Devolve { ok, nome } com o nome como ficou na pasta.
 */
async function criar(nomeDigitado, texto) {
  if (typeof texto !== 'string' || Buffer.byteLength(texto, 'utf8') > LIMITE_DO_TEXTO) return { ok: false, motivo: 'entrada' };
  const pasta = notas.pasta();
  if (!pasta) return { ok: false, motivo: 'sem-pasta' };
  const nome = notas.nomeDeArquivo(nomeDigitado);
  if (!nome) return { ok: false, motivo: 'nome' };
  if (notas.mesmoArquivo(nome, notas.ARQUIVO_TAREFAS)) return { ok: false, motivo: 'tarefas' };
  if ((await notas.listar()).some((a) => notas.mesmoArquivo(a, nome))) return { ok: false, motivo: 'existe' };

  const completo = notas.caminhoDe(nome);
  if (!completo) return { ok: false, motivo: 'nome' };
  try {
    await fs.mkdir(path.dirname(completo), { recursive: true });
    await fs.writeFile(completo, texto, { encoding: 'utf8', flag: 'wx' });
  } catch (erro) {
    return { ok: false, motivo: erro.code === 'EEXIST' ? 'existe' : 'erro' };
  }
  const atuais = config.obter('notasTexto') || [];
  config.definirNotasTexto([...atuais.filter((a) => !notas.mesmoArquivo(a, nome)), nome]);
  return { ok: true, nome };
}

module.exports = { ehTexto, arquivosTexto, ler, salvar, salvarSincrono, adicionarTexto, ativar, desativar, esquecer, criar, LIMITE_DO_TEXTO };
