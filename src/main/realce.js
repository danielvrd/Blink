/**
 * Realce de sintaxe do Diff Checker.
 *
 * Roda no processo principal, como as outras bibliotecas: descobre a linguagem
 * do texto comparado (uma vez para a comparacao inteira), realca cada lado e
 * devolve, para cada linha, uma lista de pedacos `[classe, texto]` que a tela
 * junta com os pedacos "mudou" do comparador (veja diff.js, escrever()).
 *
 *   linha.tokensEsquerda = [['keyword', 'SELECT'], [null, ' a '], ['string', "'x'"]]
 *
 * `classe` e o escopo do highlight.js sem o prefixo "hljs-" ('keyword', 'title
 * function_', ...), ou null para texto sem cor. Os pedacos de uma linha, juntos,
 * sao exatamente a linha.
 *
 * Descobrir a linguagem: o `highlightAuto` sozinho nao serve. A relevancia dele
 * cresce com o numero de linhas e nao separa codigo de texto comum - um log de
 * 20 linhas pontuou mais que cinco linhas de JavaScript, e uma prosa saiu
 * "css". Entao a decisao e em duas etapas:
 *
 *   1. MARCADORES: cada linguagem tem expressoes que so aparecem nela ("const x
 *      =", "def f():", "SELECT ... FROM", uma tag fechada, um JSON valido).
 *      So as linguagens com algum marcador no texto viram candidatas. Sem
 *      candidata, o texto fica SEM COR - melhor sem cor que com cor aleatoria
 *      numa lista de nomes ou num log.
 *   2. DESEMPATE: com mais de uma candidata (JavaScript e TypeScript, Java e
 *      C#), o highlightAuto escolhe entre elas.
 *
 * Textos grandes (mais de 300 KB somando os dois lados) ficam sem realce: o
 * realce roda no processo principal e nao pode travar o app.
 *
 * Puro: sem Electron.
 */

const hljs = require('highlight.js/lib/core');

/** So estas linguagens: carregar todas as 190 do highlight.js custaria memoria e tempo de abertura. */
const LINGUAGENS = ['javascript', 'typescript', 'xml', 'css', 'scss', 'json', 'sql', 'python', 'java', 'csharp', 'php', 'bash', 'yaml', 'markdown'];
for (const nome of LINGUAGENS) hljs.registerLanguage(nome, require(`highlight.js/lib/languages/${nome}`));

/** Quanto texto olhar para decidir a linguagem, e o limite acima do qual nao se realca nada. */
const AMOSTRA_MAXIMA = 30000;
const TEXTO_MAXIMO = 300000;

/**
 * Os marcadores de cada linguagem. `forte`: um acerto basta. `fraco`: precisa
 * de `minimo` acertos (linhas) - sinais que, sozinhos, aparecem em texto comum.
 * Todas as expressoes sao testadas no texto inteiro, com ^ e $ por linha.
 */
const MARCADORES = {
  javascript: {
    forte: [
      /\b(?:const|let|var)\s+[\w$]+\s*=/,
      /\bfunction\s*[\w$]*\s*\(/,
      /\)\s*=>\s*[{(\w]/,
      /\bconsole\.\w+\(/,
      /\bimport\s+[\w${},*\s]+\s+from\s+['"]/,
      /\brequire\(\s*['"]/,
      /\bmodule\.exports\b/,
      /\bexport\s+(?:default|const|function|class)\b/,
    ],
  },
  typescript: {
    forte: [
      /\binterface\s+\w+\s*(?:<[^>]*>)?\s*\{/,
      /[\w)\]]\s*:\s*(?:string|number|boolean|void|any|unknown)\b\s*[,;)=\n{]/,
      /\btype\s+\w+\s*=\s*[\w{|'"]/,
      /\benum\s+\w+\s*\{/,
    ],
  },
  css: {
    forte: [/[^{}\n;]+\{\s*[\w-]+\s*:\s*[^;{}]+;/],
    // Uma declaracao solta "chave: valor;" so conta se aparecer 2 vezes ou vier dentro de um bloco.
    exigeDois: [/^\s*[\w-]+\s*:\s*[^;{}\n]+;\s*$/gm],
  },
  scss: {
    forte: [/^\s*\$[\w-]+\s*:\s*[^;]+;/m, /@mixin\s+[\w-]+/, /@include\s+[\w-]+/, /&:[\w-]+|&\.[\w-]+|&\s*\{/],
  },
  python: {
    forte: [
      /^\s*def\s+\w+\s*\(.*\)\s*(?:->\s*[^:]+)?:\s*$/m,
      /^\s*class\s+\w+\s*(?:\([^)]*\))?\s*:\s*$/m,
      /^\s*(?:import\s+[\w.]+|from\s+[\w.]+\s+import\s+\w+)/m,
      /^\s*elif\b.*:\s*$/m,
      /\bself\.\w+/,
      /^\s*print\(/m,
    ],
  },
  // Java e C# se parecem: so os marcadores EXCLUSIVOS de cada um entram aqui; "public class" e afins, que os dois
  // tem, ficam em COMPARTILHADOS (abaixo) e so contam quando nenhum dos dois tem um marcador exclusivo.
  java: {
    forte: [
      /\bpublic\s+static\s+void\s+main\s*\(\s*String\b/,
      /\bSystem\.out\.\w+\(/,
      /^\s*import\s+(?:static\s+)?java[x]?\./m,
      /@Override\b/,
    ],
  },
  csharp: {
    forte: [
      /^\s*using\s+System\b/m,
      /\bnamespace\s+[\w.]+\s*(?:\{|;)/,
      /\bConsole\.Write(?:Line)?\(/,
      /\bvar\s+\w+\s*=\s*new\b/,
    ],
  },
  php: {
    forte: [/<\?php\b/, /<\?=/],
    fraco: [/\$[A-Za-z_]\w*\s*=[^=]/, /\becho\s+[\$"']/, /->\w+\(/],
    minimo: 3,
  },
  bash: {
    forte: [/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:ba|z|da)?sh\b/m, /^\s*(?:fi|done|esac)\s*$/m, /^\s*for\s+\w+\s+in\s+.+;?\s*do\s*$/m, /\$\(\s*\w[^)]*\)/, /^\s*if\s+\[\[?\s.*\]\]?\s*;\s*then\b/m],
  },
  yaml: {
    forte: [/^---\s*$/m],
    // So linhas ANINHADAS contam: "Nome: Ana" / "De: joao@x.com" soltos, na margem, sao formulario e cabecalho de e-mail.
    fraco: [/^\s{2,}[\w.-]+:(?:\s+\S.*)?$/m, /^\s*-\s+[\w.-]+:\s+\S/m],
    minimo: 3,
  },
  markdown: {
    // Um titulo "# x" tambem e comentario de bash e de python: so conta junto de outro sinal de Markdown.
    forte: [],
    exigeJunto: { base: /^#{1,6}\s+\S/m, com: [/\*\*[^*\n]+\*\*/, /\[[^\]\n]+\]\([^)\n]+\)/, /^```/m, /^\s*[-*]\s+\S/m] },
  },
  sql: {
    forte: [
      // SELECT ... FROM em maiusculas, ou em qualquer caixa mas com "*" ou uma lista com virgula depois do
      // SELECT: "select the item from the menu" e prosa em ingles, nao SQL.
      /\bSELECT\b[\s\S]{0,3000}?\bFROM\b/,
      /\bselect\s+(?:\*|[\w.\[\]]+\s*,)[\s\S]{0,3000}?\bfrom\s+[\w.\[\]#@]+/i,
      /\bINSERT\s+INTO\s+[\w.\[\]#@"]+\s*(?:\(|VALUES\b|SELECT\b|DEFAULT\b)/i,
      /\bUPDATE\s+[\w.\[\]#@]+\s+SET\s+[\w.\[\]]+\s*=/i,
      /\bDELETE\s+FROM\s+[\w.\[\]#@]+\s*(?:WHERE\b|;|$)/im,
      /\bCREATE\s+(?:OR\s+ALTER\s+)?(?:TABLE|PROC(?:EDURE)?|VIEW|FUNCTION|INDEX|TRIGGER)\s+[\w.\[\]#@"]+\s*(?:\(|AS\b|@|ON\b)/i,
      /\bALTER\s+TABLE\s+[\w.\[\]#@"]+\s+(?:ADD|DROP|ALTER)\b/i,
      /\bDECLARE\s+@\w+/i,
      /\bWITH\s+\w+\s+AS\s*\(/i,
    ],
  },
};

/** Marcadores que mais de uma linguagem tem: so valem se nenhuma delas tem um marcador exclusivo. */
const COMPARTILHADOS = [
  {
    linguagens: ['java', 'csharp'],
    marcadores: [/\bpublic\s+(?:static\s+|final\s+|abstract\s+|async\s+|override\s+|virtual\s+)*(?:class|interface|enum|void|string|int|bool|Task)\b/],
  },
];

/** O texto, como um todo, e JSON valido (objeto ou lista)? */
function ehJson(texto) {
  const t = texto.trim();
  if (t[0] !== '{' && t[0] !== '[') return false;
  try {
    const valor = JSON.parse(t);
    return valor !== null && typeof valor === 'object';
  } catch (erro) {
    return false;
  }
}

/** Tem tags de XML ou de HTML (uma tag e uma fechada ou autofechada, ou o cabecalho)? */
function ehXml(texto) {
  if (!/<[A-Za-z!?][^<>]*>/.test(texto)) return false;
  return /<\?xml\b|<!DOCTYPE\b|<\/[A-Za-z][\w:.-]*\s*>|<[A-Za-z][^<>]*\/>/.test(texto);
}

/** Quantas linhas casam com a expressao (para os marcadores fracos). */
function contar(texto, expressao) {
  let total = 0;
  for (const linha of texto.split('\n')) if (expressao.test(linha)) total += 1;
  return total;
}

/** As linguagens que o texto da a entender, na ordem de LINGUAGENS. */
function candidatas(amostra) {
  const achadas = [];

  if (ehXml(amostra)) achadas.push('xml');

  for (const nome of LINGUAGENS) {
    const m = MARCADORES[nome];
    if (!m) continue;

    let vale = (m.forte || []).some((e) => e.test(amostra));

    // Declaracao solta "chave: valor;": so vale se aparecer pelo menos duas vezes.
    if (!vale && m.exigeDois) vale = m.exigeDois.some((e) => (amostra.match(e) || []).length >= 2);

    if (!vale && m.fraco && m.fraco.length > 0) {
      // Linha por linha: cada linha e testada sozinha, e conta uma vez so.
      let casadas = 0;
      for (const linha of amostra.split('\n')) if (m.fraco.some((e) => e.test(linha))) casadas += 1;
      vale = casadas >= (m.minimo || 3);
    }

    if (!vale && m.exigeJunto) vale = m.exigeJunto.base.test(amostra) && m.exigeJunto.com.some((e) => e.test(amostra));

    if (vale) achadas.push(nome);
  }

  for (const grupo of COMPARTILHADOS) {
    if (grupo.linguagens.some((nome) => achadas.includes(nome))) continue;
    if (grupo.marcadores.some((e) => e.test(amostra))) achadas.push(...grupo.linguagens);
  }

  // O que o markdown e o yaml aceitam de "fraco" nao vale contra uma linguagem de verdade.
  const fortes = achadas.filter((n) => n !== 'markdown' && n !== 'yaml');
  return fortes.length > 0 ? fortes : achadas;
}

/**
 * A linguagem dos dois textos, ou null (sem realce).
 * `esquerda` e `direita` sao o texto inteiro de cada lado.
 */
function detectar(esquerda, direita) {
  const amostra = `${esquerda}\n${direita}`.slice(0, AMOSTRA_MAXIMA);

  // JSON valido de um dos lados (a comparacao costuma ter um dos lados editado e invalido).
  if (ehJson(esquerda) || ehJson(direita)) return 'json';

  const lista = candidatas(amostra);
  if (lista.length === 0) return null;
  if (lista.length === 1) return lista[0];

  // JavaScript e TypeScript, Java e C#, CSS e SCSS...: o highlightAuto escolhe entre as plausiveis.
  const resultado = hljs.highlightAuto(amostra, lista);
  return resultado.language && lista.includes(resultado.language) ? resultado.language : lista[0];
}

const ENTIDADES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'" };
const decodificar = (texto) => texto.replace(/&(?:lt|gt|amp|quot|#x27);/g, (e) => ENTIDADES[e]);

/**
 * Realca um texto e devolve, para cada linha, os pedacos `[classe, texto]`.
 * null se algo nao bater (o numero de linhas ou o texto de uma linha mudou).
 */
function pedacosPorLinha(texto, linguagem) {
  let html;
  try {
    html = hljs.highlight(texto, { language: linguagem, ignoreIllegals: true }).value;
  } catch (erro) {
    return null;
  }

  const linhas = [[]];
  const pilha = [];

  const ESCOPO = /<span class="([^"]*)">|<\/span>|[^<]+/g;
  let parte;
  while ((parte = ESCOPO.exec(html)) !== null) {
    if (parte[0].startsWith('<span')) {
      pilha.push(parte[1].split(' ').map((c) => c.replace(/^hljs-/, '')).join(' '));
    } else if (parte[0] === '</span>') {
      pilha.pop();
    } else {
      // Texto: a cor e a do escopo de dentro (o ultimo da pilha). Quebra de linha abre a linha seguinte.
      const classe = pilha.length > 0 ? pilha[pilha.length - 1] : null;
      const pedacos = decodificar(parte[0]).split('\n');
      pedacos.forEach((pedaco, i) => {
        if (i > 0) linhas.push([]);
        if (pedaco === '') return;
        const atual = linhas[linhas.length - 1];
        const anterior = atual[atual.length - 1];
        if (anterior && anterior[0] === classe) anterior[1] += pedaco;
        else atual.push([classe, pedaco]);
      });
    }
  }

  // A conferencia: as linhas recompoem o texto exatamente.
  const originais = texto.split('\n');
  if (linhas.length !== originais.length) return null;
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].map((p) => p[1]).join('') !== originais[i]) return null;
  }
  return linhas;
}

/**
 * Anexa o realce as linhas do comparador: `tokensEsquerda` e `tokensDireita` em
 * cada linha que tem aquele lado. Devolve a linguagem usada, ou null se nada foi
 * anexado (texto sem cara de codigo, grande demais, ou falha do realce).
 */
function anexar(linhas, { linguagem: conhecida } = {}) {
  const doEsquerdo = linhas.filter((l) => l.esquerda !== null);
  const doDireito = linhas.filter((l) => l.direita !== null);
  const esquerda = doEsquerdo.map((l) => l.esquerda).join('\n');
  const direita = doDireito.map((l) => l.direita).join('\n');

  if (esquerda.length + direita.length > TEXTO_MAXIMO) return null;

  // Com a linguagem conhecida (a demonstracao do Diff) nao ha o que detectar.
  const linguagem = conhecida && LINGUAGENS.includes(conhecida) ? conhecida : detectar(esquerda, direita);
  if (!linguagem) return null;

  const pedacosEsquerda = pedacosPorLinha(esquerda, linguagem);
  const pedacosDireita = pedacosPorLinha(direita, linguagem);
  if (!pedacosEsquerda || !pedacosDireita) return null;

  doEsquerdo.forEach((linha, i) => { linha.tokensEsquerda = pedacosEsquerda[i]; });
  doDireito.forEach((linha, i) => { linha.tokensDireita = pedacosDireita[i]; });
  return linguagem;
}

module.exports = { anexar, detectar, pedacosPorLinha, LINGUAGENS };
