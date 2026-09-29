/**
 * I18n.
 *
 * Nao abre janela nenhuma, no mesmo molde do SQL Formatter: a bind pega o
 * texto selecionado, troca certos caracteres por sequencias de escape
 * \uXXXX do JavaScript e deixa o resultado na area de transferencia, pronto
 * para colar em outro codigo.
 *
 * O texto de origem nao e tocado, como nas outras ferramentas.
 */

const { clipboard } = require('electron');

const selecao = require('./selecao');
const aviso = require('./aviso');
const diagnostico = require('./diagnostico');

/**
 * Evita dois disparos ao mesmo tempo. Mesma trava do SQL Formatter, mesmo
 * motivo: a bind e facil de apertar duas vezes seguidas.
 */
let ocupado = false;

/** Por quanto tempo vigiar a area de transferencia depois de gravar o resultado. */
const TEMPO_DE_GUARDA = 3000;
const INTERVALO_DA_GUARDA = 150;

/** Qual guarda esta valendo - mesma ideia do SQL Formatter (ferramenta-sql.js). */
let guardaAtual = 0;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uma sequencia de escape do JavaScript (uma contra-barra, um "u" e quatro
 * digitos hexadecimais), construida por codigo em vez de escrita direto no
 * fonte.
 *
 * Escrever a sequencia direto no fonte com UMA contra-barra faria o proprio
 * JavaScript decodificar ela na hora de carregar o arquivo, e o resultado
 * viraria o caractere de volta - o oposto do que esta funcao precisa
 * produzir. Precisaria de DUAS contra-barras para funcionar, o que e facil
 * de digitar errado e dificil de notar so relendo. Montar a contra-barra com
 * String.fromCharCode(92) tira essa pegadinha do caminho de vez.
 */
function escape(hex) {
  return String.fromCharCode(92) + 'u' + hex;
}

/**
 * Cada par e "o caractere que aparece no texto selecionado" -> "o que ele
 * vira depois da bind".
 *
 * Quase todos os pares sao "o mesmo caractere, so que como escape" - a
 * unica excecao de proposito e a ultima linha (a aspa curva simples
 * esquerda, U+2018), que troca por OUTRO caractere (o apostrofo reto), nao
 * pelo escape de si mesma. Qualquer entrada nova que seguir esse mesmo
 * padrao deveria ganhar um comentario como este, para nao parecer erro de
 * digitacao.
 */
const TRADUCOES = {
  'á': escape('00e1'), 'à': escape('00e0'), 'â': escape('00e2'), 'ã': escape('00e3'), 'ä': escape('00e4'),
  'Á': escape('00c1'), 'À': escape('00c0'), 'Â': escape('00c2'), 'Ã': escape('00c3'), 'Ä': escape('00c4'),

  'é': escape('00e9'), 'è': escape('00e8'), 'ê': escape('00ea'),
  'É': escape('00c9'), 'È': escape('00c8'), 'Ê': escape('00ca'), 'Ë': escape('00cb'),

  'í': escape('00ed'), 'ì': escape('00ec'), 'î': escape('00ee'), 'ï': escape('00ef'),
  'Í': escape('00cd'), 'Ì': escape('00cc'), 'Î': escape('00ce'), 'Ï': escape('00cf'),

  'ó': escape('00f3'), 'ò': escape('00f2'), 'ô': escape('00f4'), 'õ': escape('00f5'), 'ö': escape('00f6'),
  'Ó': escape('00d3'), 'Ò': escape('00d2'), 'Ô': escape('00d4'), 'Õ': escape('00d5'), 'Ö': escape('00d6'),

  'ú': escape('00fa'), 'ù': escape('00f9'), 'û': escape('00fb'), 'ü': escape('00fc'),
  'Ú': escape('00da'), 'Ù': escape('00d9'), 'Û': escape('00db'),

  'ç': escape('00e7'), 'Ç': escape('00c7'),
  'ñ': escape('00f1'), 'Ñ': escape('00d1'),

  '&': escape('0026'),

  // Aspa curva simples esquerda (U+2018) -> apostrofo reto de escape.
  [String.fromCharCode(0x2018)]: escape('0027'),
};

/**
 * Troca cada caractere da tabela pelo seu escape.
 *
 * Percorre caractere a caractere em vez de montar uma classe de regex: sem
 * regex nao ha pegadinha nenhuma se um dia a tabela crescer com um
 * caractere especial de classe (como "]" ou "-") - so acrescentar a linha
 * na tabela basta.
 */
function traduzir(texto) {
  let resultado = '';
  for (const caractere of texto) resultado += TRADUCOES[caractere] || caractere;
  return resultado;
}

/**
 * Protege o resultado de ser atropelado pela copia remota atrasada.
 *
 * Copia adaptada de ferramenta-sql.js: mesmo problema (numa Area de
 * Trabalho Remota a copia crua pode chegar depois de o Blink ja ter gravado
 * o resultado, e sobrescrever), mesma solucao.
 */
async function guardarContraSobrescrita(cru, traduzido) {
  const minha = ++guardaAtual;

  // Ja nao tinha nada para trocar: cru e traduzido sao o mesmo texto.
  if (cru === traduzido) return 0;

  const fim = Date.now() + TEMPO_DE_GUARDA;
  let regravacoes = 0;

  while (Date.now() < fim && minha === guardaAtual) {
    await esperar(INTERVALO_DA_GUARDA);
    if (minha !== guardaAtual) break;

    const atual = await clipboard.readText();
    if (atual === cru) {
      await clipboard.writeText(traduzido);
      regravacoes += 1;
    } else if (atual !== traduzido) {
      // O usuario copiou outra coisa: nao e mais problema nosso.
      break;
    }
  }

  if (regravacoes > 0) diagnostico.registrar('i18n-guarda', { regravacoes });
  return regravacoes;
}

/** O que a bind do I18n faz. */
async function executar() {
  if (ocupado) return;
  ocupado = true;

  try {
    const original = await selecao.capturar();

    if (original.trim() === '') {
      aviso.mostrar('Selecione um texto antes de usar o atalho.');
      return;
    }

    // Diferente do SQL, aqui todo texto e valido - nao ha branch de erro
    // entre capturar e escrever na area de transferencia.
    const resultado = traduzir(original);

    await clipboard.writeText(resultado);
    guardarContraSobrescrita(original, resultado).catch((erro) => {
      console.warn('[ferramenta-i18n] guarda falhou:', erro.message);
    });

    aviso.mostrar(
      resultado === original
        ? 'O texto não tinha nenhum caractere para converter. Copiado sem alterações.'
        : 'Texto convertido e copiado. Cole onde quiser com Ctrl + V.'
    );
  } catch (erro) {
    console.error('[ferramenta-i18n] falhou:', erro);
    aviso.mostrar('Algo deu errado ao converter o texto.');
  } finally {
    ocupado = false;
  }
}

module.exports = { executar, traduzir, guardarContraSobrescrita, TRADUCOES };
