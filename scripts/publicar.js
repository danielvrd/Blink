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

/** Roda um comando e devolve a saida. Levanta erro se o comando falhar. */
function rodar(comando, argumentos, { silencioso = false } = {}) {
  return execFileSync(comando, argumentos, {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: silencioso ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
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

const tagsExistentes = git('tag', '--list', tag);

if (tagsExistentes === tag) {
  console.log(`  tag ${tag} ja existe localmente`);
} else {
  git('tag', '-a', tag, '-m', `Blink ${versao}`);
  console.log(`  tag ${tag} criada`);
}

// Enviar de novo uma tag que ja esta no GitHub nao da erro.
git('push', 'origin', tag);
console.log(`  tag ${tag} enviada para o GitHub`);

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
rodar('npx', ['electron-builder', '--win', '--publish', 'always']);

console.log(`\n  Pronto: https://github.com/danielvrd/Blink/releases/tag/${tag}\n`);
