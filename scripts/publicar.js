/**
 * Publica uma versao nova do Blink.
 *
 * Rode com:  npm run publicar
 *
 * Faz, nesta ordem:
 *   1. confere que nao ha mudanca por commitar;
 *   2. cria e envia a tag da versao;
 *   3. limpa o dist/;
 *   4. empacota e cria a Release no GitHub;
 *   5. confere a Release e envia o que tiver faltado.
 *
 * Cada passo alem do 4 existe por causa de um erro real que aconteceu:
 *
 * - O GitHub recusa criar uma Release publicada sem uma tag que exista no
 *   repositorio ("Published releases must have a valid tag"). Sem a tag o
 *   empacotamento inteiro roda e so falha no fim, na hora de publicar.
 * - O dist/ guarda o latest.yml do empacotamento anterior. Se a publicacao
 *   falhar no meio, sobra o arquivo velho apontando para a versao passada -
 *   e o app le "ja esta atualizado" para sempre.
 * - A tag aponta para o commit atual. Se houver mudanca nao commitada, a
 *   tag e o instalador nao batem com o que esta no repositorio.
 * - O electron-builder envia os arquivos em paralelo, e quando a Release
 *   ainda nao existe cada envio tenta cria-la. Um ganha, e o arquivo do
 *   outro se perde SEM erro nenhum - o comando termina com sucesso e a
 *   Release fica sem o instalador ou sem o latest.yml. Aconteceu na 0.1.1,
 *   na 0.1.2 e na 0.2.0. O passo 5 confere e completa.
 *
 * Para so conferir e completar uma Release que ja foi publicada:
 *
 *   node scripts/publicar.js --so-conferir
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const pacote = require('../package.json');
const versao = pacote.version;
const tag = `v${versao}`;
const { owner, repo } = pacote.build.publish[0];
const DIST = path.join(RAIZ, 'dist');

/** Os arquivos que a Release precisa ter para o app conseguir se atualizar. */
const ARQUIVOS_DA_RELEASE = [
  `Blink-Setup-${versao}.exe`,
  `Blink-Setup-${versao}.exe.blockmap`,
  'latest.yml',
];

/**
 * Roda um comando e devolve a saida. Levanta erro se o comando falhar.
 *
 * `shell` so vale para o npx, que no Windows e um .cmd e nao um executavel.
 * Nao da para ligar para todos: com shell, os argumentos sao colados sem
 * aspas, e um -m "Blink 0.1.1" viraria -m Blink mais um 0.1.1 solto, que o
 * git tenta interpretar como referencia.
 */
function rodar(comando, argumentos, { silencioso = false, shell = false } = {}) {
  return execFileSync(comando, argumentos, {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: silencioso ? 'pipe' : 'inherit',
    shell,
  });
}

function git(...argumentos) {
  return rodar('git', argumentos, { silencioso: true }).trim();
}

function desistir(mensagem) {
  console.error(`\n  ${mensagem}\n`);
  process.exit(1);
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- API do GitHub --------------------------------------------------------------

function cabecalhos(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.GH_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'blink-publicar',
    ...extra,
  };
}

async function buscarRelease() {
  const resposta = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers: cabecalhos(),
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`GitHub respondeu ${resposta.status} ao buscar a Release`);
  return resposta.json();
}

async function enviarArquivo(release, nome) {
  const conteudo = fs.readFileSync(path.join(DIST, nome));
  const url = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(nome)}`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: cabecalhos({ 'Content-Type': 'application/octet-stream' }),
    body: conteudo,
  });
  if (!resposta.ok) throw new Error(`GitHub respondeu ${resposta.status} ao enviar ${nome}`);
}

/**
 * Confere se a Release tem todos os arquivos e envia os que faltarem.
 *
 * Tambem confere o latest.yml local antes de enviar: ele precisa falar da
 * versao que esta sendo publicada, senao o app leria "ja esta atualizado".
 */
async function conferirRelease() {
  console.log('\n  conferindo a Release no GitHub...');

  for (const nome of ARQUIVOS_DA_RELEASE) {
    if (!fs.existsSync(path.join(DIST, nome))) desistir(`Falta ${nome} no dist/. Empacote de novo.`);
  }
  const latest = fs.readFileSync(path.join(DIST, 'latest.yml'), 'utf8');
  if (!latest.includes(`version: ${versao}`)) {
    desistir(`O dist/latest.yml nao e da versao ${versao}. Empacote de novo.`);
  }

  // A API pode demorar alguns segundos para mostrar o que acabou de subir.
  let release = null;
  for (let tentativa = 0; tentativa < 5 && !release; tentativa++) {
    release = await buscarRelease();
    if (!release) await esperar(2000);
  }
  if (!release) desistir(`A Release ${tag} nao apareceu no GitHub.`);

  const presentes = new Set(
    release.assets.filter((a) => a.state === 'uploaded').map((a) => a.name)
  );
  const faltando = ARQUIVOS_DA_RELEASE.filter((nome) => !presentes.has(nome));

  if (faltando.length === 0) {
    console.log('  todos os arquivos estao la');
    return;
  }

  for (const nome of faltando) {
    // Um envio que morreu no meio pode ter deixado o arquivo pela metade
    // ("state: new"). O GitHub recusa enviar de novo com o mesmo nome, entao
    // o resto quebrado sai antes.
    const quebrado = release.assets.find((a) => a.name === nome);
    if (quebrado) {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${quebrado.id}`, {
        method: 'DELETE',
        headers: cabecalhos(),
      });
    }
    console.log(`  faltava ${nome} - enviando`);
    await enviarArquivo(release, nome);
  }

  const conferida = await buscarRelease();
  const agora = new Set(conferida.assets.filter((a) => a.state === 'uploaded').map((a) => a.name));
  const aindaFaltando = ARQUIVOS_DA_RELEASE.filter((nome) => !agora.has(nome));
  if (aindaFaltando.length > 0) desistir(`Continuam faltando: ${aindaFaltando.join(', ')}`);

  console.log('  Release completa');
}

// --- Publicacao -------------------------------------------------------------------

async function publicar() {
  console.log(`\nPublicando o Blink ${tag}\n`);

  // --- 1. nada pendente ---
  if (git('status', '--porcelain') !== '') {
    desistir(
      'Ha mudancas nao commitadas. A tag aponta para o commit atual, entao\n' +
        '  commite ou descarte antes de publicar.'
    );
  }

  // --- 2. a tag ---
  const commitAtual = git('rev-parse', 'HEAD');

  // A tag no GitHub tem que apontar para o commit que esta sendo empacotado.
  // Se ela ja existir apontando para outro lugar, o instalador e a tag
  // contariam historias diferentes - e o git recusa sobrescrever, entao o
  // erro apareceria cru no meio da publicacao.
  const remota = git('ls-remote', '--tags', 'origin', tag);
  if (remota !== '') {
    const commitRemoto = remota.split(/\s+/)[0];
    const apontaParaCa = git('rev-list', '-n', '1', tag) === commitAtual;

    if (commitRemoto === commitAtual || apontaParaCa) {
      console.log(`  tag ${tag} ja esta no GitHub`);
    } else {
      desistir(
        `A tag ${tag} ja existe no GitHub apontando para outro commit.\n` +
          `  Suba a versao no package.json, ou apague a tag antes:\n` +
          `    git push origin :refs/tags/${tag}`
      );
    }
  } else {
    if (git('tag', '--list', tag) !== tag) {
      git('tag', '-a', tag, '-m', `Blink ${versao}`);
      console.log(`  tag ${tag} criada`);
    }
    git('push', 'origin', tag);
    console.log(`  tag ${tag} enviada para o GitHub`);
  }

  // --- 3. limpar o dist ---
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
    console.log('  dist/ limpo');
  }

  // --- 4. empacotar e publicar ---
  console.log('\n  empacotando e publicando...\n');
  rodar('npx', ['electron-builder', '--win', '--publish', 'always'], { shell: true });

  // --- 5. conferir ---
  await conferirRelease();
}

async function principal() {
  if (!process.env.GH_TOKEN) {
    desistir(
      'GH_TOKEN nao esta definido. Veja "Publicar uma atualizacao" no MANUTENCAO.md.\n' +
        '  Se voce acabou de definir, abra um terminal novo.'
    );
  }

  if (process.argv.includes('--so-conferir')) {
    console.log(`\nConferindo a Release ${tag}`);
    await conferirRelease();
  } else {
    await publicar();
  }

  console.log(`\n  Pronto: https://github.com/${owner}/${repo}/releases/tag/${tag}\n`);
}

principal().catch((erro) => desistir(erro.message));
