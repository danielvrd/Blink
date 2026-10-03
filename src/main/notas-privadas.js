/**
 * Arquivos com cadeado do Fast Note: abrir, gravar, credenciais e trancar.
 *
 * A criptografia em si esta em privado.js. Aqui fica a SESSAO: um arquivo aberto com a
 * senha guarda, so na memoria do processo principal, a chave derivada e o conteudo ja
 * decifrado. Ate o arquivo ser trancado - ao trocar de arquivo, minimizar ou fechar a
 * janela (janelas.js) - a tela pode ler e gravar; depois disso, so com a senha de novo.
 * Nada do conteudo vai para disco em claro (nem arquivo temporario, nem log): a gravacao
 * escreve o texto JA CIFRADO num arquivo ao lado e renomeia por cima do original.
 *
 * Modelo do conteudo, na sessao e na tela:
 *   { tipo: 'texto', texto }                      um topico comum
 *   { tipo: 'credencial', id, titulo }            uma credencial; login e senha ficam so aqui,
 *                                                  e a tela so os recebe pelo olhinho, com a senha
 * No arquivo (cifrado) cada credencial e { tipo, titulo, login, senha }; o `id` e sorteado a
 * cada abertura, so para a tela apontar para uma credencial sem conhecer o segredo.
 *
 * Senha errada: espera ATRASO_APOS_ERRO antes de aceitar outra tentativa (por arquivo).
 * Copiar uma credencial: a area de transferencia e limpa depois de TEMPO_DE_LIMPEZA se ainda
 * estiver com a senha (se o usuario copiou outra coisa, nao mexe).
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { app, clipboard } = require('electron');

const config = require('./config');
const notas = require('./notas');
const cripto = require('./privado');
const areaSegura = require('./area-segura');

/** Quanto esperar depois de uma senha errada, e quanto tempo a senha copiada fica na area de transferencia. */
let atrasoAposErro = 1000;
let tempoDeLimpeza = 30 * 1000;

/** Senha minima de um arquivo novo. */
const TAMANHO_MINIMO_DA_SENHA = 4;

/** As sessoes abertas, por nome de arquivo em minusculas (o Windows nao diferencia). */
const sessoes = new Map();

/** Ate quando cada arquivo recusa uma tentativa de senha (depois de um erro). */
const bloqueios = new Map();

const chaveDe = (arquivo) => String(arquivo).toLowerCase();

/** Uma operacao de gravacao por vez em cada sessao. */
function naFila(sessao, trabalho) {
  const resultado = sessao.fila.then(trabalho);
  sessao.fila = resultado.catch(() => {});
  return resultado;
}

// --- Ajudantes ---------------------------------------------------------------------

/** Recusa se o arquivo ainda esta "de castigo" da ultima senha errada. */
function emEspera(arquivo) {
  const ate = bloqueios.get(chaveDe(arquivo)) || 0;
  const falta = ate - Date.now();
  return falta > 0 ? { ok: false, motivo: 'espere', espera: falta } : null;
}

function errouASenha(arquivo) {
  bloqueios.set(chaveDe(arquivo), Date.now() + atrasoAposErro);
}

/** O que a tela recebe de uma sessao: a ordem dos itens, sem segredo nenhum. */
function itensParaATela(sessao) {
  return sessao.itens.map((item) => (item.tipo === 'credencial' ? { tipo: 'credencial', id: item.id, titulo: sessao.credenciais.get(item.id).titulo } : { tipo: 'texto', texto: item.texto }));
}

/** O objeto que vai cifrado para o arquivo. */
function conteudoDaSessao(sessao) {
  return {
    v: 1,
    cabecalho: sessao.cabecalho,
    rodape: sessao.rodape,
    topicos: sessao.itens.map((item) => (item.tipo === 'credencial' ? { tipo: 'credencial', ...sessao.credenciais.get(item.id) } : { tipo: 'texto', texto: item.texto })),
  };
}

/**
 * Grava um arquivo por inteiro e com seguranca: escreve num arquivo ao lado e renomeia por cima.
 * Uma queda no meio da gravacao deixa o original como estava, nunca pela metade.
 */
async function gravarPorInteiro(completo, texto) {
  const temporario = path.join(path.dirname(completo), `.${path.basename(completo)}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temporario, texto, 'utf8');
    await fs.rename(temporario, completo);
  } catch (erro) {
    try { await fs.rm(temporario, { force: true }); } catch (e) { /* o temporario so tem texto cifrado ou o que ja iria ao .md */ }
    throw erro;
  }
}

/** Monta uma sessao a partir do conteudo decifrado. */
function criarSessao(arquivo, objeto, chave, kdf) {
  const credenciais = new Map();
  const itens = [];
  for (const topico of Array.isArray(objeto.topicos) ? objeto.topicos : []) {
    if (topico && topico.tipo === 'credencial') {
      const id = crypto.randomUUID();
      credenciais.set(id, { titulo: String(topico.titulo ?? ''), login: String(topico.login ?? ''), senha: String(topico.senha ?? '') });
      itens.push({ tipo: 'credencial', id });
    } else if (topico && typeof topico.texto === 'string') {
      itens.push({ tipo: 'texto', texto: topico.texto });
    }
  }
  return {
    arquivo,
    chave,
    kdf,
    cabecalho: Array.isArray(objeto.cabecalho) ? objeto.cabecalho.map(String) : [],
    rodape: Array.isArray(objeto.rodape) ? objeto.rodape.map(String) : [],
    itens,
    credenciais,
    fila: Promise.resolve(),
  };
}

/** Regrava o arquivo cifrado com a chave da sessao (iv novo, sem repetir o scrypt). */
function gravarSessao(sessao) {
  return naFila(sessao, async () => {
    const completo = notas.caminhoDe(sessao.arquivo);
    if (!completo) throw new Error('arquivo fora da pasta de notas');
    await gravarPorInteiro(completo, cripto.cifrarComChave(conteudoDaSessao(sessao), sessao.chave, sessao.kdf));
  });
}

const sessaoDe = (arquivo) => sessoes.get(chaveDe(arquivo)) || null;

/** O nome do arquivo como esta na pasta (ou null se nao existe / nome invalido). */
async function nomeReal(arquivo) {
  const nome = notas.nomeDeArquivo(arquivo);
  if (!nome) return null;
  return (await notas.listar()).find((a) => notas.mesmoArquivo(a, nome)) || null;
}

// --- Ligar e desligar o cadeado ------------------------------------------------------

/**
 * Poe o cadeado num arquivo comum. Recusa o task.md, arquivo com o relogio ligado e o que ja tem cadeado.
 * Em caso de sucesso o arquivo fica ABERTO (o usuario acabou de digitar a senha) ate ser trancado.
 */
async function ativar(arquivo, senha) {
  if (typeof senha !== 'string' || senha.length < TAMANHO_MINIMO_DA_SENHA) return { ok: false, motivo: 'senha-curta' };

  const nome = await nomeReal(arquivo);
  if (!nome) return { ok: false, motivo: 'inexistente' };
  if (notas.mesmoArquivo(nome, notas.ARQUIVO_TAREFAS)) return { ok: false, motivo: 'tarefas' };
  if ((config.obter('notasHistorico') || []).some((h) => notas.mesmoArquivo(h, nome))) return { ok: false, motivo: 'historico' };
  if (notas.ehArquivoLivre(nome)) return { ok: false, motivo: 'livre' };

  const completo = notas.caminhoDe(nome);
  if (await notas.ehArquivoPrivado(completo)) return { ok: false, motivo: 'ja-privado' };

  const partes = notas.separar(await fs.readFile(completo, 'utf8'));
  const objeto = { v: 1, cabecalho: partes.cabecalho, rodape: partes.rodape, topicos: partes.topicos.map((texto) => ({ tipo: 'texto', texto })) };

  const { texto, chave, kdf } = await cripto.cifrar(objeto, senha);
  await gravarPorInteiro(completo, texto);

  const sessao = criarSessao(nome, objeto, chave, kdf);
  sessoes.set(chaveDe(nome), sessao);
  return { ok: true, itens: itensParaATela(sessao) };
}

/**
 * Tira o cadeado: pede a senha, avisa (na tela) que as senhas das credenciais ficam visiveis no arquivo e
 * grava o .md comum. Uma credencial vira o topico "Titulo - login: x - senha: y".
 */
async function desativar(arquivo, senha) {
  const nome = await nomeReal(arquivo);
  if (!nome) return { ok: false, motivo: 'inexistente' };

  const espera = emEspera(nome);
  if (espera) return espera;

  const completo = notas.caminhoDe(nome);
  let aberto;
  try {
    aberto = await cripto.decifrar(await fs.readFile(completo, 'utf8'), senha);
  } catch (erro) {
    if (erro instanceof cripto.SenhaIncorretaOuAdulterado) {
      errouASenha(nome);
      return { ok: false, motivo: 'senha' };
    }
    return { ok: false, motivo: 'formato' };
  }

  const topicos = (aberto.objeto.topicos || []).map((t) => (t.tipo === 'credencial' ? `${t.titulo} — login: ${t.login} — senha: ${t.senha}` : String(t.texto ?? '')));
  const texto = notas.montar({ cabecalho: aberto.objeto.cabecalho || [], topicos, rodape: aberto.objeto.rodape || [] });
  await gravarPorInteiro(completo, texto);

  trancar(nome);
  return { ok: true };
}

// --- Abrir e trancar -----------------------------------------------------------------------

/** Abre um arquivo com a senha. Devolve { ok, itens } ou { ok: false, motivo: 'senha' | 'espere' | 'formato' | ... }. */
async function abrir(arquivo, senha) {
  const nome = await nomeReal(arquivo);
  if (!nome) return { ok: false, motivo: 'inexistente' };

  const espera = emEspera(nome);
  if (espera) return espera;

  const completo = notas.caminhoDe(nome);
  let texto;
  try {
    texto = await fs.readFile(completo, 'utf8');
  } catch (erro) {
    return { ok: false, motivo: 'inexistente' };
  }
  if (!cripto.ehPrivado(texto)) return { ok: false, motivo: 'nao-privado' };

  try {
    const { objeto, chave, kdf } = await cripto.decifrar(texto, senha);
    trancar(nome);
    const sessao = criarSessao(nome, objeto, chave, kdf);
    sessoes.set(chaveDe(nome), sessao);
    return { ok: true, itens: itensParaATela(sessao) };
  } catch (erro) {
    if (erro instanceof cripto.SenhaIncorretaOuAdulterado) {
      errouASenha(nome);
      return { ok: false, motivo: 'senha' };
    }
    return { ok: false, motivo: 'formato' };
  }
}

/** Esquece a chave e o conteudo de um arquivo. */
function trancar(arquivo) {
  const sessao = sessoes.get(chaveDe(arquivo));
  if (!sessao) return false;
  sessao.chave.fill(0);
  sessao.credenciais.clear();
  sessao.itens.length = 0;
  sessoes.delete(chaveDe(arquivo));
  return true;
}

/** Tranca tudo (minimizar, fechar a janela, recarregar, bloquear a sessao do Windows). Devolve quantos estavam abertos. */
function trancarTudo() {
  const abertos = [...sessoes.keys()];
  for (const arquivo of abertos) trancar(arquivo);
  return abertos.length;
}

/** O arquivo esta aberto agora? */
function estaAberto(arquivo) {
  return sessoes.has(chaveDe(arquivo));
}

// --- Conteudo ---------------------------------------------------------------------------------

/**
 * Regrava a lista inteira (apagar, reordenar, editar): `itens` na ordem da tela - os
 * mesmos { tipo: 'texto', texto } e { tipo: 'credencial', id } que a tela recebeu. Uma
 * credencial que nao esta mais na lista foi apagada; um id desconhecido e ignorado.
 */
async function salvar(arquivo, itens) {
  const sessao = sessaoDe(arquivo);
  if (!sessao) return { ok: false, motivo: 'trancado' };
  if (!Array.isArray(itens)) return { ok: false, motivo: 'entrada' };

  const novos = [];
  const manter = new Set();
  for (const item of itens) {
    if (item && item.tipo === 'texto' && typeof item.texto === 'string') {
      novos.push({ tipo: 'texto', texto: item.texto });
    } else if (item && item.tipo === 'credencial' && sessao.credenciais.has(item.id)) {
      novos.push({ tipo: 'credencial', id: item.id });
      manter.add(item.id);
    }
  }
  for (const id of [...sessao.credenciais.keys()]) if (!manter.has(id)) sessao.credenciais.delete(id);

  sessao.itens = novos;
  await gravarSessao(sessao);
  return { ok: true };
}

/** Acrescenta um topico de texto no fim (o Enter do campo de escrita). */
async function adicionarTexto(arquivo, texto) {
  const sessao = sessaoDe(arquivo);
  if (!sessao) return { ok: false, motivo: 'trancado' };
  if (typeof texto !== 'string' || texto.trim() === '') return { ok: false, motivo: 'entrada' };

  sessao.itens.push({ tipo: 'texto', texto: texto.trim() });
  await gravarSessao(sessao);
  return { ok: true, itens: itensParaATela(sessao) };
}

/** Acrescenta uma credencial no fim. Devolve o id para a tela apontar para ela. */
async function adicionarCredencial(arquivo, titulo, login, senha) {
  const sessao = sessaoDe(arquivo);
  if (!sessao) return { ok: false, motivo: 'trancado' };
  if (typeof titulo !== 'string' || titulo.trim() === '' || typeof login !== 'string' || typeof senha !== 'string') return { ok: false, motivo: 'entrada' };

  const id = crypto.randomUUID();
  sessao.credenciais.set(id, { titulo: titulo.trim(), login, senha });
  sessao.itens.push({ tipo: 'credencial', id });
  await gravarSessao(sessao);
  return { ok: true, id, itens: itensParaATela(sessao) };
}

// --- Credenciais: ver e copiar --------------------------------------------------------------------

/** A senha digitada e a do arquivo aberto? (deriva de novo e compara em tempo constante) */
async function conferirSenha(sessao, senha) {
  try {
    const chave = await cripto.derivarChave(senha, sessao.kdf.salt, sessao.kdf);
    const igual = cripto.mesmaChave(chave, sessao.chave);
    chave.fill(0);
    return igual;
  } catch (erro) {
    return false;
  }
}

/** O olhinho: pede a senha do arquivo DE NOVO e devolve o login e a senha da credencial. */
async function revelar(arquivo, id, senhaDoArquivo) {
  const sessao = sessaoDe(arquivo);
  if (!sessao) return { ok: false, motivo: 'trancado' };

  const espera = emEspera(sessao.arquivo);
  if (espera) return espera;

  if (!(await conferirSenha(sessao, senhaDoArquivo))) {
    errouASenha(sessao.arquivo);
    return { ok: false, motivo: 'senha' };
  }

  const credencial = sessao.credenciais.get(id);
  if (!credencial) return { ok: false, motivo: 'inexistente' };
  return { ok: true, login: credencial.login, senha: credencial.senha };
}

/** A senha que esta na area de transferencia por nossa causa, e o relogio que vai limpa-la. */
let copiado = null;

function limparPendente() {
  if (copiado && copiado.relogio) clearTimeout(copiado.relogio);
  copiado = null;
}

/** Limpa a area de transferencia se ainda estiver com o que copiamos. Devolve se limpou. */
async function limparSeAindaForNossa() {
  const pendente = copiado;
  if (!pendente) return false;
  copiado = null;
  if (pendente.relogio) clearTimeout(pendente.relogio);

  try {
    if ((await clipboard.readText()) === pendente.texto) {
      clipboard.clear();
      return true;
    }
  } catch (erro) { /* area de transferencia ocupada: a proxima copia do usuario a troca de qualquer jeito */ }
  return false;
}

/**
 * Copia o login ou a senha de uma credencial SEM a tela ver o valor, e agenda limpar a area de
 * transferencia depois de TEMPO_DE_LIMPEZA - so se ela ainda estiver com este valor.
 */
async function copiar(arquivo, id, campo) {
  const sessao = sessaoDe(arquivo);
  if (!sessao) return { ok: false, motivo: 'trancado' };
  if (campo !== 'login' && campo !== 'senha') return { ok: false, motivo: 'entrada' };

  const credencial = sessao.credenciais.get(id);
  if (!credencial) return { ok: false, motivo: 'inexistente' };

  const valor = credencial[campo];
  limparPendente();
  const escondido = areaSegura.escrever(valor);
  copiado = { texto: valor, relogio: setTimeout(() => { limparSeAindaForNossa(); }, tempoDeLimpeza) };
  if (copiado.relogio.unref) copiado.relogio.unref();
  return { ok: true, escondido, segundos: Math.round(tempoDeLimpeza / 1000) };
}

// A senha copiada nao fica na area de transferencia depois de o Blink fechar.
app.on('before-quit', () => {
  if (copiado) {
    const pendente = copiado;
    copiado = null;
    if (pendente.relogio) clearTimeout(pendente.relogio);
    try { clipboard.clear(); } catch (erro) { /* saindo */ }
  }
});

module.exports = {
  ativar,
  desativar,
  abrir,
  trancar,
  trancarTudo,
  estaAberto,
  salvar,
  adicionarTexto,
  adicionarCredencial,
  revelar,
  copiar,
  TAMANHO_MINIMO_DA_SENHA,
  // so para os testes: tempos injetaveis
  definirAtrasoAposErro: (ms) => { atrasoAposErro = ms; },
  definirTempoDeLimpeza: (ms) => { tempoDeLimpeza = ms; },
  esperarLimpeza: async () => { while (copiado) await new Promise((r) => setTimeout(r, 20)); },
};
