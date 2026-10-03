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
const cripto = require('./privado');

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
    // Arquivo com cadeado: o que esta no disco e texto cifrado, nunca topicos. Quem abre e o notas-privadas.js.
    if (cripto.ehPrivado(conteudo)) return { topicos: [], existe: true, privado: true };
    return { topicos: separar(conteudo).topicos, existe: true };
  } catch (erro) {
    if (erro.code === 'ENOENT') return { topicos: [], existe: false };
    throw erro;
  }
}

/**
 * O arquivo (caminho completo) tem o cadeado? Le so o comeco, o bastante para o cabecalho.
 * Arquivo que nao existe nao e privado.
 */
async function ehArquivoPrivado(completo) {
  let aberto;
  try {
    aberto = await fs.open(completo, 'r');
    const lido = Buffer.alloc(24);
    const { bytesRead } = await aberto.read(lido, 0, lido.length, 0);
    return cripto.ehPrivado(lido.toString('utf8', 0, bytesRead));
  } catch (erro) {
    if (erro.code === 'ENOENT') return false;
    throw erro;
  } finally {
    if (aberto) await aberto.close();
  }
}

/** Os arquivos da pasta que tem o cadeado, com o nome como esta na pasta. */
async function listarPrivados() {
  const privados = [];
  for (const nome of await listar()) {
    const completo = caminhoDe(nome);
    if (completo && (await ehArquivoPrivado(completo))) privados.push(nome);
  }
  return privados;
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

  // Gravar texto puro por cima de um arquivo com cadeado destruiria o conteudo cifrado; e um arquivo em
  // folha livre nao muda o .md.
  if (await ehArquivoPrivado(completo)) return false;
  if (ehArquivoEspecial(path.basename(completo))) return false;

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

  // Excluir o principal tira a estrela: senao o Ctrl+Alt+N procuraria um
  // arquivo que foi para a Lixeira.
  if (mesmoArquivo(config.obter('notaPrincipal'), path.basename(completo))) {
    config.definirNotaPrincipal('');
  }

  // O mesmo para o "ultimo arquivo": nao adianta abrir num arquivo que foi
  // para a Lixeira.
  if (mesmoArquivo(config.obter('ultimaNota'), path.basename(completo))) {
    config.definirUltimaNota('');
  }

  // O mesmo para o relogio: nao faz sentido a lista continuar citando um
  // arquivo que foi para a Lixeira.
  const nomeExcluido = path.basename(completo);
  const marcadosHistorico = config.obter('notasHistorico') || [];
  if (marcadosHistorico.some((h) => mesmoArquivo(h, nomeExcluido))) {
    config.definirHistoricoArquivos(marcadosHistorico.filter((h) => !mesmoArquivo(h, nomeExcluido)));
  }

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

/**
 * Uma operacao por vez sobre o task.md (e a daily que o alternarTarefa mexe junto).
 * Sem isto, uma regravacao vinda da tela no meio de um alternarTarefa
 * sobrescreveria o que ele acabou de gravar.
 */
let filaDasTarefas = Promise.resolve();
function naFilaDasTarefas(trabalho) {
  const resultado = filaDasTarefas.then(trabalho);
  filaDasTarefas = resultado.catch(() => {});
  return resultado;
}

/** Regrava o task.md inteiro, criando se preciso. Sem a fila: so para dentro das operacoes da fila. */
async function gravarTarefas(tarefas) {
  const completo = caminhoDe(ARQUIVO_TAREFAS);
  if (!completo) return false;
  await fs.writeFile(completo, montarTarefas(tarefas), 'utf8');
  return true;
}

/** Regrava o task.md inteiro, criando se preciso. */
function salvarTarefas(tarefas) {
  return naFilaDasTarefas(() => gravarTarefas(tarefas));
}

/** Acrescenta uma tarefa pendente no fim da lista do arquivo. */
function adicionarTarefa(texto) {
  return naFilaDasTarefas(async () => {
    const tarefas = await lerTarefas();
    tarefas.pendentes.push(texto);
    return gravarTarefas(tarefas);
  });
}

// --- Tarefas concluidas -> daily -------------------------------------------------

/**
 * O dia em que uma tarefa foi concluida fica ESCONDIDO no fim dela, num
 * comentario do Markdown que nenhum editor mostra:
 *
 *     - [x] deploy da v1.3 <!-- feita 2026-10-01 -->
 *
 * E o que permite desmarcar uma tarefa velha e tira-la da daily DAQUELE dia
 * (nao do de hoje). A tela nunca mostra o comentario: tira na lista, na edicao e
 * no botao C, e devolve ao salvar uma edicao.
 */
const DATA_DA_CONCLUSAO = /[ \t]*<!-- feita (\d{4}-\d{2}-\d{2}) -->[ \t]*$/;

/** O texto da tarefa sem o comentario da data. */
function tarefaSemData(texto) {
  return texto.replace(DATA_DA_CONCLUSAO, '');
}

/** O dia ("AAAA-MM-DD") em que a tarefa foi concluida, ou null se o texto nao traz a data. */
function dataDaTarefa(texto) {
  const achou = DATA_DA_CONCLUSAO.exec(texto);
  return achou ? achou[1] : null;
}

/**
 * Topico recolhivel da daily: a primeira linha comeca com "▸ " (o titulo) e o
 * resto e o corpo, anotacoes que a tela mostra ao abrir. So as tarefas
 * concluidas no modo 'dailyTopico' geram esses topicos.
 */
const PREFIXO_RECOLHIVEL = '▸ ';

/**
 * O arquivo da daily, se estiver configurado e ainda servir: existe na pasta, tem
 * o relogio ligado e nao e o task.md. Senao null - e nada e registrado.
 */
async function arquivoDaily() {
  const nome = config.obterTarefas().arquivoDaily;
  if (!nome || mesmoArquivo(nome, ARQUIVO_TAREFAS)) return null;
  const comRelogio = await arquivosComHistorico();
  const achado = comRelogio.find((a) => mesmoArquivo(a, nome)) || null;
  if (achado && (await ehArquivoPrivado(caminhoDe(achado)))) return null;
  return achado;
}

/**
 * Tira da daily, no dia indicado, o ULTIMO topico que e a tarefa: o texto igual ao
 * dela, ou um recolhivel ("▸ ") com o mesmo titulo. Um recolhivel cujo corpo tem
 * anotacoes que nao vieram da tarefa so sai com `confirmado`.
 *
 * Devolve { achou, precisaConfirmar }. Nao achou = o texto foi editado la, e nada some.
 */
async function removerDaDaily(daily, data, puro, confirmado) {
  const { dias } = await lerHistorico(daily);
  const dia = dias.find((d) => d.data === data);
  if (!dia) return { achou: false, precisaConfirmar: false };

  const titulo = puro.split('\n')[0];
  // O que o proprio Blink poe no corpo de um recolhivel: as linhas da tarefa depois da primeira.
  const corpoGerado = puro.split('\n').slice(1).join('\n').trim();

  for (let i = dia.topicos.length - 1; i >= 0; i--) {
    const topico = dia.topicos[i];
    const ehIgual = topico === puro;
    const linhasDoTopico = topico.split('\n');
    const ehRecolhivel = linhasDoTopico[0] === PREFIXO_RECOLHIVEL + titulo;
    if (!ehIgual && !ehRecolhivel) continue;

    if (ehRecolhivel && !ehIgual) {
      const corpo = linhasDoTopico.slice(1).join('\n').trim();
      if (corpo !== corpoGerado && !confirmado) return { achou: true, precisaConfirmar: true };
    }

    const restantes = dia.topicos.filter((_, j) => j !== i);
    await salvarDiaHistorico(daily, data, restantes);
    return { achou: true, precisaConfirmar: false };
  }

  return { achou: false, precisaConfirmar: false };
}

/**
 * Conclui uma tarefa, ou volta uma concluida para a fazer - e mexe na daily junto.
 * Tudo de uma vez (le, confere, move, grava), numa fila: a tela manda so qual
 * tarefa e quer o resultado de volta.
 *
 *   grupo      'pendentes' (concluir) ou 'concluidas' (desmarcar)
 *   indice     a posicao na lista DO ARQUIVO (a tela mostra invertido)
 *   texto      o texto da tarefa como a tela o conhece (com o comentario da data):
 *              se nao for o do arquivo, a tela esta desatualizada e nada muda
 *   confirmado o usuario ja aceitou remover um topico recolhivel com anotacoes
 *
 * Concluir: a tarefa vai para o fim de "Concluidas" com a data de hoje escondida
 * e, com a daily configurada, ganha um topico no dia de hoje (o texto dela, ou
 * "▸ texto" no modo 'dailyTopico'). Desmarcar: volta para o fim de "A fazer" e o
 * topico sai da daily do dia em que foi concluida (a data escondida).
 *
 * Devolve { ok, tarefas, daily: { acao, arquivo, data } } (acao: 'nenhuma',
 * 'registrou', 'removeu' ou 'nao-achou'), ou { ok: false, motivo: 'desatualizado',
 * tarefas } ou { ok: false, precisaConfirmar: true, tarefas } sem mudar nada.
 */
function alternarTarefa({ grupo, indice, texto, confirmado = false }) {
  return naFilaDasTarefas(async () => {
    const tarefas = await lerTarefas();
    if (grupo !== 'pendentes' && grupo !== 'concluidas') return { ok: false, motivo: 'grupo', tarefas };

    const lista = tarefas[grupo];
    if (!Number.isInteger(indice) || lista[indice] !== texto) return { ok: false, motivo: 'desatualizado', tarefas };

    const opcoes = config.obterTarefas();
    const daily = await arquivoDaily();
    const puro = tarefaSemData(texto);
    let registro = { acao: 'nenhuma' };

    if (grupo === 'pendentes') {
      const hoje = dataDeHoje();
      lista.splice(indice, 1);
      tarefas.concluidas.push(`${puro} <!-- feita ${hoje} -->`);

      if (daily && opcoes.aoConcluir !== 'nada') {
        const topico = opcoes.aoConcluir === 'dailyTopico' ? PREFIXO_RECOLHIVEL + puro : puro;
        await adicionarHistorico(daily, hoje, topico);
        registro = { acao: 'registrou', arquivo: daily, data: hoje };
      }
    } else {
      // Tarefa feita antes desta funcao existir nao tem data: volta para a fazer sem mexer na daily.
      const data = dataDaTarefa(texto);
      if (data && daily) {
        const removido = await removerDaDaily(daily, data, puro, confirmado);
        if (removido.precisaConfirmar) return { ok: false, precisaConfirmar: true, tarefas };
        registro = { acao: removido.achou ? 'removeu' : 'nao-achou', arquivo: daily, data };
      }
      lista.splice(indice, 1);
      tarefas.pendentes.push(puro);
    }

    await gravarTarefas(tarefas);
    return { ok: true, tarefas, daily: registro };
  });
}

// --- Arquivo principal (a estrela) ---------------------------------------------

/** Mesmo nome de arquivo, sem diferenciar maiuscula - como o Windows. */
function mesmoArquivo(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

/**
 * O arquivo esta em folha livre? (notas-livres.js). Nesse modo o .md NUNCA muda - a folha mora em
 * .blink/livre/ -, entao as gravacoes de topico daqui o recusam, como recusam um arquivo com cadeado.
 */
function ehArquivoLivre(nome) {
  return (config.obter('notasLivres') || []).some((a) => mesmoArquivo(a, nome));
}

/** O arquivo esta em quadro branco? (notas-quadro.js) - o .md tambem nunca muda. */
function ehArquivoQuadro(nome) {
  return (config.obter('notasQuadro') || []).some((a) => mesmoArquivo(a, nome));
}

/** O arquivo esta em modo texto (editor de texto simples; notas-texto.js)? */
function ehArquivoTexto(nome) {
  return (config.obter('notasTexto') || []).some((a) => mesmoArquivo(a, nome));
}

/**
 * Folha livre, quadro branco ou modo texto: o resto do Blink nao grava TOPICOS nesses arquivos (o .md de uma folha
 * ou de um quadro nunca muda, e o de modo texto so muda pelo editor de texto).
 */
const ehArquivoEspecial = (nome) => ehArquivoLivre(nome) || ehArquivoQuadro(nome) || ehArquivoTexto(nome);

/**
 * O arquivo principal, se ainda existir na pasta. Um principal apagado ou
 * renomeado por fora conta como nenhum.
 */
async function principal() {
  const nome = config.obter('notaPrincipal');
  if (!nome) return '';
  const arquivos = await listar();
  return arquivos.find((a) => mesmoArquivo(a, nome)) || '';
}

/**
 * Marca o arquivo principal. So um por vez: marcar outro substitui. '' tira
 * a marca. Recusa nome que nao seja de um arquivo que existe na pasta.
 */
async function definirPrincipal(nome) {
  if (nome === '') return config.definirNotaPrincipal('');

  const valido = nomeDeArquivo(nome);
  if (!valido) return false;
  const existente = (await listar()).find((a) => mesmoArquivo(a, valido));
  if (!existente) return false;

  return config.definirNotaPrincipal(existente);
}

/**
 * O ultimo arquivo aberto, se ainda existir na pasta. Sem estrela, e nele
 * que o Fast Note abre. Apagado ou renomeado por fora conta como nenhum.
 */
async function ultima() {
  const nome = config.obter('ultimaNota');
  if (!nome) return '';
  const arquivos = await listar();
  return arquivos.find((a) => mesmoArquivo(a, nome)) || '';
}

/**
 * Guarda o ultimo arquivo aberto. '' esquece. Recusa nome que nao seja de um
 * arquivo que existe na pasta.
 */
async function definirUltima(nome) {
  if (nome === '') return config.definirUltimaNota('');

  const valido = nomeDeArquivo(nome);
  if (!valido) return false;
  const existente = (await listar()).find((a) => mesmoArquivo(a, valido));
  if (!existente) return false;

  return config.definirUltimaNota(existente);
}

/** Apaga todos os topicos de um arquivo, preservando o resto. */
async function limpar(arquivo) {
  return salvarTopicos(arquivo, []);
}

// --- Historico diario (o relogio) ----------------------------------------------

/**
 * Um arquivo com o historico ligado guarda um registro por dia:
 *
 *     Meu diario
 *
 *     ## 2026-09-15
 *
 *       - entrada antiga
 *       - outra, com
 *         quebra de linha
 *
 *     ## 2026-09-29
 *
 *       - topico de hoje
 *
 * A diferenca para uma nota comum e que o topico do dia vem INDENTADO
 * ("  - texto", nunca "-" na coluna 0). Isso e o que faz o modo comum
 * (separar/montar, sem nenhuma mudanca) nunca enxergar esses topicos: a
 * LINHA_TOPICO exige o traco na coluna 0, entao uma secao de dia inteira cai
 * dentro do cabecalho ou do rodape do modo comum, preservada ao pe da letra.
 * E assim que desligar o relogio nao apaga nada.
 *
 * Um topico solto (coluna 0), em qualquer parte do arquivo, e sempre tratado
 * como "ainda sem dia" - nunca uma posicao no arquivo decide isso, so a
 * indentacao. Isso importa porque o modo comum sempre acrescenta um topico
 * novo DEPOIS do que ja existia (o rodape entra depois dos topicos, veja
 * montar()); um criterio por posicao leria esse topico novo como pertencente
 * ao ultimo dia visto, e ganharia uma data que nao devia.
 */
const CABECALHO_DIA = /^## (\d{4}-\d{2}-\d{2})\s*$/;
/**
 * Topico do dia: so ESPACOS antes do traco. Com \s, a linha de continuacao
 * "    <tab>- sub" (um tab que o usuario deu com o TAB, seguido de um traco)
 * viraria um topico novo.
 */
const LINHA_TOPICO_DIA = /^ {2,}-\s+(.*)$/;

/**
 * Continuacao de um topico do dia. O escreverTopicoDia grava 4 espacos antes
 * de cada linha seguinte, e e EXATAMENTE isso que se tira na leitura - o que
 * vier depois (uma tabulacao do TAB, ou espacos de indentacao) e do usuario e
 * tem que voltar como foi escrito. Com \s{2,} a indentacao era engolida.
 *
 * O formato frouxo (2 ou mais espacos/tabs) fica de segunda opcao, para quem
 * editou o arquivo na mao com outra indentacao.
 */
const LINHA_CONTINUACAO_DIA = /^ {4}(.*)$/;
const LINHA_CONTINUACAO_DIA_FROUXA = /^\s{2,}(.*)$/;

/**
 * Separa o conteudo de um arquivo de historico em quatro partes.
 *
 *   cabecalho  linhas antes do primeiro topico ou cabecalho de dia
 *   correntes  topicos soltos (coluna 0) - "ainda sem dia", viram hoje
 *   dias       [{ data, topicos }], na ordem do arquivo
 *   rodape     linhas que nao sao nada disso, preservadas
 */
function separarHistorico(conteudo) {
  const linhas = conteudo.replace(/^﻿/, '').split(/\r?\n/);

  const cabecalho = [];
  const correntes = [];
  const dias = [];
  const rodape = [];
  let diaAtual = null;
  let achouAlgo = false;
  let ultimoTopico = null;

  for (const linha of linhas) {
    const cabecalhoDia = linha.match(CABECALHO_DIA);
    if (cabecalhoDia) {
      achouAlgo = true;
      diaAtual = { data: cabecalhoDia[1], topicos: [] };
      dias.push(diaAtual);
      ultimoTopico = null; // um cabecalho novo encerra a continuacao pendente
      continue;
    }

    const solto = linha.match(LINHA_TOPICO);
    if (solto) {
      achouAlgo = true;
      correntes.push(solto[1]);
      ultimoTopico = correntes;
      continue;
    }

    const doDia = linha.match(LINHA_TOPICO_DIA);
    if (doDia && diaAtual) {
      achouAlgo = true;
      diaAtual.topicos.push(doDia[1]);
      ultimoTopico = diaAtual.topicos;
      continue;
    }

    if (!achouAlgo) {
      cabecalho.push(linha);
      continue;
    }

    const continuacao = linha.match(LINHA_CONTINUACAO_DIA) || linha.match(LINHA_CONTINUACAO_DIA_FROUXA);
    if (continuacao && ultimoTopico && ultimoTopico.length > 0) {
      ultimoTopico[ultimoTopico.length - 1] += '\n' + continuacao[1];
      continue;
    }

    if (linha.trim() !== '') rodape.push(linha);
  }

  while (cabecalho.length > 0 && cabecalho[cabecalho.length - 1].trim() === '') {
    cabecalho.pop();
  }

  return { cabecalho, correntes, dias, rodape };
}

/** Um topico de dia vira "  - texto", com as quebras de linha indentadas por baixo. */
function escreverTopicoDia(texto) {
  return '  - ' + texto.split('\n').join('\n    ');
}

/**
 * Junta cabecalho, dias e rodape de volta em um arquivo.
 *
 * Nunca recebe "correntes": quem chama ja dobrou os soltos em "hoje" antes
 * (veja dobrarHoje) - um arquivo de historico gravado nunca fica com topico
 * solto, sempre com data.
 */
function montarHistorico({ cabecalho, dias, rodape }) {
  const partes = [];
  if (cabecalho.length > 0) partes.push(cabecalho.join('\n'), '');

  for (const dia of dias) {
    // Dia esvaziado (ultimo topico apagado) nao deixa um cabecalho fantasma.
    if (dia.topicos.length === 0) continue;
    partes.push(`## ${dia.data}`, '', dia.topicos.map(escreverTopicoDia).join('\n'), '');
  }

  if (rodape.length > 0) partes.push(rodape.join('\n'));

  const texto = partes.join('\n').replace(/\n{3,}/g, '\n\n');
  return texto.endsWith('\n') ? texto : texto + '\n';
}

/** A data de hoje no formato usado nos cabecalhos, "AAAA-MM-DD". */
function dataDeHoje() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Dobra os topicos soltos ("correntes") dentro do dia de hoje, sem tocar
 * disco. Nao importa de onde os soltos vieram - a primeira vez que o
 * relogio liga, ou uma semana inteira escrita com o relogio desligado -
 * eles nunca ganham uma data retroativa, sempre caem em hoje.
 */
function dobrarHoje({ correntes, dias }) {
  const copia = dias.map((d) => ({ data: d.data, topicos: [...d.topicos] }));

  if (correntes.length > 0) {
    const hoje = dataDeHoje();
    let diaHoje = copia.find((d) => d.data === hoje);
    if (!diaHoje) {
      diaHoje = { data: hoje, topicos: [] };
      copia.push(diaHoje);
    }
    diaHoje.topicos.push(...correntes);
  }

  return copia.sort((a, b) => a.data.localeCompare(b.data));
}

/** Os arquivos com o relogio ligado que ainda existem na pasta. */
async function arquivosComHistorico() {
  const marcados = config.obter('notasHistorico') || [];
  const arquivos = await listar();
  return marcados.map((m) => arquivos.find((a) => mesmoArquivo(a, m))).filter(Boolean);
}

/** Le o historico de um arquivo, ja com os soltos dobrados em hoje. */
async function lerHistorico(arquivo) {
  const completo = caminhoDe(arquivo);
  if (!completo) return { dias: [] };

  try {
    const conteudo = await fs.readFile(completo, 'utf8');
    return { dias: dobrarHoje(separarHistorico(conteudo)) };
  } catch (erro) {
    if (erro.code === 'ENOENT') return { dias: [] };
    throw erro;
  }
}

/**
 * Regrava os topicos de UM dia, preservando os outros dias, o cabecalho e o
 * rodape. Dia sem nenhum topico some do arquivo (montarHistorico cuida
 * disso).
 */
async function salvarDiaHistorico(arquivo, data, topicos) {
  const completo = caminhoDe(arquivo);
  if (!completo) return false;
  if (await ehArquivoPrivado(completo)) return false;
  if (ehArquivoEspecial(path.basename(completo))) return false;

  let partes = { cabecalho: [], correntes: [], dias: [], rodape: [] };
  try {
    partes = separarHistorico(await fs.readFile(completo, 'utf8'));
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }

  const dias = dobrarHoje(partes).filter((d) => d.data !== data);
  if (topicos.length > 0) dias.push({ data, topicos });
  dias.sort((a, b) => a.data.localeCompare(b.data));

  await fs.writeFile(
    completo,
    montarHistorico({ cabecalho: partes.cabecalho, dias, rodape: partes.rodape }),
    'utf8'
  );
  return true;
}

/** Acrescenta um topico no dia indicado, criando o arquivo/dia se preciso. */
async function adicionarHistorico(arquivo, data, texto) {
  const nome = nomeDeArquivo(arquivo);
  if (!nome) return false;

  const { dias } = await lerHistorico(nome);
  const dia = dias.find((d) => d.data === data);
  return salvarDiaHistorico(nome, data, dia ? [...dia.topicos, texto] : [texto]);
}

/**
 * Migra o arquivo para o formato de historico: le, dobra os soltos em hoje
 * e regrava. Chamada uma vez, ao ligar o relogio, para o passado ja
 * aparecer na hora - sem isso o usuario so veria "hoje" ate escrever algo.
 */
async function migrarParaHistorico(arquivo) {
  const completo = caminhoDe(arquivo);
  if (!completo) return false;
  if (await ehArquivoPrivado(completo)) return false;

  let partes = { cabecalho: [], correntes: [], dias: [], rodape: [] };
  try {
    partes = separarHistorico(await fs.readFile(completo, 'utf8'));
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }

  const dias = dobrarHoje(partes);
  await fs.writeFile(
    completo,
    montarHistorico({ cabecalho: partes.cabecalho, dias, rodape: partes.rodape }),
    'utf8'
  );
  return true;
}

/**
 * Liga ou desliga o relogio de um arquivo. O task.md e sempre recusado: ja
 * tem o proprio formato de secoes (A fazer/Concluidas), misturar os dois
 * nao faz sentido.
 *
 * Desligar so tira o nome da lista guardada no config - o arquivo em disco
 * nao muda. Ligar de novo (mesmo depois de um tempo desligado) volta a
 * mostrar tudo, com um buraco nas datas do periodo desligado: o que foi
 * escrito nesse meio tempo (modo comum) esta em "correntes" e cai em hoje
 * na proxima leitura/migracao, nunca em uma data antiga.
 */
async function definirHistorico(arquivo, ligado) {
  const nome = nomeDeArquivo(arquivo);
  if (!nome) return false;
  if (mesmoArquivo(nome, ARQUIVO_TAREFAS)) return false;

  const existente = (await listar()).find((a) => mesmoArquivo(a, nome));
  if (!existente) return false;

  // Cadeado e relogio nao andam juntos: o arquivo cifrado nao tem dias para o Blink ler. Nem folha livre e relogio:
  // o relogio reescreve o .md, e a folha livre nao mexe nele.
  if (ligado && (await ehArquivoPrivado(caminhoDe(existente)))) return false;
  if (ligado && ehArquivoEspecial(existente)) return false;

  const atuais = config.obter('notasHistorico') || [];
  const jaLigado = atuais.some((a) => mesmoArquivo(a, existente));
  const novaLista = ligado
    ? [...atuais.filter((a) => !mesmoArquivo(a, existente)), existente]
    : atuais.filter((a) => !mesmoArquivo(a, existente));

  if (!config.definirHistoricoArquivos(novaLista)) return false;
  if (ligado && !jaLigado) await migrarParaHistorico(existente);
  return true;
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
  ehArquivoPrivado,
  ehArquivoLivre,
  ehArquivoQuadro,
  ehArquivoTexto,
  listarPrivados,
  mesmoArquivo,
  ARQUIVO_TAREFAS,
  principal,
  definirPrincipal,
  ultima,
  definirUltima,
  lerTarefas,
  salvarTarefas,
  adicionarTarefa,
  alternarTarefa,
  arquivoDaily,
  tarefaSemData,
  dataDaTarefa,
  PREFIXO_RECOLHIVEL,
  arquivosComHistorico,
  definirHistorico,
  lerHistorico,
  salvarDiaHistorico,
  adicionarHistorico,
  dataDeHoje,
  // exportados para teste
  separar,
  montar,
  escreverTopico,
  separarTarefas,
  montarTarefas,
  separarHistorico,
  montarHistorico,
};
