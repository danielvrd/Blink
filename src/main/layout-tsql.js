/**
 * Layout de procedures, triggers e funcoes do T-SQL.
 *
 * O sql-formatter formata bem um SELECT, um UPDATE, um INSERT, mas nao entende
 * BEGIN / END / IF / ELSE / WHILE: "CREATE PROCEDURE p @a INT AS BEGIN" fica
 * tudo numa linha, o corpo nao e indentado e "END ELSE BEGIN" idem. Este
 * arquivo pega a saida dele e arruma SO isso: onde quebrar a linha e quanto
 * indentar. Nao formata SQL - cada comando continua exatamente como a
 * biblioteca deixou, so deslocado para o nivel certo.
 *
 * O que garante que nada se perde e a TRAVA no fim: a lista de tokens da saida
 * (fora espacos e quebras) tem que ser identica a da entrada. Se o algoritmo
 * nao entender o texto - ou qualquer coisa nao bater - devolve null e o
 * chamador usa a saida da biblioteca como sempre foi.
 *
 * So age quando ha um "marcador": CREATE/ALTER de PROC, FUNCTION ou TRIGGER,
 * um BEGIN de bloco, ou um IF/WHILE de comando. Sem marcador, nem olha.
 *
 * Puro: sem Electron e sem area de transferencia.
 */

const { tokenizar } = require('./lexer-sql');

/** Comecos de comando que nunca fazem parte de uma expressao: fecham a condicao de um IF/WHILE. */
const INICIO_INEQUIVOCO = new Set([
  'PRINT', 'DECLARE', 'RETURN', 'BREAK', 'CONTINUE', 'THROW', 'RAISERROR', 'COMMIT', 'ROLLBACK', 'SAVE', 'GOTO', 'WAITFOR',
  'TRUNCATE', 'OPEN', 'CLOSE', 'DEALLOCATE', 'CREATE', 'ALTER', 'DROP', 'IF', 'WHILE', 'BEGIN',
]);

/** Comecos de comando que tambem aparecem no meio de um comando (INSERT ... SELECT, UPDATE ... SET). */
const INICIO_AMBIGUO = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'EXEC', 'EXECUTE', 'SET', 'WITH', 'FETCH', 'USE']);

/** Palavras sem as quais nao existe marcador: um teste barato antes de qualquer trabalho. */
const PALAVRA_CANDIDATA = /(?:^|[^A-Za-z0-9_])(?:BEGIN|IF|WHILE|PROC|PROCEDURE|FUNCTION|TRIGGER)(?![A-Za-z0-9_])/i;

/** Depois de BEGIN, estas palavras dizem que NAO e um bloco. */
const BEGIN_NAO_BLOCO = new Set(['TRAN', 'TRANSACTION', 'DISTRIBUTED', 'DIALOG', 'CONVERSATION']);

/** "SET" seguido de uma destas palavras e uma opcao de sessao: sai numa linha so ("SET NOCOUNT ON;"). */
const OPCOES_SET = new Set([
  'NOCOUNT', 'XACT_ABORT', 'ARITHABORT', 'ARITHIGNORE', 'QUOTED_IDENTIFIER', 'TRANSACTION', 'DATEFORMAT', 'DATEFIRST', 'LANGUAGE',
  'IDENTITY_INSERT', 'ROWCOUNT', 'LOCK_TIMEOUT', 'DEADLOCK_PRIORITY', 'STATISTICS', 'IMPLICIT_TRANSACTIONS', 'CONCAT_NULL_YIELDS_NULL',
  'NUMERIC_ROUNDABORT', 'FMTONLY', 'NOEXEC', 'PARSEONLY', 'TEXTSIZE', 'ANSI_NULLS', 'ANSI_WARNINGS', 'ANSI_PADDING', 'ANSI_NULL_DFLT_ON',
  'ANSI_DEFAULTS', 'CURSOR_CLOSE_ON_COMMIT',
]);

/** Parece um comando tudo o que cabe numa expressao? Um "(" logo depois de UPDATE e a funcao UPDATE(coluna) de trigger. */
const abre = (t) => t && t.t === 'sim' && t.s === '(';

class Desistir extends Error {}
/** O motivo da ultima desistencia (so para diagnostico e testes). */
let ultimoMotivo = "";
const desistir = (motivo) => {
  const e = new Desistir(motivo || '?');
  // Quem chamou desistir(): a linha do arquivo que decidiu desistir.
  e.stack = new Error().stack.split('\n').slice(2, 3).join('');
  throw e;
};

/** Agrupa os tokens (sem espacos e quebras) em linhas da entrada, guardando a indentacao e se havia linha em branco antes. */
function agrupar(tokens) {
  const linhas = [];
  let atual = { ind: '', toks: [], branco: false };
  let quebrasSeguidas = 0;
  let inicioDeLinha = true;

  const fechar = () => {
    if (atual.toks.length > 0) {
      linhas.push(atual);
      atual = { ind: '', toks: [], branco: false };
    }
  };

  for (const tok of tokens) {
    if (tok.t === 'nl') {
      fechar();
      quebrasSeguidas += 1;
      inicioDeLinha = true;
      continue;
    }
    if (tok.t === 'esp') {
      if (inicioDeLinha) atual.ind = tok.s;
      continue;
    }
    if (inicioDeLinha && atual.toks.length === 0) {
      atual.branco = quebrasSeguidas >= 2 && linhas.length > 0;
      quebrasSeguidas = 0;
    }
    inicioDeLinha = false;
    tok.u = tok.t === 'pal' ? tok.s.toUpperCase() : null;
    tok.ln = linhas.length;
    tok.ini = atual.toks.length === 0;
    tok.ind = atual.ind;
    tok.branco = atual.branco;
    atual.toks.push(tok);
  }
  fechar();
  return linhas;
}

/** Tem algo que este arquivo sabe arrumar? (CREATE/ALTER de PROC..., BEGIN de bloco, IF/WHILE de comando) */
function temMarcador(sig) {
  for (let k = 0; k < sig.length; k++) {
    const u = sig[k].u;
    if (!u) continue;
    const prox = sig[k + 1];
    if ((u === 'CREATE' || u === 'ALTER') && prox && prox.u) {
      let m = prox;
      if (m.u === 'OR' && sig[k + 2] && sig[k + 2].u === 'ALTER') m = sig[k + 3];
      if (m && ['PROC', 'PROCEDURE', 'FUNCTION', 'TRIGGER'].includes(m.u)) return true;
    }
    if (u === 'BEGIN' && !(prox && prox.u && BEGIN_NAO_BLOCO.has(prox.u))) return true;
    if (u === 'WHILE') return true;
    if (u === 'IF') {
      const ant = sig[k - 1];
      // "DROP TABLE IF EXISTS" e "CREATE TABLE IF NOT EXISTS" nao sao IF de comando.
      const ehClausula = ant && ant.u && ['EXISTS', 'TABLE', 'VIEW', 'INDEX', 'PROCEDURE', 'PROC', 'FUNCTION', 'TRIGGER', 'DATABASE', 'SCHEMA', 'TYPE', 'SEQUENCE'].includes(ant.u);
      if (!ehClausula) return true;
    }
  }
  return false;
}

/**
 * O trabalho todo: percorre os tokens da saida do sql-formatter e devolve as
 * linhas novas. Lanca Desistir se nao entender.
 */
function processar(linhas) {
  const T = [];
  for (const l of linhas) for (const tok of l.toks) T.push(tok);
  const N = T.length;

  const pilha = [];
  let paren = 0;
  let emComando = true;
  const saida = [];
  let peca = null;

  const ehBloco = (f) => f.k === 'BLOCO' || f.k === 'TRY' || f.k === 'CATCH';
  const nivel = () => {
    let n = 0;
    for (const f of pilha) n += ehBloco(f) ? 1 : f.extra || 0;
    return n;
  };
  const topo = () => pilha[pilha.length - 1];
  /** So a primeira palavra da linha herda a indentacao dela; as de dentro ("1 END") comecam em zero. */
  const indDe = (tok) => (tok.ini ? tok.ind : "");

  /** Uma peca vira uma linha da saida. tipo serve as regras de linha em branco. */
  const novaPeca = (tipo, ind, tok) => {
    peca = { nivel: nivel(), ind: ind || '', toks: [], tipo, branco: Boolean(tok && tok.ini && tok.branco), fechada: false };
    saida.push(peca);
    return peca;
  };
  const adicionar = (tok) => peca.toks.push(tok);
  /** A proxima peca comeca em outra linha mesmo que a entrada continue na mesma. */
  const fechar = () => {
    if (peca) peca.fechada = true;
  };

  // --- ciclo de vida das estruturas de controle (IF / WHILE / ELSE) -----------------------
  /** O comando que era o corpo da estrutura de controle do topo terminou. */
  const comandoCompleto = () => {
    for (;;) {
      const f = topo();
      if (!f || ehBloco(f) || f.k === 'CASE') return;
      if (f.fase !== 'corpo') return;
      if (f.k === 'IF') {
        f.fase = 'espera';
        f.extra = 0;
        return;
      }
      pilha.pop(); // WHILE ou ELSE: acabou; pode ter acabado o corpo de quem esta por fora
    }
  };
  /** Um IF esperava um ELSE que nao veio: acabou. */
  const dispensarEspera = () => {
    while (topo() && topo().k === 'IF' && topo().fase === 'espera') {
      pilha.pop();
      comandoCompleto();
    }
  };
  /** O ELSE de "ELSE IF" fecha junto com o IF de dentro. */

  /** Chega um token de comeco de comando: fecha o que estiver esperando. */
  const novoComando = () => {
    // Um corpo simples que ainda estava aberto termina aqui.
    for (;;) {
      const f = topo();
      if (f && !ehBloco(f) && f.k !== 'CASE' && f.fase === 'corpo' && f.extra === 1 && f.iniciado) comandoCompleto();
      else break;
    }
    dispensarEspera();
  };

  const abrirCorpoSimples = (f) => {
    f.extra = 1;
    f.fase = 'corpo';
    f.iniciado = true;
  };

  // --- cabecalho de PROC / FUNCTION / TRIGGER -------------------------------------------------
  /** Le o cabecalho a partir de j (o CREATE/ALTER) e devolve o indice logo depois do AS. */
  const cabecalho = (j) => {
    let k = j;
    const tipoObj = () => {
      let m = k + 1;
      if (T[m].u === 'OR' && T[m + 1] && T[m + 1].u === 'ALTER') m += 2;
      return { obj: T[m].u, fimDoTipo: m };
    };
    const { obj, fimDoTipo } = tipoObj();
    k = fimDoTipo + 1;

    // Acha o AS que abre o corpo: o primeiro, fora de parenteses.
    let depth = 0;
    let ja = -1;
    for (let m = k; m < N; m++) {
      const t = T[m];
      if (t.t === 'com1' || t.t === 'comN') desistir();
      if (t.t === 'sim' && t.s === '(') depth += 1;
      else if (t.t === 'sim' && t.s === ')') depth -= 1;
      else if (depth === 0 && t.u === 'AS') {
        ja = m;
        break;
      }
    }
    if (ja < 0) desistir();

    const emLinha = (ini, fim) => T.slice(ini, fim);
    const pecaDeCabecalho = (tipo, toks, extraNivel, primeiroTok) => {
      const p = novaPeca(tipo, '', primeiroTok);
      p.nivel += extraNivel;
      for (const t of toks) p.toks.push(t);
      p.fechada = true;
    };

    // Divide as fatias de tokens em depth 0 pelas virgulas.
    const dividirPorVirgula = (toks) => {
      const partes = [];
      let atual = [];
      let d = 0;
      for (const t of toks) {
        if (t.t === 'sim' && t.s === '(') d += 1;
        if (t.t === 'sim' && t.s === ')') d -= 1;
        if (d === 0 && t.t === 'sim' && t.s === ',') {
          partes.push(atual);
          atual = [];
        } else atual.push(t);
      }
      partes.push(atual);
      return partes;
    };

    const corpoCabecalho = T.slice(k, ja);
    // Nome: ate o primeiro "(", parametro (@), ou palavra de clausula.
    let fimNome = 0;
    while (fimNome < corpoCabecalho.length) {
      const t = corpoCabecalho[fimNome];
      if ((t.t === 'sim' && t.s === '(') || (t.t === 'pal' && t.s[0] === '@') || (t.u && ['RETURNS', 'ON', 'WITH', 'FOR', 'AFTER', 'INSTEAD'].includes(t.u))) break;
      fimNome += 1;
    }
    const inicioLinha = emLinha(j, k).concat(corpoCabecalho.slice(0, fimNome));
    const resto = corpoCabecalho.slice(fimNome);
    const primeiro = T[j];

    if (obj === 'TRIGGER') {
      // Tudo ate o AS numa linha so.
      pecaDeCabecalho('header', emLinha(j, ja), 0, primeiro);
    } else {
      // Separa os parametros: entre parenteses (funcao) ou soltos (procedure).
      let parametros = [];
      let depois = [];
      let entreParenteses = false;
      if (resto.length > 0 && resto[0].t === 'sim' && resto[0].s === '(') {
        let d = 0;
        let fechaEm = -1;
        for (let m = 0; m < resto.length; m++) {
          if (resto[m].t === 'sim' && resto[m].s === '(') d += 1;
          if (resto[m].t === 'sim' && resto[m].s === ')') {
            d -= 1;
            if (d === 0) {
              fechaEm = m;
              break;
            }
          }
        }
        if (fechaEm < 0) desistir();
        parametros = resto.slice(1, fechaEm);
        depois = resto.slice(fechaEm + 1);
        entreParenteses = true;
      } else {
        let fim = 0;
        while (fim < resto.length && !(resto[fim].u && ['WITH', 'FOR', 'RETURNS'].includes(resto[fim].u))) fim += 1;
        parametros = resto.slice(0, fim);
        depois = resto.slice(fim);
      }

      const lista = parametros.length > 0 ? dividirPorVirgula(parametros) : [];
      if (entreParenteses) {
        if (lista.length >= 2) {
          pecaDeCabecalho('header', inicioLinha.concat([resto[0]]), 0, primeiro);
          lista.forEach((param, idx) => {
            const p = novaPeca('param', '', null);
            p.nivel += 1;
            for (const t of param) p.toks.push(t);
            p.virgula = idx < lista.length - 1;
            p.fechada = true;
          });
          pecaDeCabecalho('header', [resto[parametros.length + 1]], 0, null);
        } else {
          pecaDeCabecalho('header', inicioLinha.concat([resto[0]], parametros, [resto[parametros.length + 1]]), 0, primeiro);
        }
      } else {
        pecaDeCabecalho('header', inicioLinha, 0, primeiro);
        lista.forEach((param, idx) => {
          const p = novaPeca('param', '', null);
          p.nivel += 1;
          for (const t of param) p.toks.push(t);
          p.virgula = idx < lista.length - 1;
          p.fechada = true;
        });
      }

      // RETURNS, WITH e FOR ... cada um em sua linha.
      let atual = [];
      const soltar = () => {
        if (atual.length > 0) pecaDeCabecalho('header', atual, 0, null);
        atual = [];
      };
      for (const t of depois) {
        if (t.u && ['RETURNS', 'WITH', 'FOR'].includes(t.u) && atual.length > 0 && !(atual[0].u === 'FOR' && t.u === 'WITH')) soltar();
        atual.push(t);
      }
      soltar();
    }

    pecaDeCabecalho('as', [T[ja]], 0, null);
    emComando = true;
    return ja + 1;
  };

  // --- laco principal ----------------------------------------------------------------------------
  let j = 0;
  while (j < N) {
    const tok = T[j];
    const ant = T[j - 1];
    const prox = T[j + 1];
    const u = tok.u;
    const ehComentario = tok.t === 'com1' || tok.t === 'comN';

    // Comentario: fica onde estava. Sozinho na linha, e uma peca propria no nivel de dentro.
    if (ehComentario) {
      if (tok.ini || !peca) {
        novaPeca('comentario', indDe(tok), tok);
      }
      adicionar(tok);
      if (tok.t === 'com1') fechar();
      j += 1;
      continue;
    }

    // --- o que esta esperando um ELSE / o fim de um corpo simples ---------------------------
    const topoEspera = topo() && topo().k === 'IF' && topo().fase === 'espera';
    if (topoEspera && u !== 'ELSE') {
      if (!(tok.t === 'sim' && tok.s === ';')) {
        dispensarEspera();
        emComando = true;
      }
    }

    // --- CASE ... END (nao e bloco) ---------------------------------------------------------
    if (u === 'CASE') {
      pilha.push({ k: 'CASE' });
      // segue como token comum
    } else if (u === 'END' && topo() && topo().k === 'CASE') {
      pilha.pop();
      if (!peca) desistir();
      if (tok.ini) novaPeca('normal', indDe(tok), tok);
      adicionar(tok);
      j += 1;
      continue;
    }

    // --- cabecalho ---------------------------------------------------------------------------------
    if (emComando && (u === 'CREATE' || u === 'ALTER') && pilha.length === 0 && paren === 0 && prox) {
      let m = prox;
      if (m.u === 'OR' && T[j + 2] && T[j + 2].u === 'ALTER') m = T[j + 3];
      if (m && ['PROC', 'PROCEDURE', 'FUNCTION', 'TRIGGER'].includes(m.u)) {
        novoComando();
        j = cabecalho(j);
        continue;
      }
    }

    // --- GO ---------------------------------------------------------------------------------------------
    if (u === 'GO' && tok.ini && paren === 0) {
      if (pilha.length > 0) desistir();
      novaPeca('go', indDe(tok), tok);
      adicionar(tok);
      fechar();
      emComando = true;
      j += 1;
      continue;
    }

    // --- BEGIN ... --------------------------------------------------------------------------------------
    if (u === 'BEGIN' && !(prox && prox.u && BEGIN_NAO_BLOCO.has(prox.u)) && paren === 0) {
      const f = topo();
      const corpoDeControle = f && !ehBloco(f) && f.k !== 'CASE' && (f.fase === 'cond' || (f.k === 'ELSE' && !f.iniciado));
      if (!corpoDeControle) novoComando();
      if (corpoDeControle) {
        f.fase = 'corpo';
        f.iniciado = true;
        f.extra = 0;
      }
      const tipoBloco = prox && prox.u === 'TRY' ? 'TRY' : prox && prox.u === 'CATCH' ? 'CATCH' : 'BLOCO';
      const p = novaPeca(tipoBloco === 'CATCH' ? 'begincatch' : 'begin', indDe(tok), tok);
      adicionar(tok);
      if (tipoBloco !== 'BLOCO') {
        adicionar(prox);
        j += 1;
      }
      fechar();
      pilha.push({ k: tipoBloco });
      void p;
      emComando = true;
      j += 1;
      continue;
    }

    // --- END ...  ------------------------------------------------------------------------------------------
    if (u === 'END' && paren === 0) {
      // Corpos simples abertos terminam aqui.
      for (;;) {
        const f = topo();
        if (f && !ehBloco(f) && f.k !== 'CASE') {
          if (f.fase === 'cond') desistir();
          if (f.fase === 'espera') {
            pilha.pop();
            comandoCompleto();
          } else if (f.fase === 'corpo' && f.extra === 1) comandoCompleto();
          else break;
        } else break;
      }
      const f = topo();
      const esperado = prox && prox.u === 'TRY' ? 'TRY' : prox && prox.u === 'CATCH' ? 'CATCH' : 'BLOCO';
      if (!f || f.k !== esperado) desistir();
      pilha.pop();
      novaPeca('end', indDe(tok), tok);
      adicionar(tok);
      if (esperado !== 'BLOCO') {
        adicionar(prox);
        j += 1;
      }
      fechar();
      // O bloco era o corpo de um IF/WHILE/ELSE? Esse comando terminou.
      comandoCompleto();
      emComando = true;
      j += 1;
      continue;
    }

    // --- ELSE -----------------------------------------------------------------------------------------------
    if (u === 'ELSE' && paren === 0 && !(topo() && topo().k === 'CASE')) {
      // Um corpo simples sem ";" termina no ELSE.
      for (;;) {
        const f = topo();
        if (f && !ehBloco(f) && f.k !== 'CASE' && f.fase === 'corpo' && f.extra === 1) comandoCompleto();
        else break;
      }
      const f = topo();
      if (!f || f.k !== 'IF' || f.fase !== 'espera') desistir();
      pilha.pop();
      const e = { k: 'ELSE', fase: 'corpo', extra: 0, p0: paren, iniciado: false, viaIf: false };
      novaPeca('else', indDe(tok), tok);
      adicionar(tok);
      // "ELSE IF" ficam juntos: o IF de dentro e o corpo do ELSE.
      if (prox && prox.u === 'IF') {
        e.iniciado = true;
        e.viaIf = true;
        pilha.push(e);
        adicionar(prox);
        pilha.push({ k: 'IF', fase: 'cond', extra: 0, p0: paren, iniciado: false });
        j += 2;
        emComando = false;
        continue;
      }
      pilha.push(e);
      fechar();
      emComando = true;
      j += 1;
      continue;
    }

    // --- IF / WHILE em posicao de comando ---------------------------------------------------------------------
    if (emComando && (u === 'IF' || u === 'WHILE') && paren === 0) {
      // Um ELSE que estava esperando o corpo: o IF vira o corpo dele, na mesma linha do ELSE (tratado acima).
      const f = topo();
      const corpoDoElse = f && f.k === 'ELSE' && !f.iniciado;
      if (corpoDoElse) {
        f.iniciado = true;
        f.viaIf = true;
      } else {
        novoComando();
        // O IF pode ser o corpo simples de outro controle: comeca uma peca no nivel de dentro.
        const pai = topo();
        if (pai && !ehBloco(pai) && pai.k !== 'CASE' && pai.fase === 'cond') desistir();
      }
      const pai2 = topo();
      if (pai2 && !ehBloco(pai2) && pai2.k !== 'CASE' && pai2.fase === 'corpo' && !pai2.iniciado) abrirCorpoSimples(pai2);
      novaPeca('normal', indDe(tok), tok);
      adicionar(tok);
      pilha.push({ k: u, fase: 'cond', extra: 0, p0: paren, iniciado: false });
      emComando = false;
      j += 1;
      continue;
    }

    // --- fim da condicao de um IF / WHILE: comeca o corpo -----------------------------------------------------------
    const f = topo();
    if (f && !ehBloco(f) && f.k !== 'CASE' && f.fase === 'cond' && paren === f.p0 && tok !== T[0]) {
      const inicioInequivoco = u && INICIO_INEQUIVOCO.has(u) && u !== 'BEGIN';
      const inicioAmbiguo = u && INICIO_AMBIGUO.has(u) && !abre(prox) && ant && !(ant.t === 'sim' && ant.s === '(');
      if (inicioInequivoco || inicioAmbiguo) {
        abrirCorpoSimples(f);
        novaPeca('normal', '', tok);
        adicionar(tok);
        emComando = false;
        if (u === 'IF' || u === 'WHILE') {
          emComando = false;
          // um IF/WHILE como corpo simples: empilha o controle de dentro
          peca.toks = [];
          saida.pop();
          peca = saida[saida.length - 1];
          novaPeca('normal', '', tok);
          adicionar(tok);
          pilha.push({ k: u, fase: 'cond', extra: 0, p0: paren, iniciado: false });
        }
        j += 1;
        continue;
      }
    }

    // --- "SET" + opcao: numa linha so -----------------------------------------------------------------------------------
    // (tratado na hora de adicionar: veja mais abaixo)

    // --- comeco de uma linha da entrada / continuacao ---------------------------------------------------------------------
    let novaLinha = false;
    // O ";" colado num END ("END;") fica na mesma linha do END.
    const pontoEVirgulaDoEnd = tok.t === 'sim' && tok.s === ';' && !tok.ini && peca && peca.tipo === 'end';
    if (!peca || (peca.fechada && !pontoEVirgulaDoEnd)) novaLinha = true;
    else if (tok.ini) {
      const emCondicao = f && !ehBloco(f) && f.k !== 'CASE' && f.fase === 'cond' && paren === f.p0 && !(tok.t === 'sim' && tok.s === ')');
      const setDeOpcao = ant && ant.u === 'SET' && u && OPCOES_SET.has(u) && ant.ln === tok.ln - 1 && peca.toks.length === 1;
      if (emCondicao) {
        // A condicao de IF/WHILE fora de parenteses vai numa linha so.
        if (peca.toks.some((t) => t.t === 'com1')) desistir();
        peca.junta = true;
      } else if (setDeOpcao) {
        peca.junta = true;
      } else novaLinha = true;
    }

    if (novaLinha) {
      // Um comando novo comeca (o que estava aberto termina), exceto dentro de parenteses.
      if (emComando && paren === 0) novoComando();
      const pai = topo();
      if (pai && !ehBloco(pai) && pai.k !== 'CASE' && pai.fase === 'corpo' && !pai.iniciado) abrirCorpoSimples(pai);
      novaPeca('normal', indDe(tok), tok);
    } else if (peca && tok.ini && !novaLinha && peca.junta) {
      peca.juntadas = (peca.juntadas || 0) + 1;
      tok.juntar = true;
    }
    adicionar(tok);

    // "SET" no comeco do comando
    if (tok.t === 'sim') {
      if (tok.s === '(') paren += 1;
      else if (tok.s === ')') paren -= 1;
      else if (tok.s === ';' && paren === 0) {
        comandoCompleto();
        fechar();
        emComando = true;
        j += 1;
        continue;
      }
    }
    emComando = false;
    j += 1;
  }

  // O que sobrou aberto: so corpo simples ou espera de ELSE pode ficar.
  for (;;) {
    const f = topo();
    if (!f) break;
    if (ehBloco(f) || f.k === 'CASE') desistir();
    if (f.fase === 'cond' || (f.fase === 'corpo' && !f.iniciado)) desistir();
    pilha.pop();
  }
  if (paren !== 0) desistir();

  return saida;
}

/** Texto de uma peca: os tokens com o espacamento que a entrada tinha; linhas juntadas ganham um espaco so. */
function textoDaPeca(peca) {
  let s = '';
  let ant = null;
  for (const tok of peca.toks) {
    if (ant) {
      if (ant.ln === tok.ln) s += tok.esp;
      else s += ' ';
    }
    s += tok.s;
    ant = tok;
  }
  return s;
}

/** Junta as pecas em texto, aplicando as regras de linha em branco. */
function montar(saida, unidade, f) {
  // Espacamento original entre tokens da mesma linha.
  for (const peca of saida) {
    for (let k = 0; k < peca.toks.length; k++) {
      const tok = peca.toks[k];
      const antT = peca.toks[k - 1];
      tok.esp = antT && antT.ln === tok.ln ? f.slice(antT.i + antT.s.length, tok.i) : ' ';
    }
  }

  const linhas = [];
  for (let k = 0; k < saida.length; k++) {
    const peca = saida[k];
    const anterior = saida[k - 1];
    const atual = peca.tipo;
    const antTipo = anterior && anterior.tipo;

    let branco = peca.branco;
    if (atual === 'end' || atual === 'else' || atual === 'begincatch') branco = false;
    if (antTipo === 'begin' || antTipo === 'begincatch' || antTipo === 'else' || antTipo === 'as' || antTipo === 'header' || antTipo === 'param') branco = false;
    if (anterior && antTipo === 'end' && atual !== 'end' && atual !== 'else' && atual !== 'begincatch' && atual !== 'go' && atual !== 'comentario') branco = true;
    if (atual === 'go' || antTipo === 'go') branco = false;
    if (k > 0 && branco) linhas.push('');

    let texto = textoDaPeca(peca);
    if (peca.tipo === 'param' && peca.virgula) texto += ',';
    linhas.push((unidade.repeat(peca.nivel) + peca.ind + texto).replace(/[ \t]+$/, ''));
  }
  return linhas.join('\n');
}

/** Separadores da assinatura: caracteres de controle que nunca aparecem num token. */
const SEPARA_CAMPO = String.fromCharCode(1);
const SEPARA_TOKEN = String.fromCharCode(2);

/** A sequencia de tokens (fora espacos e quebras) de um texto, ou null. */
function assinatura(texto) {
  const tokens = tokenizar(texto);
  if (!tokens) return null;
  return tokens.filter((t) => t.t !== 'esp' && t.t !== 'nl').map((t) => t.t + SEPARA_CAMPO + t.s).join(SEPARA_TOKEN);
}

/**
 * Arruma o layout da saida do sql-formatter. Devolve o texto novo, ou null se
 * nao ha o que arrumar, se o algoritmo nao entendeu ou se a trava reprovou.
 */
function aplicar(f, unidade) {
  ultimoMotivo = "";
  // Atalho: sem nenhuma destas palavras nao ha marcador possivel (e nem vale tokenizar o texto).
  if (!PALAVRA_CANDIDATA.test(f)) return null;
  try {
    const tokens = tokenizar(f);
    if (!tokens) return null;
    const linhas = agrupar(tokens);
    const sig = [];
    for (const l of linhas) for (const t of l.toks) sig.push(t);
    if (!temMarcador(sig)) return null;

    const saida = processar(linhas);
    const texto = montar(saida, unidade, f);

    // A TRAVA: os mesmos tokens, na mesma ordem.
    const antes = assinatura(f);
    const depois = assinatura(texto);
    if (antes === null || depois === null || antes !== depois) return null;
    if (texto.replace(/\s+/g, '') !== f.replace(/\s+/g, '')) return null;
    return texto;
  } catch (erro) {
    ultimoMotivo = erro instanceof Desistir ? erro.message + " @ " + erro.stack : "EXCECAO " + erro.message;
    return null;
  }
}

module.exports = { aplicar, motivoDaUltimaDesistencia: () => ultimoMotivo };
