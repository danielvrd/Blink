/**
 * Arquivos do Fast Note em "folha livre": um editor tipo Notion (Quill) com um desenho de caneta por cima.
 *
 * O .md NUNCA muda neste modo. A folha mora ao lado dele, numa pasta escondida da pasta de notas:
 *
 *   <pasta>/.blink/livre/<nome>.json      { versao, conteudo (Delta do Quill), tinta [tracos], atualizado }
 *   <pasta>/.blink/anexos/<uuid>.<ext>    as imagens coladas ou arrastadas
 *
 * Ligar: a folha nasce com os topicos do .md como uma lista. Se ja existe uma folha guardada (o modo foi ligado
 * antes e desligado depois), ela volta como estava: desligar nao perde nada. Desligar so tira o arquivo da lista
 * de "notasLivres" do config - a folha e as imagens ficam no disco.
 *
 * As imagens so saem daqui pelo protocolo blink-anexo://<uuid>.<ext>: registrado em main.js
 * (registrarProtocolo), serve SO nomes no formato exato abaixo, da pasta de anexos, e nada mais.
 *
 * O Quill nao tem nada a ver com o disco aqui: a tela manda e recebe o Delta como JSON.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { protocol, shell } = require('electron');

const config = require('./config');
const notas = require('./notas');

/** A versao do formato da folha, para uma versao futura saber ler a de hoje. */
const VERSAO = 1;

/** Tamanhos maximos: uma imagem, e o JSON da folha (Delta + tinta). */
const LIMITE_DA_IMAGEM = 15 * 1024 * 1024;
const LIMITE_DA_FOLHA = 25 * 1024 * 1024;

/** O nome de uma imagem guardada: so isto e servido pelo protocolo. */
const NOME_DE_ANEXO = /^[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$/;

const TIPOS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** A cor e a espessura aceitas num traco da tinta, e o limite de pontos (uma folha nao precisa de mais). */
const COR_VALIDA = /^#[0-9a-f]{6}$/i;
const MAXIMO_DE_TRACOS = 20000;
const MAXIMO_DE_PONTOS = 400000;

// --- Caminhos ---------------------------------------------------------------------------

/** A pasta .blink dentro da pasta de notas, ou null sem pasta configurada. */
function pastaBlink() {
  const raiz = notas.pasta();
  return raiz ? path.join(raiz, '.blink') : null;
}

function pastaDeAnexos() {
  const base = pastaBlink();
  return base ? path.join(base, 'anexos') : null;
}

/** O .json da folha de um arquivo ("a.md" -> .blink/livre/a.json), ou null se o nome nao servir. */
function caminhoDaFolha(arquivo) {
  const nome = notas.nomeDeArquivo(arquivo);
  const base = pastaBlink();
  if (!nome || !base) return null;
  return path.join(base, 'livre', nome.replace(/\.md$/i, '') + '.json');
}

// --- Quem esta em folha livre ----------------------------------------------------------------

/** Os arquivos em folha livre que ainda existem na pasta. */
async function arquivosLivres() {
  const marcados = config.obter('notasLivres') || [];
  const existentes = await notas.listar();
  return marcados.map((m) => existentes.find((a) => notas.mesmoArquivo(a, m))).filter(Boolean);
}

/** O arquivo esta em folha livre? (so olha a lista; a pasta nao e consultada) */
function ehLivre(arquivo) {
  return (config.obter('notasLivres') || []).some((m) => notas.mesmoArquivo(m, arquivo));
}

// --- Gravar e ler -------------------------------------------------------------------------------

/** Escreve por inteiro e com seguranca: um arquivo ao lado, depois renomeia por cima. */
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

/** O Delta e uma lista de operacoes { insert, attributes? }; nada alem disso entra no arquivo. */
function conteudoValido(conteudo) {
  if (!conteudo || typeof conteudo !== 'object' || !Array.isArray(conteudo.ops)) return false;
  return conteudo.ops.every((op) => op && typeof op === 'object' && op.insert !== undefined
    && (typeof op.insert === 'string' || (typeof op.insert === 'object' && op.insert !== null))
    && (op.attributes === undefined || (typeof op.attributes === 'object' && op.attributes !== null)));
}

/** A tinta e uma lista de tracos { t, c, w, p: [[x, y], ...] }. */
function tintaValida(tinta) {
  if (!Array.isArray(tinta) || tinta.length > MAXIMO_DE_TRACOS) return false;
  let pontos = 0;
  for (const traco of tinta) {
    if (!traco || (traco.t !== 'caneta' && traco.t !== 'marca')) return false;
    if (typeof traco.c !== 'string' || !COR_VALIDA.test(traco.c)) return false;
    if (typeof traco.w !== 'number' || !(traco.w > 0 && traco.w <= 80)) return false;
    if (!Array.isArray(traco.p) || traco.p.length === 0) return false;
    pontos += traco.p.length;
    if (pontos > MAXIMO_DE_PONTOS) return false;
    if (!traco.p.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return false;
  }
  return true;
}

/** Os topicos do .md como um Delta: cada topico uma linha de lista; uma linha a mais do mesmo topico vem recuada. */
function deltaDosTopicos(topicos) {
  const ops = [];
  for (const topico of topicos) {
    const linhas = String(topico).split('\n');
    linhas.forEach((linha, i) => {
      if (linha !== '') ops.push({ insert: linha });
      ops.push(i === 0 ? { insert: '\n', attributes: { list: 'bullet' } } : { insert: '\n', attributes: { list: 'bullet', indent: 1 } });
    });
  }
  if (ops.length === 0) ops.push({ insert: '\n' });
  return { ops };
}

/** Le a folha de um arquivo. null se ela ainda nao existe ou o arquivo esta estragado. */
async function lerFolha(arquivo) {
  const completo = caminhoDaFolha(arquivo);
  if (!completo) return null;

  try {
    const dados = JSON.parse(await fs.readFile(completo, 'utf8'));
    if (!conteudoValido(dados.conteudo) || !tintaValida(dados.tinta || [])) return null;
    return { versao: dados.versao || VERSAO, conteudo: dados.conteudo, tinta: dados.tinta || [], atualizado: dados.atualizado || null };
  } catch (erro) {
    if (erro.code === 'ENOENT') return null;
    console.warn('[notas-livres] nao consegui ler a folha:', erro.message);
    return null;
  }
}

/** Grava a folha. Recusa o que nao e um Delta + tinta validos (a tela nao e de confianca para gravar qualquer coisa). */
async function salvar(arquivo, { conteudo, tinta }) {
  if (!ehLivre(arquivo)) return { ok: false, motivo: 'nao-livre' };
  const completo = caminhoDaFolha(arquivo);
  if (!completo) return { ok: false, motivo: 'nome' };
  if (!conteudoValido(conteudo) || !tintaValida(tinta)) return { ok: false, motivo: 'entrada' };

  const texto = JSON.stringify({ versao: VERSAO, conteudo, tinta, atualizado: new Date().toISOString() });
  if (Buffer.byteLength(texto, 'utf8') > LIMITE_DA_FOLHA) return { ok: false, motivo: 'grande' };

  await gravarPorInteiro(completo, texto);
  return { ok: true };
}

/** O mesmo, sincrono: para o fechamento da janela, em que uma gravacao assincrona nao teria tempo de terminar. */
function salvarSincrono(arquivo, { conteudo, tinta }) {
  try {
    if (!ehLivre(arquivo)) return false;
    const completo = caminhoDaFolha(arquivo);
    if (!completo || !conteudoValido(conteudo) || !tintaValida(tinta)) return false;
    const texto = JSON.stringify({ versao: VERSAO, conteudo, tinta, atualizado: new Date().toISOString() });
    if (Buffer.byteLength(texto, 'utf8') > LIMITE_DA_FOLHA) return false;
    fsSync.mkdirSync(path.dirname(completo), { recursive: true });
    const temporario = `${completo}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fsSync.writeFileSync(temporario, texto, 'utf8');
    fsSync.renameSync(temporario, completo);
    return true;
  } catch (erro) {
    return false;
  }
}

// --- Ligar e desligar ------------------------------------------------------------------------------

/**
 * Liga a folha livre num arquivo comum. Recusa o task.md, arquivo com o relogio ligado e arquivo com cadeado.
 * Devolve { ok, folha }: a folha existente (ligado antes) ou uma nova, com os topicos do .md em lista.
 */
async function ativar(arquivo) {
  const nome = notas.nomeDeArquivo(arquivo);
  if (!nome) return { ok: false, motivo: 'nome' };

  const existente = (await notas.listar()).find((a) => notas.mesmoArquivo(a, nome));
  if (!existente) return { ok: false, motivo: 'inexistente' };
  if (notas.mesmoArquivo(existente, notas.ARQUIVO_TAREFAS)) return { ok: false, motivo: 'tarefas' };
  if ((config.obter('notasHistorico') || []).some((h) => notas.mesmoArquivo(h, existente))) return { ok: false, motivo: 'historico' };

  const completo = notas.caminhoDe(existente);
  if (await notas.ehArquivoPrivado(completo)) return { ok: false, motivo: 'privado' };

  const atuais = config.obter('notasLivres') || [];
  if (atuais.some((a) => notas.mesmoArquivo(a, existente))) {
    return { ok: true, folha: (await lerFolha(existente)) || { versao: VERSAO, conteudo: { ops: [{ insert: '\n' }] }, tinta: [] } };
  }

  // Uma folha que ja existe volta como estava; senao nasce dos topicos do .md.
  let folha = await lerFolha(existente);
  if (!folha) {
    const { topicos } = await notas.ler(existente);
    folha = { versao: VERSAO, conteudo: deltaDosTopicos(topicos), tinta: [] };
    await gravarPorInteiro(caminhoDaFolha(existente), JSON.stringify({ ...folha, atualizado: new Date().toISOString() }));
  }

  config.definirNotasLivres([...atuais.filter((a) => !notas.mesmoArquivo(a, existente)), existente]);
  return { ok: true, folha };
}

/** Desliga: tira da lista. A folha e as imagens continuam no disco, para quando ligar de novo. */
async function desativar(arquivo) {
  const atuais = config.obter('notasLivres') || [];
  const restantes = atuais.filter((a) => !notas.mesmoArquivo(a, arquivo));
  if (restantes.length === atuais.length) return { ok: false, motivo: 'nao-livre' };
  config.definirNotasLivres(restantes);
  return { ok: true };
}

// --- Escrever de fora (o "/nota texto" de outra nota) ------------------------------------------------

/** Acrescenta um paragrafo no fim da folha, sem a tela dela aberta. */
async function adicionarTexto(arquivo, texto) {
  if (!ehLivre(arquivo)) return false;
  const folha = (await lerFolha(arquivo)) || { versao: VERSAO, conteudo: { ops: [{ insert: '\n' }] }, tinta: [] };

  const ops = [...folha.conteudo.ops];
  // O Delta termina sempre numa quebra de linha; o paragrafo novo entra depois dela.
  ops.push({ insert: String(texto) + '\n' });
  const resultado = await salvar(arquivo, { conteudo: { ops }, tinta: folha.tinta });
  return resultado.ok;
}

// --- Imagens ---------------------------------------------------------------------------------------------

/** O tipo da imagem pelos primeiros bytes (nao se confia no que a tela diz): { ext, mime } ou null. */
function tipoDaImagem(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: TIPOS.png };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: TIPOS.jpg };
  if (b.length >= 6 && (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a')) return { ext: 'gif', mime: TIPOS.gif };
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: TIPOS.webp };
  return null;
}

/** Guarda uma imagem colada ou arrastada. Devolve { ok, url } com o endereco blink-anexo://... */
async function anexarImagem(arquivo, bytes) {
  if (!ehLivre(arquivo)) return { ok: false, motivo: 'nao-livre' };
  const pasta = pastaDeAnexos();
  if (!pasta) return { ok: false, motivo: 'sem-pasta' };
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes) && !(bytes instanceof ArrayBuffer)) return { ok: false, motivo: 'entrada' };

  const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
  if (buffer.length === 0) return { ok: false, motivo: 'entrada' };
  if (buffer.length > LIMITE_DA_IMAGEM) return { ok: false, motivo: 'grande' };

  const tipo = tipoDaImagem(buffer);
  if (!tipo) return { ok: false, motivo: 'tipo' };

  const nome = `${crypto.randomUUID()}.${tipo.ext}`;
  await fs.mkdir(pasta, { recursive: true });
  await fs.writeFile(path.join(pasta, nome), buffer);
  return { ok: true, url: `blink-anexo://${nome}` };
}

/** Os nomes de imagem citados no JSON de uma folha (o Delta tem { insert: { image: 'blink-anexo://nome' } }). */
function anexosCitados(folha) {
  const nomes = new Set();
  if (!folha) return nomes;
  for (const op of folha.conteudo.ops) {
    const imagem = op.insert && typeof op.insert === 'object' ? op.insert.image : null;
    if (typeof imagem === 'string' && imagem.startsWith('blink-anexo://')) {
      const nome = imagem.slice('blink-anexo://'.length);
      if (NOME_DE_ANEXO.test(nome)) nomes.add(nome);
    }
  }
  return nomes;
}

/**
 * Manda para a Lixeira a folha de um arquivo e as imagens que SO ela usa (as que outra folha tambem cita ficam).
 * Chamado quando o arquivo vai para a Lixeira.
 */
async function descartarFolha(arquivo) {
  const completo = caminhoDaFolha(arquivo);
  if (!completo) return;

  const folha = await lerFolha(arquivo);
  const proprios = anexosCitados(folha);

  // Imagens que outras folhas tambem usam nao saem.
  const pastaLivre = path.dirname(completo);
  let outras = [];
  try { outras = await fs.readdir(pastaLivre); } catch (erro) { /* sem pasta, sem outras folhas */ }
  for (const nomeJson of outras) {
    if (!nomeJson.endsWith('.json') || path.join(pastaLivre, nomeJson) === completo) continue;
    try {
      const outra = JSON.parse(await fs.readFile(path.join(pastaLivre, nomeJson), 'utf8'));
      if (outra && outra.conteudo && Array.isArray(outra.conteudo.ops)) {
        for (const nome of anexosCitados({ conteudo: outra.conteudo })) proprios.delete(nome);
      }
    } catch (erro) { /* folha estragada: nao protege nada */ }
  }

  const anexos = pastaDeAnexos();
  for (const nome of proprios) {
    try { await shell.trashItem(path.join(anexos, nome)); } catch (erro) { /* ja nao estava la */ }
  }
  try { await shell.trashItem(completo); } catch (erro) { /* ja nao estava la */ }

  const atuais = config.obter('notasLivres') || [];
  config.definirNotasLivres(atuais.filter((a) => !notas.mesmoArquivo(a, arquivo)));
}

// --- O protocolo blink-anexo:// ------------------------------------------------------------------------------

/**
 * Antes do app ficar pronto: declara o esquema como "privilegiado" (padrao e seguro, para a tela poder carregar
 * <img src="blink-anexo://...">). Chamado uma vez, por main.js, antes do whenReady.
 */
function registrarEsquema() {
  protocol.registerSchemesAsPrivileged([{ scheme: 'blink-anexo', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

/**
 * Atende os pedidos de imagem. Serve SO um arquivo da pasta de anexos cujo nome bate exatamente com
 * NOME_DE_ANEXO (uuid + extensao de imagem): qualquer outra coisa - outro nome, "..", barra, caminho - e 404.
 */
function atenderProtocolo() {
  protocol.handle('blink-anexo', async (pedido) => {
    try {
      const nome = nomeDoPedido(pedido.url);
      const pasta = pastaDeAnexos();
      if (!nome || !pasta) return new Response('nao encontrado', { status: 404 });

      const completo = path.join(pasta, nome);
      // Segunda tranca: o caminho resolvido tem que estar dentro da pasta de anexos.
      if (path.dirname(path.resolve(completo)) !== path.resolve(pasta)) return new Response('nao encontrado', { status: 404 });

      const dados = await fs.readFile(completo);
      const ext = nome.split('.').pop();
      return new Response(dados, { headers: { 'Content-Type': TIPOS[ext], 'Cache-Control': 'no-store' } });
    } catch (erro) {
      return new Response('nao encontrado', { status: 404 });
    }
  });
}

/**
 * O nome de arquivo de um pedido "blink-anexo://<uuid>.png", ou null se nao for exatamente isso.
 * O endereco e lido na mao: nada de decodificar %2e%2e, barra ou qualquer outro caminho.
 */
function nomeDoPedido(url) {
  const prefixo = 'blink-anexo://';
  if (typeof url !== 'string' || !url.toLowerCase().startsWith(prefixo)) return null;
  const nome = url.slice(prefixo.length).replace(/\/$/, '');
  return NOME_DE_ANEXO.test(nome) ? nome : null;
}

module.exports = {
  VERSAO,
  NOME_DE_ANEXO,
  LIMITE_DA_IMAGEM,
  arquivosLivres,
  ehLivre,
  lerFolha,
  salvar,
  salvarSincrono,
  ativar,
  desativar,
  adicionarTexto,
  anexarImagem,
  descartarFolha,
  registrarEsquema,
  atenderProtocolo,
  nomeDoPedido,
  deltaDosTopicos,
  tipoDaImagem,
  caminhoDaFolha,
  pastaDeAnexos,
};
