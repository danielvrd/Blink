/**
 * Diff Checker.
 *
 * A bind funciona em dois tempos:
 *
 *   1a vez  captura o texto selecionado e guarda aqui na memoria;
 *   2a vez  captura de novo, compara com o guardado e abre a janela.
 *
 * Ao abrir a janela o guardado e descartado, entao o proximo par de binds
 * comeca do zero. Sem isso o terceiro uso compararia com um texto velho.
 */

const comparador = require('./comparador');
const realce = require('./realce');
const selecao = require('./selecao');
const janelas = require('./janelas');
const aviso = require('./aviso');

/**
 * Por quanto tempo o primeiro texto continua valendo.
 *
 * Passou disso, a proxima bind volta a ser a primeira. E para o caso de
 * capturar um texto, se distrair, e meia hora depois comparar sem lembrar
 * com o que.
 */
const VALIDADE = 2 * 60 * 1000;

/** O primeiro texto: { texto, quando } ou null. */
let guardado = null;

/** Evita dois disparos ao mesmo tempo mexendo na area de transferencia. */
let ocupado = false;

/** Ha um primeiro texto guardado e ainda dentro da validade? */
function temGuardado() {
  return guardado !== null && Date.now() - guardado.quando < VALIDADE;
}

/** Descarta o primeiro texto. */
function limpar() {
  guardado = null;
}

/**
 * Compara dois textos e anexa as cores do codigo (se houver codigo) as linhas.
 *
 * O realce e um enfeite: se falhar por qualquer motivo, a comparacao abre do
 * mesmo jeito, sem cor.
 */
function compararComRealce(a, b) {
  const linhas = comparador.comparar(a, b);
  try {
    realce.anexar(linhas);
  } catch (erro) {
    console.warn('[ferramenta-diff] realce falhou:', erro.message);
    for (const linha of linhas) {
      delete linha.tokensEsquerda;
      delete linha.tokensDireita;
    }
  }
  return linhas;
}

/** O que a bind do Diff Checker faz. */
async function executar() {
  if (ocupado) return;
  ocupado = true;

  try {
    const texto = await selecao.capturar();

    if (texto.trim() === '') {
      aviso.mostrar('Selecione um texto antes de usar o atalho.');
      return;
    }

    // Primeira bind (ou a anterior ja venceu): so guarda e avisa.
    if (!temGuardado()) {
      guardado = { texto, quando: Date.now() };
      aviso.mostrar('1º texto capturado — selecione o segundo e use o atalho de novo.');
      return;
    }

    const primeiro = guardado.texto;

    // A comparacao comeca agora, entao o guardado ja cumpriu o papel. Limpar
    // aqui e nao depois garante que o proximo par comeca limpo mesmo que
    // abrir a janela de errado.
    limpar();

    if (primeiro === texto) {
      aviso.mostrar('Os dois textos são iguais. Nada para comparar.');
      return;
    }

    janelas.abrirDiff(compararComRealce(primeiro, texto));
  } catch (erro) {
    console.error('[ferramenta-diff] falhou:', erro);
    aviso.mostrar('Algo deu errado ao comparar os textos.');
    limpar();
  } finally {
    ocupado = false;
  }
}

/**
 * Abre a janela com um exemplo pronto, sem capturar nada.
 *
 * E o botao "Abrir demonstracao" da aba: serve para ver como a comparacao
 * fica e testar o aplicar linha a linha.
 */
function abrirExemplo() {
  const esquerda = [
    'Relatório de Sprint — Semana 12',
    'O time finalizou 8 das 10 tarefas planejadas.',
    'A funcionalidade de login social ainda está em revisão.',
    'Testamos a integração com o novo servidor de pagamentos.',
    'Nenhum bug crítico foi reportado esta semana.',
    'Próxima sprint focará em performance.',
    'Reunião de retrospectiva marcada para sexta-feira.',
  ].join('\n');

  const direita = [
    'Relatório de Sprint — Semana 12',
    'O time finalizou 9 das 10 tarefas planejadas.',
    'A funcionalidade de login social ainda está em revisão.',
    'Testamos a integração com o novo servidor de pagamentos e aprovamos.',
    'Nenhum bug crítico foi reportado esta semana.',
    'Próxima sprint focará em performance e acessibilidade.',
    'Reunião de retrospectiva marcada para sexta-feira.',
  ].join('\n');

  janelas.abrirDiff(compararComRealce(esquerda, direita));
}

module.exports = { executar, abrirExemplo, temGuardado, limpar, compararComRealce };
