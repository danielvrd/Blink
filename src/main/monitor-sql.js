/**
 * Modo automatico do SQL Formatter para a Area de Trabalho Remota.
 *
 * Em tela cheia, a Area de Trabalho Remota captura todas as combinacoes de
 * teclas e manda para o servidor - o Ctrl+Alt+F nunca chega no Blink. Este
 * modo resolve sem atalho: o usuario da Ctrl+C normal dentro do servidor, e
 * quando a copia chega aqui o Blink formata sozinho.
 *
 * So age quando as duas coisas sao verdade:
 *   - a copia veio de uma janela de Area de Trabalho Remota;
 *   - o texto COMECA com SELECT, INSERT, UPDATE, DELETE ou WITH.
 *
 * O segundo filtro e o que evita estragar copia comum: uma linha de log com
 * "select" no meio nao e formatada. Ainda assim nao e infalivel, por isso o
 * modo tem liga/desliga na aba SQL Formatter.
 */

const { clipboard } = require('electron');

const config = require('./config');
const selecao = require('./selecao');
const ferramentaSql = require('./ferramenta-sql');
const aviso = require('./aviso');
const diagnostico = require('./diagnostico');

/** De quanto em quanto tempo olhar. */
const INTERVALO = 400;

/**
 * Por quanto tempo, depois de sair da janela remota, uma copia ainda conta
 * como vinda dela. A copia remota atravessa a rede e pode chegar depois de o
 * usuario ja ter trocado de janela.
 */
const TEMPO_APOS_SAIR = 5000;

/** Comeca com uma das palavras de SQL, ignorando espacos e caixa. */
const PARECE_SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;

/** Quando a janela da frente foi remota pela ultima vez. */
let ultimaVezRemoto = 0;

/**
 * O ultimo texto visto na area de transferencia. null = ainda nao olhou
 * desde que entrou numa janela remota; a primeira olhada so anota o que ja
 * estava la, para nao formatar uma copia antiga.
 */
let ultimoVisto = null;

/** Evita duas verificacoes ao mesmo tempo, se uma demorar mais que o intervalo. */
let verificando = false;

function ligado() {
  // Configuracao antiga, de antes desta opcao existir, nao tem o campo:
  // vale o padrao, que e ligado.
  return config.obter('sql.autoRemoto') !== false;
}

/**
 * Uma olhada. A maior parte do tempo sai logo na primeira linha: sem janela
 * remota por perto, nem le a area de transferencia.
 */
async function verificar() {
  if (!ligado()) {
    ultimoVisto = null;
    return;
  }

  const titulo = selecao.tituloDaJanelaAtiva();
  if (selecao.ehAcessoRemoto(titulo)) ultimaVezRemoto = Date.now();

  if (Date.now() - ultimaVezRemoto > TEMPO_APOS_SAIR) {
    ultimoVisto = null;
    return;
  }

  const texto = await clipboard.readText();

  if (ultimoVisto === null) {
    ultimoVisto = texto;
    return;
  }
  if (texto === ultimoVisto) return;
  ultimoVisto = texto;

  // A mudanca foi feita pela captura de um atalho do proprio Blink.
  if (selecao.emUso()) return;

  if (!PARECE_SQL.test(texto)) return;

  const resultado = ferramentaSql.formatar(texto);
  if (!resultado.ok || resultado.texto === texto) return;

  await clipboard.writeText(resultado.texto);
  ultimoVisto = resultado.texto;

  // A mesma protecao do atalho: se uma segunda sincronizacao da copia
  // remota trouxer a crua de volta, a formatada e regravada.
  ferramentaSql.guardarContraSobrescrita(texto, resultado.texto).catch(() => {});

  diagnostico.registrar('sql-auto', { janela: titulo, caracteres: texto.length });
  aviso.mostrar('SQL da Área de Trabalho Remota formatada. Cole com Ctrl + V.');
}

/** Liga a vigilancia. Chamado uma vez, na abertura do app. */
function iniciar() {
  setInterval(async () => {
    if (verificando) return;
    verificando = true;
    try {
      await verificar();
    } catch (erro) {
      console.warn('[monitor-sql] falhou:', erro.message);
    } finally {
      verificando = false;
    }
  }, INTERVALO);
}

module.exports = { iniciar, verificar, PARECE_SQL };
