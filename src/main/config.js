/**
 * Configuracoes do Blink, gravadas em %APPDATA%/Blink/config.json.
 *
 * Usa o electron-store, que cuida de criar o arquivo, aplicar os valores
 * padrao e gravar em disco a cada mudanca. A versao 8 e proposital: da 9 em
 * diante a biblioteca so existe como modulo ES e nao da para usar require().
 */

const fs = require('fs');
const Store = require('electron-store');

/**
 * As fontes que as abas do Fast Note e do Diff oferecem. Lista FIXA: o Electron
 * nao enumera as fontes instaladas, e estas vem com o Windows (menos a
 * JetBrains Mono, que o Blink traz dentro dele). A tela tem a mesma lista com a
 * pilha de fontes de cada uma (renderer/comum/aparencia.js) e um teste confere
 * que as duas batem.
 */
const FONTES_VALIDAS = [
  'JetBrains Mono', 'Cascadia Mono', 'Consolas', 'Courier New', 'Lucida Console',
  'Segoe UI', 'Arial', 'Calibri', 'Verdana', 'Tahoma',
];

/**
 * Os temas de cores do codigo no Diff (o realce de sintaxe). 'semcores' desliga
 * as cores. As cores de cada um ficam em renderer/diff/diff.css, e a tela tem a
 * mesma lista com os nomes (renderer/comum/aparencia.js).
 */
const TEMAS_DIFF = ['darkplus', 'monokai', 'onedark', 'dracula', 'githubdark', 'semcores'];

/**
 * O que acontece com uma tarefa ao ser concluida:
 *   'nada'         nao registra em lugar nenhum
 *   'daily'        vira um topico (o texto da tarefa) no dia de hoje da daily
 *   'dailyTopico'  vira um topico recolhivel ("▸ texto") no dia de hoje da daily
 */
const MODOS_AO_CONCLUIR = ['nada', 'daily', 'dailyTopico'];

/** Tamanho do texto do Fast Note e do Diff, em pixels. */
const TAMANHO_FONTE_MINIMO = 10;
const TAMANHO_FONTE_MAXIMO = 20;

/** Valores usados na primeira execucao e sempre que um campo faltar. */
const PADROES = {
  binds: {
    diff: 'Ctrl+Alt+D',
    note: 'Ctrl+Alt+N',
    sql: 'Ctrl+Alt+F',
    i18n: 'Ctrl+Alt+I',
  },
  // Vazio = o usuario ainda nao escolheu a pasta das notas.
  pastaNotas: '',
  // O arquivo da estrela no Fast Note, que o Ctrl+Alt+N abre. Vazio = nenhum.
  notaPrincipal: '',
  // O ultimo arquivo aberto no Fast Note. Sem estrela, o Ctrl+Alt+N volta
  // para ele. Vazio = nenhum ainda.
  ultimaNota: '',
  // Arquivos do Fast Note com o historico diario (o relogio) ligado. Pode
  // ter varios ao mesmo tempo - diferente da estrela, que e so um.
  notasHistorico: [],
  // Arquivos do Fast Note no modo "folha livre" (um editor tipo Notion com desenho
  // por cima; veja notas-livres.js). Como o relogio, so o processo principal grava.
  notasLivres: [],
  notasQuadro: [],
  notasTexto: [],
  abasNota: { abertas: [], ativa: '' },
  sql: {
    dialeto: 'transactsql',
    palavrasChave: 'upper',
    indentacao: '4',
    // 'alinhado' (padrao): FROM na mesma linha, AND do ON sob o ON, CTEs do WITH
    // mais para a esquerda... 'classico' e a saida pura da biblioteca (veja
    // estilo-sql.js). Configuracao antiga nao tem o campo: vale 'alinhado'.
    estilo: 'alinhado',
    // Formatar sozinho a SQL copiada de dentro de uma Area de Trabalho
    // Remota, sem precisar do atalho (veja monitor-sql.js).
    autoRemoto: true,
    // O mesmo para JSON, com o interruptor proprio.
    autoRemotoJson: true,
  },
  abaAtiva: 'diff',
  // Tamanho de cada janela, depois que o usuario redimensiona. Vazio =
  // tamanho padrao do design.
  janelas: {},
  // Fonte e tamanho do texto do Fast Note (topicos e rascunho) e do Diff
  // (as celulas). Quem le trata campo faltando como o padrao daqui (veja
  // obterAparencia): gravar so a fonte nao cria o tamanho.
  aparencia: {
    note: { fonte: 'JetBrains Mono', tamanho: 12 },
    diff: { fonte: 'JetBrains Mono', tamanho: 13 },
  },
  // Do Diff: o tema das cores do codigo (veja TEMAS_DIFF). Quem le trata
  // campo faltando como o padrao (obterTemaDiff).
  diff: { tema: 'darkplus' },
  // O que fazer ao concluir uma tarefa do task.md (veja MODOS_AO_CONCLUIR) e em
  // que arquivo (com o relogio ligado) fica a daily. Sem arquivo ('') nada e
  // registrado. Quem le trata campo faltando como o padrao (obterTarefas).
  tarefas: { aoConcluir: 'daily', arquivoDaily: '' },
};

/** Fonte e tamanho do texto de uma janela. Nenhum dos dois campos e obrigatorio. */
const APARENCIA = {
  type: 'object',
  properties: {
    fonte: { type: 'string', enum: FONTES_VALIDAS },
    tamanho: { type: 'integer', minimum: TAMANHO_FONTE_MINIMO, maximum: TAMANHO_FONTE_MAXIMO },
  },
  additionalProperties: false,
};

/** Formato de um tamanho de janela salvo. Reaproveitado para as tres janelas. */
const TAMANHO = {
  type: 'object',
  properties: {
    largura: { type: 'integer', minimum: 100 },
    altura: { type: 'integer', minimum: 100 },
  },
  required: ['largura', 'altura'],
  additionalProperties: false,
};

/**
 * Formato esperado do arquivo. Se alguem editar o config.json na mao e
 * escrever algo invalido, o electron-store apaga e recomeca dos padroes
 * (clearInvalidConfig) em vez de o app quebrar na abertura.
 */
const ESQUEMA = {
  binds: {
    type: 'object',
    properties: {
      diff: { type: 'string' },
      note: { type: 'string' },
      sql: { type: 'string' },
      i18n: { type: 'string' },
    },
    required: ['diff', 'note', 'sql', 'i18n'],
    additionalProperties: false,
  },
  pastaNotas: { type: 'string' },
  notaPrincipal: { type: 'string' },
  ultimaNota: { type: 'string' },
  notasHistorico: { type: 'array', items: { type: 'string' } },
  notasLivres: { type: 'array', items: { type: 'string' } },
  notasQuadro: { type: 'array', items: { type: 'string' } },
  notasTexto: { type: 'array', items: { type: 'string' } },
  // As abas do Fast Note: so nomes de arquivo e ids (o texto das abas rapidas fica em abas-rapidas.json, fora daqui).
  abasNota: {
    type: 'object',
    properties: {
      abertas: { type: 'array', maxItems: 40, items: { type: 'object' } },
      ativa: { type: 'string', maxLength: 255 },
    },
    additionalProperties: false,
  },
  sql: {
    type: 'object',
    properties: {
      dialeto: {
        type: 'string',
        enum: ['transactsql', 'postgresql', 'mysql', 'plsql', 'sql'],
      },
      palavrasChave: {
        type: 'string',
        enum: ['upper', 'lower', 'preserve'],
      },
      indentacao: {
        type: 'string',
        enum: ['2', '4', 'tab'],
      },
      estilo: {
        type: 'string',
        enum: ['alinhado', 'classico'],
      },
      autoRemoto: { type: 'boolean' },
      autoRemotoJson: { type: 'boolean' },
    },
    required: ['dialeto', 'palavrasChave', 'indentacao'],
    additionalProperties: false,
  },
  abaAtiva: {
    type: 'string',
    enum: ['diff', 'note', 'sql', 'i18n'],
  },
  aparencia: {
    type: 'object',
    properties: {
      note: APARENCIA,
      diff: APARENCIA,
    },
    additionalProperties: false,
  },
  diff: {
    type: 'object',
    properties: {
      tema: { type: 'string', enum: TEMAS_DIFF },
    },
    additionalProperties: false,
  },
  tarefas: {
    type: 'object',
    properties: {
      aoConcluir: { type: 'string', enum: MODOS_AO_CONCLUIR },
      arquivoDaily: { type: 'string', maxLength: 255 },
    },
    additionalProperties: false,
  },
  janelas: {
    type: 'object',
    properties: {
      principal: TAMANHO,
      diff: TAMANHO,
      nota: TAMANHO,
      // A janela do Fast Note com um arquivo em folha livre: tamanho proprio, lembrado a parte.
      notaLivre: TAMANHO,
      notaQuadro: TAMANHO,
    },
    additionalProperties: false,
  },
};

/** As janelas que tem tamanho salvo. */
const JANELAS = new Set(['principal', 'diff', 'nota', 'notaLivre', 'notaQuadro']);

/**
 * Unicos caminhos que as telas podem gravar.
 *
 * As telas pedem a gravacao por IPC, e IPC e uma porta aberta: se um dia uma
 * tela carregar algo que nao deveria, a lista impede que ela escreva qualquer
 * chave no arquivo. Tudo que nao esta aqui e recusado.
 */
const CAMINHOS_GRAVAVEIS = new Set([
  'binds.diff',
  'binds.note',
  'binds.sql',
  'binds.i18n',
  'pastaNotas',
  'sql.dialeto',
  'sql.palavrasChave',
  'sql.indentacao',
  'sql.estilo',
  'sql.autoRemoto',
  'sql.autoRemotoJson',
  'aparencia.note.fonte',
  'aparencia.note.tamanho',
  'aparencia.diff.fonte',
  'aparencia.diff.tamanho',
  'diff.tema',
  'tarefas.aoConcluir',
  'tarefas.arquivoDaily',
  'abaAtiva',
]);

/**
 * Cria o Store, com uma segunda camada de protecao alem do clearInvalidConfig
 * da propria biblioteca.
 *
 * O clearInvalidConfig do electron-store so cobre um caso: o config.json
 * virar um JSON invalido (erro de sintaxe). Um arquivo que continua sendo
 * JSON valido, mas que nao bate mais com um ESQUEMA que ganhou uma exigencia
 * nova (por exemplo, uma bind nova que passou a ser obrigatoria dentro de
 * "binds"), faz o construtor do Store lancar excecao mesmo assim - e essa
 * excecao aconteceria na abertura do app inteiro, antes de qualquer janela
 * existir. Aqui a mesma intencao do clearInvalidConfig (comecar dos padroes
 * em vez de quebrar) e aplicada tambem para esse segundo caso.
 */
function criarStore() {
  try {
    return new Store({ defaults: PADROES, schema: ESQUEMA, clearInvalidConfig: true });
  } catch (erro) {
    console.warn('[config] config.json nao bate mais com o schema atual, recomecando dos padroes:', erro.message);

    try {
      // Sem schema, o Store so calcula o caminho do arquivo - nao le nem
      // valida nada. E o unico jeito de descobrir o caminho certo (depende
      // do nome do app) sem cair na mesma excecao de novo.
      const semSchema = new Store();
      fs.rmSync(semSchema.path, { force: true });
    } catch (erroLimpeza) {
      console.warn('[config] nao consegui apagar o config.json antigo:', erroLimpeza.message);
    }

    return new Store({ defaults: PADROES, schema: ESQUEMA, clearInvalidConfig: true });
  }
}

const store = criarStore();

module.exports = {
  PADROES,
  CAMINHOS_GRAVAVEIS,
  FONTES_VALIDAS,
  TEMAS_DIFF,
  MODOS_AO_CONCLUIR,
  TAMANHO_FONTE_MINIMO,
  TAMANHO_FONTE_MAXIMO,

  /**
   * As opcoes de concluir tarefa, sempre com os dois campos: o que faltar (ou
   * estiver fora da lista) vale o padrao ('daily', sem arquivo = nada registrado).
   */
  obterTarefas() {
    const salvo = store.get('tarefas') || {};
    return {
      aoConcluir: MODOS_AO_CONCLUIR.includes(salvo.aoConcluir) ? salvo.aoConcluir : PADROES.tarefas.aoConcluir,
      arquivoDaily: typeof salvo.arquivoDaily === 'string' ? salvo.arquivoDaily : PADROES.tarefas.arquivoDaily,
    };
  },

  /** O tema de cores do Diff; o que faltar (ou estiver fora da lista) vale o padrao. */
  obterTemaDiff() {
    const tema = store.get('diff.tema');
    return TEMAS_DIFF.includes(tema) ? tema : PADROES.diff.tema;
  },

  /**
   * Fonte e tamanho do texto de uma janela ('note' ou 'diff'), sempre com os
   * dois campos: o que faltar (ou estiver fora da lista) vale o padrao.
   */
  obterAparencia(janela) {
    const padrao = PADROES.aparencia[janela];
    if (!padrao) return null;

    const salvo = store.get(`aparencia.${janela}`) || {};
    const tamanhoOk = Number.isInteger(salvo.tamanho) && salvo.tamanho >= TAMANHO_FONTE_MINIMO && salvo.tamanho <= TAMANHO_FONTE_MAXIMO;
    return {
      fonte: FONTES_VALIDAS.includes(salvo.fonte) ? salvo.fonte : padrao.fonte,
      tamanho: tamanhoOk ? salvo.tamanho : padrao.tamanho,
    };
  },

  /** Todas as configuracoes de uma vez, para a tela montar de uma so leitura. */
  obterTudo() {
    return store.store;
  },

  /** Le um campo. Aceita caminho com ponto, ex.: obter('sql.dialeto'). */
  obter(caminho) {
    return store.get(caminho);
  },

  /**
   * Grava um campo. Devolve true se gravou, false se o caminho nao esta na
   * lista de gravaveis.
   */
  definir(caminho, valor) {
    if (!CAMINHOS_GRAVAVEIS.has(caminho)) {
      console.warn(`[config] recusado: "${caminho}" nao e um caminho gravavel`);
      return false;
    }
    store.set(caminho, valor);
    return true;
  },

  /**
   * Tamanho salvo de uma janela: { largura, altura }, ou null se o usuario
   * nunca redimensionou.
   */
  obterTamanho(janela) {
    if (!JANELAS.has(janela)) return null;
    return store.get(`janelas.${janela}`) || null;
  },

  /**
   * Guarda o tamanho de uma janela.
   *
   * Fica fora dos CAMINHOS_GRAVAVEIS de proposito: quem chama e o processo
   * principal, quando a janela termina de ser redimensionada. As telas nao
   * tem por que mexer nisso.
   */
  salvarTamanho(janela, largura, altura) {
    if (!JANELAS.has(janela)) return false;
    if (!Number.isFinite(largura) || !Number.isFinite(altura)) return false;

    const tamanho = { largura: Math.round(largura), altura: Math.round(altura) };

    // Confere antes em vez de deixar o schema recusar: o electron-store
    // recusa lancando excecao, e uma excecao dentro do tratador de 'resized'
    // viraria uma caixa de erro do Electron na cara do usuario.
    if (tamanho.largura < 100 || tamanho.altura < 100) return false;

    try {
      store.set(`janelas.${janela}`, tamanho);
      return true;
    } catch (erro) {
      console.warn('[config] nao consegui salvar o tamanho da janela:', erro.message);
      return false;
    }
  },

  /**
   * Grava o arquivo principal do Fast Note ('' = nenhum).
   *
   * Fora dos CAMINHOS_GRAVAVEIS de proposito: quem chama e o processo
   * principal, depois de conferir que o arquivo existe na pasta de notas.
   */
  definirNotaPrincipal(nome) {
    if (typeof nome !== 'string') return false;
    store.set('notaPrincipal', nome);
    return true;
  },

  /**
   * Grava o ultimo arquivo aberto no Fast Note ('' = nenhum).
   *
   * Fora dos CAMINHOS_GRAVAVEIS pelo mesmo motivo do notaPrincipal: quem
   * chama e o processo principal, depois de conferir que o arquivo existe.
   */
  definirUltimaNota(nome) {
    if (typeof nome !== 'string') return false;
    store.set('ultimaNota', nome);
    return true;
  },

  /**
   * Grava a lista de arquivos do Fast Note com o historico diario ligado.
   *
   * Fora dos CAMINHOS_GRAVAVEIS pelo mesmo motivo do notaPrincipal: quem
   * chama e o processo principal, depois de validar cada nome contra a
   * pasta de notas.
   */
  definirHistoricoArquivos(lista) {
    if (!Array.isArray(lista) || !lista.every((v) => typeof v === 'string')) return false;
    store.set('notasHistorico', lista);
    return true;
  },

  /**
   * Grava a lista de arquivos do Fast Note em folha livre.
   *
   * Fora dos CAMINHOS_GRAVAVEIS pelo mesmo motivo do relogio: quem chama e o
   * processo principal, depois de validar cada nome contra a pasta de notas.
   */
  definirNotasTexto(lista) {
    if (!Array.isArray(lista) || !lista.every((v) => typeof v === 'string')) return;
    store.set('notasTexto', lista);
  },

  /** As abas abertas do Fast Note ({ abertas, ativa }); quem valida o conteudo e o abas.js. */
  definirAbasNota(estado) {
    if (!estado || typeof estado !== 'object' || !Array.isArray(estado.abertas)) return;
    store.set('abasNota', { abertas: estado.abertas, ativa: typeof estado.ativa === 'string' ? estado.ativa : '' });
  },

  definirNotasQuadro(lista) {
    if (!Array.isArray(lista)) return;
    store.set('notasQuadro', lista);
  },

  definirNotasLivres(lista) {
    if (!Array.isArray(lista) || !lista.every((v) => typeof v === 'string')) return false;
    store.set('notasLivres', lista);
    return true;
  },

  /** Caminho do config.json em disco, util para depurar. */
  caminhoArquivo() {
    return store.path;
  },
};
