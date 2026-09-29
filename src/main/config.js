/**
 * Configuracoes do Blink, gravadas em %APPDATA%/Blink/config.json.
 *
 * Usa o electron-store, que cuida de criar o arquivo, aplicar os valores
 * padrao e gravar em disco a cada mudanca. A versao 8 e proposital: da 9 em
 * diante a biblioteca so existe como modulo ES e nao da para usar require().
 */

const Store = require('electron-store');

/** Valores usados na primeira execucao e sempre que um campo faltar. */
const PADROES = {
  binds: {
    diff: 'Ctrl+Alt+D',
    note: 'Ctrl+Alt+N',
    sql: 'Ctrl+Alt+F',
  },
  // Vazio = o usuario ainda nao escolheu a pasta das notas.
  pastaNotas: '',
  // O arquivo da estrela no Fast Note, que o Ctrl+Alt+N abre. Vazio = nenhum.
  notaPrincipal: '',
  sql: {
    dialeto: 'transactsql',
    palavrasChave: 'upper',
    indentacao: '4',
    // Formatar sozinho a SQL copiada de dentro de uma Area de Trabalho
    // Remota, sem precisar do atalho (veja monitor-sql.js).
    autoRemoto: true,
  },
  abaAtiva: 'diff',
  // Tamanho de cada janela, depois que o usuario redimensiona. Vazio =
  // tamanho padrao do design.
  janelas: {},
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
    },
    required: ['diff', 'note', 'sql'],
    additionalProperties: false,
  },
  pastaNotas: { type: 'string' },
  notaPrincipal: { type: 'string' },
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
      autoRemoto: { type: 'boolean' },
    },
    required: ['dialeto', 'palavrasChave', 'indentacao'],
    additionalProperties: false,
  },
  abaAtiva: {
    type: 'string',
    enum: ['diff', 'note', 'sql'],
  },
  janelas: {
    type: 'object',
    properties: {
      principal: TAMANHO,
      diff: TAMANHO,
      nota: TAMANHO,
    },
    additionalProperties: false,
  },
};

/** As janelas que tem tamanho salvo. */
const JANELAS = new Set(['principal', 'diff', 'nota']);

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
  'pastaNotas',
  'sql.dialeto',
  'sql.palavrasChave',
  'sql.indentacao',
  'sql.autoRemoto',
  'abaAtiva',
]);

const store = new Store({
  defaults: PADROES,
  schema: ESQUEMA,
  clearInvalidConfig: true,
});

module.exports = {
  PADROES,
  CAMINHOS_GRAVAVEIS,

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

  /** Caminho do config.json em disco, util para depurar. */
  caminhoArquivo() {
    return store.path;
  },
};
