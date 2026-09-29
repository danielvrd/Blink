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
const { shell } = require('electron');

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

/**
 * O arquivo de tarefas do /task. Mora na raiz da pasta de notas, junto com
 * os outros, e aparece sempre primeiro no seletor.
 */
const ARQUIVO_TAREFAS = 'task.md';

/** Os arquivos .md da pasta, em ordem alfabetica - com o de tarefas no topo. */
async function listar() {
  const raiz = pasta();
  if (!raiz) return [];

  try {
    const entradas = await fs.readdir(raiz, { withFileTypes: true });
    return entradas
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map((e) => e.name)
      .sort((a, b) => {
        // O task.md vem primeiro: e o arquivo que mais se abre.
        if (a.toLowerCase() === ARQUIVO_TAREFAS) return -1;
        if (b.toLowerCase() === ARQUIVO_TAREFAS) return 1;
        return a.localeCompare(b, 'pt-BR');
      });
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

/**
 * Exclui um arquivo de nota, mandando para a Lixeira do Windows.
 *
 * Lixeira e nao apagar de vez: uma nota excluida por engano volta com dois
 * cliques, e o Blink nao precisa de um "desfazer" proprio para isso.
 *
 * O caminhoDe() e a mesma trava das outras operacoes: um nome que tente
 * sair da pasta de notas nem chega a virar caminho.
 */
async function excluir(arquivo) {
  const completo = caminhoDe(arquivo);
  if (!completo) return false;

  try {
    await fs.access(completo);
  } catch (erro) {
    return false;
  }

  await shell.trashItem(completo);
  return true;
}

// --- Tarefas (/task) ----------------------------------------------------------

/**
 * O task.md usa o formato de checklist do Markdown, que o VS Code e o
 * GitHub ja mostram como caixinhas:
 *
 *     ## A fazer
 *
 *     - [ ] fazer 9.1 luis
 *
 *     ## Concluidas
 *
 *     - [x] deploy da v1.3
 *
 * Diferente das notas comuns, este arquivo e do Blink: ele e regravado
 * inteiro nesse formato. A leitura e tolerante - aceita a caixinha em
 * qualquer lugar do arquivo, e um "- " sem caixinha conta como pendente,
 * para quem editar na mao nao perder nada.
 */
const LINHA_TAREFA = /^-\s+\[([ xX])\]\s*(.*)$/;

/** Separa o conteudo do task.md em pendentes e concluidas, na ordem do arquivo. */
function separarTarefas(conteudo) {
  const pendentes = [];
  const concluidas = [];
  // A lista que recebeu o ultimo item, para as linhas de continuacao.
  let ultima = null;

  for (const linha of conteudo.replace(/^﻿/, '').split(/\r?\n/)) {
    const tarefa = linha.match(LINHA_TAREFA);
    if (tarefa) {
      ultima = tarefa[1] === ' ' ? pendentes : concluidas;
      ultima.push(tarefa[2]);
      continue;
    }

    const solta = linha.match(LINHA_TOPICO);
    if (solta) {
      ultima = pendentes;
      pendentes.push(solta[1]);
      continue;
    }

    const continuacao = linha.match(LINHA_CONTINUACAO);
    if (continuacao && ultima && ultima.length > 0) {
      ultima[ultima.length - 1] += '\n' + continuacao[1];
      continue;
    }

    // Titulo ou texto solto encerra a continuacao; linha em branco nao.
    if (linha.trim() !== '') ultima = null;
  }

  return { pendentes, concluidas };
}

/** Uma tarefa vira "- [ ] texto", com as quebras de linha indentadas. */
function escreverTarefa(texto, feita) {
  return `- [${feita ? 'x' : ' '}] ` + texto.split('\n').join('\n  ');
}

/** Monta o task.md inteiro, sempre com as duas secoes. */
function montarTarefas({ pendentes, concluidas }) {
  const partes = ['## A fazer', ''];
  if (pendentes.length > 0) {
    partes.push(pendentes.map((t) => escreverTarefa(t, false)).join('\n'), '');
  }
  partes.push('## Concluídas', '');
  if (concluidas.length > 0) {
    partes.push(concluidas.map((t) => escreverTarefa(t, true)).join('\n'), '');
  }
  return partes.join('\n').replace(/\n+$/, '') + '\n';
}

/** Le o task.md. Arquivo que ainda nao existe volta vazio. */
async function lerTarefas() {
  const completo = caminhoDe(ARQUIVO_TAREFAS);
  if (!completo) return { pendentes: [], concluidas: [] };

  try {
    return separarTarefas(await fs.readFile(completo, 'utf8'));
  } catch (erro) {
    if (erro.code === 'ENOENT') return { pendentes: [], concluidas: [] };
    throw erro;
  }
}

/** Regrava o task.md inteiro, criando se preciso. */
async function salvarTarefas(tarefas) {
  const completo = caminhoDe(ARQUIVO_TAREFAS);
  if (!completo) return false;
  await fs.writeFile(completo, montarTarefas(tarefas), 'utf8');
  return true;
}

/** Acrescenta uma tarefa pendente no fim da lista do arquivo. */
async function adicionarTarefa(texto) {
  const tarefas = await lerTarefas();
  tarefas.pendentes.push(texto);
  return salvarTarefas(tarefas);
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
  excluir,
  nomeDeArquivo,
  caminhoDe,
  ARQUIVO_TAREFAS,
  lerTarefas,
  salvarTarefas,
  adicionarTarefa,
  // exportados para teste
  separar,
  montar,
  separarTarefas,
  montarTarefas,
};
