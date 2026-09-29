/**
 * Publica uma versao nova do Blink.
 *
 * Rode com:  npm run publicar
 *
 * Faz, nesta ordem:
 *   1. confere que nao ha mudanca por commitar;
 *   2. cria e envia a tag da versao;
 *   3. limpa o dist/;
 *   4. empacota e cria a Release no GitHub.
 *
 * Os tres primeiros passos existem por causa de erros reais que aconteceram:
 *
 * - O GitHub recusa criar uma Release publicada sem uma tag que exista no
 *   repositorio ("Published releases must have a valid tag"). Sem a tag o
 *   empacotamento inteiro roda e so falha no fim, na hora de publicar.
 * - O dist/ guarda o latest.yml do empacotamento anterior. Se a publicacao
 *   falhar no meio, sobra o arquivo velho apontando para a versao passada -
 *   e o app le "ja esta atualizado" para sempre.
 * - A tag aponta para o commit atual. Se houver mudanca nao commitada, a
 *   tag e o instalador nao batem com o que esta no repositorio.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const versao = require('../package.json').version;
const tag = `v${versao}`;

/**
 * Roda um comando e devolve a saida. Levanta erro se o comando falhar.
 *
 * `shell` so vale para o npx, que no Windows e um .cmd e nao um executavel.
 * Nao da para ligar para todos: com shell, os argumentos sao coladas sem
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

console.log(`\nPublicando o Blink ${tag}\n`);

// --- 1. nada pendente -------------------------------------------------------

if (git('status', '--porcelain') !== '') {
  desistir(
    'Ha mudancas nao commitadas. A tag aponta para o commit atual, entao\n' +
      '  commite ou descarte antes de publicar.'
  );
}

// --- 2. a tag ---------------------------------------------------------------

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

// --- 3. limpar o dist -------------------------------------------------------

const dist = path.join(RAIZ, 'dist');
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
  console.log('  dist/ limpo');
}

// --- 4. empacotar e publicar ------------------------------------------------

if (!process.env.GH_TOKEN) {
  desistir(
    'GH_TOKEN nao esta definido. Veja "Publicar uma atualizacao" no README.\n' +
      '  Se voce acabou de definir, abra um terminal novo.'
  );
}

console.log('\n  empacotando e publicando...\n');
rodar('npx', ['electron-builder', '--win', '--publish', 'always'], { shell: true });

console.log(`\n  Pronto: https://github.com/danielvrd/Blink/releases/tag/${tag}\n`);
