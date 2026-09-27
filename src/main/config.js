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
  sql: {
    dialeto: 'transactsql',
    palavrasChave: 'upper',
    indentacao: '4',
  },
  abaAtiva: 'diff',
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
    },
    required: ['dialeto', 'palavrasChave', 'indentacao'],
    additionalProperties: false,
  },
  abaAtiva: {
    type: 'string',
    enum: ['diff', 'note', 'sql'],
  },
};

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

  /** Caminho do config.json em disco, util para depurar. */
  caminhoArquivo() {
    return store.path;
  },
};
