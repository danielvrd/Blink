/**
 * Leitura e escrita dos arquivos .md do Fast Note.
 *
 * Um arquivo de nota e um Markdown comum, onde cada topico e um item de
 * lista:
 *
 *     # Trabalho
 *
 *     - Rever PR #142 antes do deploy
 *     - Call com cliente as 15h
 *
 * O Blink so cuida das linhas que comecam com "- ". Titulo, paragrafo,
 * tabela, qualquer outra coisa que voce escrever no arquivo por fora fica
 * onde esta. Isso permite apontar o Blink para uma pasta de notas que voce
 * ja usa sem medo de perder nada.
 *
 * Os topicos sao guardados no arquivo em ordem cronologica: o mais novo vai
 * para o fim. O modal mostra ao contrario, com o mais recente em cima.
 * Quem inverte e o renderer; aqui e sempre a ordem do arquivo.
 */

const fs = require('fs').promises;
const path = require('path');

const config = require('./config');

/** Um topico no arquivo: "- texto". */
const LINHA_TOPICO = /^-\s+(.*)$/;

/**
 * Continuacao de um topico de varias linhas.
 *
 * Quando o usuario usa Shift+Enter, o topico tem quebra de linha. Em
 * Markdown isso se escreve indentando a continuacao, que e o que o
 * escreverTopico faz.
 */
const LINHA_CONTINUACAO = /^ {2,}(.*)$/;

/**
 * Nome de arquivo aceito: letras, numeros, espaco, ponto, hifen e
 * sublinhado.
 *
 * Tudo que nao esta aqui e recusado, e isso inclui barra e dois pontos. Sem
 * essa trava, um nome como "..\\..\\Windows\\System32\\algo.md" faria o
 * Blink escrever fora da pasta de notas.
 */
const NOME_ACEITO = /^[\p{L}\p{N} ._-]+$/u;

/** A pasta configurada, ou string vazia se ainda nao escolheram uma. */
function pasta() {
  return config.obter('pastaNotas');
}

/**
 * Transforma o que o usuario digitou em um nome de arquivo valido.
 *
 * Devolve null quando o nome nao serve. Sem nome, usa "nova-nota.md", como
 * pede o handoff.
 */
function nomeDeArquivo(nome) {
  let limpo = (nome || '').trim();
  if (limpo === '') limpo = 'nova-nota';

  // Recusa em vez de consertar. path.basename transformaria "a/b" em "b" e
  // "..\..\Windows\x" em "x": seria seguro, porque o arquivo cairia na
  // pasta certa, mas o usuario pediu um nome e receberia outro sem aviso.
  // Melhor dizer que o nome nao serve.
  if (/[\\\/:*?"<>|]/.test(limpo)) return null;

  // Segunda tranca, caso a primeira deixe passar algo: se sobrar qualquer
  // caminho, e porque o nome nao era so um nome.
  if (path.basename(limpo) !== limpo) return null;

  if (!limpo.toLowerCase().endsWith('.md')) limpo += '.md';

  const semExtensao = limpo.slice(0, -3);
  if (semExtensao === '' || !NOME_ACEITO.test(semExtensao)) return null;

  return limpo;
}

/**
 * Caminho completo de um arquivo de nota, ou null se o nome nao servir.
 *
 * Confere tambem se o resultado ficou mesmo dentro da pasta configurada:
 * e a segunda tranca, caso o nome passe pela primeira.
 */
function caminhoDe(arquivo) {
  const raiz = pasta();
  if (!raiz) return null;

  const nome = nomeDeArquivo(arquivo);
  if (!nome) return null;

  const completo = path.resolve(raiz, nome);
  if (path.dirname(completo) !== path.resolve(raiz)) return null;

  return completo;
}

/** Os arquivos .md da pasta, em ordem alfabetica. */
async function listar() {
  const raiz = pasta();
  if (!raiz) return [];

  try {
    const entradas = await fs.readdir(raiz, { withFileTypes: true });
    return entradas
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  } catch (erro) {
    // Pasta apagada, renomeada ou em um drive que saiu do ar.
    console.warn('[notas] nao consegui ler a pasta:', erro.message);
    return [];
  }
}

/**
 * Separa o conteudo do arquivo em tres partes.
 *
 *   cabecalho  linhas antes do primeiro topico
 *   topicos    o que o Blink gerencia
 *   rodape     linhas depois do ultimo topico
 *
 * Linha que nao e topico e esta no meio dos topicos vai para o rodape: ela
 * e preservada, mas desce para o fim. E o preco de manter a regra simples,
 * e nada e perdido.
 */
function separar(conteudo) {
  const linhas = conteudo.replace(/^﻿/, '').split(/\r?\n/);

  const cabecalho = [];
  const topicos = [];
  const rodape = [];
  let achouTopico = false;

  for (const linha of linhas) {
    const topico = linha.match(LINHA_TOPICO);

    if (topico) {
      achouTopico = true;
      topicos.push(topico[1]);
      continue;
    }

    if (!achouTopico) {
      cabecalho.push(linha);
      continue;
    }

    // Continuacao do topico anterior: Shift+Enter virou linha indentada.
    const continuacao = linha.match(LINHA_CONTINUACAO);
    if (continuacao && topicos.length > 0 && rodape.length === 0) {
      topicos[topicos.length - 1] += '\n' + continuacao[1];
      continue;
    }

    if (linha.trim() !== '') rodape.push(linha);
  }

  // Linhas em branco no fim do cabecalho atrapalham quando a lista some
  // inteira; a montagem cuida do espacamento.
  while (cabecalho.length > 0 && cabecalho[cabecalho.length - 1].trim() === '') {
    cabecalho.pop();
  }

  return { cabecalho, topicos, rodape };
}

/** Um topico vira "- texto", com as quebras de linha indentadas. */
function escreverTopico(texto) {
  return '- ' + texto.split('\n').join('\n  ');
}

/** Junta cabecalho, topicos e rodape de volta em um arquivo. */
function montar({ cabecalho, topicos, rodape }) {
  const partes = [];

  if (cabecalho.length > 0) partes.push(cabecalho.join('\n'), '');
  if (topicos.length > 0) partes.push(topicos.map(escreverTopico).join('\n'));
  if (rodape.length > 0) partes.push('', rodape.join('\n'));

  const texto = partes.join('\n').replace(/\n{3,}/g, '\n\n');
  return texto.endsWith('\n') ? texto : texto + '\n';
}

/**
 * Le um arquivo de nota.
 *
 * Devolve { topicos, existe }. Arquivo que ainda nao existe volta vazio em
 * vez de dar erro: e o caso de "+ Criar nova nota".
 */
async function ler(arquivo) {
  const completo = caminhoDe(arquivo);
  if (!completo) return { topicos: [], existe: false };

  try {
    const conteudo = await fs.readFile(completo, 'utf8');
    return { topicos: separar(conteudo).topicos, existe: true };
  } catch (erro) {
    if (erro.code === 'ENOENT') return { topicos: [], existe: false };
    throw erro;
  }
}

/**
 * Grava a lista de topicos de um arquivo, na ordem recebida.
 *
 * Le o arquivo antes para nao perder o que nao e topico. Usado por apagar,
 * reordenar e limpar tudo.
 */
async function salvarTopicos(arquivo, topicos) {
  const completo = caminhoDe(arquivo);
  if (!completo) return false;

  let partes = { cabecalho: [], topicos: [], rodape: [] };
  try {
    partes = separar(await fs.readFile(completo, 'utf8'));
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }

  partes.topicos = topicos;
  await fs.writeFile(completo, montar(partes), 'utf8');
  return true;
}

/**
 * Acrescenta um topico no fim do arquivo, criando o arquivo se preciso.
 *
 * Devolve o nome do arquivo gravado, ou null se o nome nao servir.
 */
async function adicionar(arquivo, texto) {
  const nome = nomeDeArquivo(arquivo);
  if (!nome) return null;

  const { topicos } = await ler(nome);
  const gravou = await salvarTopicos(nome, [...topicos, texto]);
  return gravou ? nome : null;
}

/** Apaga todos os topicos de um arquivo, preservando o resto. */
async function limpar(arquivo) {
  return salvarTopicos(arquivo, []);
}

module.exports = {
  pasta,
  listar,
  ler,
  adicionar,
  salvarTopicos,
  limpar,
  nomeDeArquivo,
  caminhoDe,
  // exportados para teste
  separar,
  montar,
};
