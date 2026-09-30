/**
 * Motor de XML para textos grandes.
 *
 * O xml-formatter (por dentro, o xml-parser-xo) e quadratico: a cada atributo
 * ele procura "?>" e "/>" no RESTO do documento, entao o tempo cresce com o
 * quadrado do tamanho - 300 KB levam 0,3 s, 1,2 MB levam 20 s, e o Blink
 * inteiro fica parado enquanto isso (o automatico da Area de Trabalho Remota
 * tambem, porque roda no mesmo processo).
 *
 * Este motor reproduz, byte a byte, o que o xml-formatter devolve com as
 * opcoes do Blink (collapseContent, strictMode, lineSeparator '\n'), em uma
 * passada so. Ele so e usado acima de LIMITE_CAPACIDADE; ate la o caminho e o
 * da biblioteca, como sempre foi.
 *
 * Contrato de motor(xml, indentacao):
 *   string  - o XML formatado, identico ao da biblioteca;
 *   false   - o XML e invalido com CERTEZA (cortado, tag trocada, texto solto);
 *   null    - "nao sei": o documento tem algo que este motor nao reproduz com
 *             garantia (DOCTYPE, instrucao de processamento, atributo estranho,
 *             raiz dupla...). O chamador cai no caminho da biblioteca.
 *
 * Na duvida, null. O teste .verif/teste-motor-xml.js compara o motor com a
 * biblioteca em dezenas de milhares de documentos gerados: string tem que ser
 * identica, false tem que ser recusado pela biblioteca.
 */

const NL = '\n';
const CR = '\r';
const TAB = '\t';

/** A partir deste tamanho (em caracteres) o Blink usa o motor. */
const LIMITE_CAPACIDADE = 200 * 1024;

// Nomes como a biblioteca aceita: letras ASCII e da faixa latina (U+00C0 a
// U+024F), "_", e depois digitos, ".", ":", "-" e o ponto medio (U+00B7).
// Montado com fromCharCode para nao depender de como o arquivo e gravado.
const LATINO = String.fromCharCode(0xc0) + '-' + String.fromCharCode(0x24f);
const NOME = new RegExp('[A-Za-z_' + LATINO + '][A-Za-z0-9_.:' + String.fromCharCode(0xb7) + LATINO + '-]*', 'y');
const INICIO_NOME = new RegExp('[A-Za-z_' + LATINO + ']');

const NAO_SEI = null;
const INVALIDO = false;
const PROFUNDIDADE_MAXIMA = 256;

/** Espaco que a biblioteca trata como espaco dentro de uma tag. */
const branco = (c) => c === ' ' || c === NL || c === CR || c === TAB;

/**
 * Le o texto e monta a arvore. Devolve { decl, filhos }, NAO_SEI ou INVALIDO.
 * Recebe o texto ja sem espacos nas pontas.
 */
function analisar(s) {
  const n = s.length;
  let i = 0;
  let decl = null;

  // Declaracao <?xml ...?>. Qualquer outra instrucao de processamento no
  // comeco (<?xml-stylesheet ...?>) nao e reproduzida.
  if (s.startsWith('<?')) {
    const m = /^<\?([\w\-:.]+)\s*/.exec(s.slice(0, 200));
    if (!m || m[1] !== 'xml') return NAO_SEI;
    const fim = s.indexOf('?>', m[0].length);
    if (fim < 0) return INVALIDO;
    decl = s.slice(m[0].length, fim).trim();
    i = fim + 2;
  }

  const raiz = [];
  let temRaiz = false;
  const pilha = [];
  let filhos = raiz;

  const lerNome = (p) => {
    NOME.lastIndex = p;
    const m = NOME.exec(s);
    return m ? m[0] : null;
  };

  // Le uma tag a partir de i (que aponta para o "<"). Abre o elemento (e o
  // poe na pilha) ou o registra como autofechado.
  function tag() {
    const nome = lerNome(i + 1);
    let j = i + 1 + nome.length;
    let atributos = '';
    const vistos = new Set();

    for (;;) {
      while (j < n && branco(s[j])) j++;
      if (j >= n) return INVALIDO;
      const c = s[j];

      if (c === '>') {
        const el = { t: 1, nome, atributos, filhos: [] };
        filhos.push(el);
        pilha.push(el);
        filhos = el.filhos;
        i = j + 1;
        return pilha.length > PROFUNDIDADE_MAXIMA ? NAO_SEI : true;
      }
      if (c === '/') {
        if (j + 1 >= n) return INVALIDO;
        if (s[j + 1] !== '>') return NAO_SEI;
        filhos.push({ t: 1, nome, atributos, filhos: null });
        i = j + 2;
        return true;
      }

      const attr = lerNome(j);
      if (!attr) return NAO_SEI;
      j += attr.length;
      while (j < n && branco(s[j])) j++;
      if (j >= n) return INVALIDO;
      if (s[j] !== '=') return NAO_SEI;
      j++;
      while (j < n && branco(s[j])) j++;
      if (j >= n) return INVALIDO;

      const aspa = s[j];
      if (aspa !== '"' && aspa !== "'") return NAO_SEI;
      const fimAspa = s.indexOf(aspa, j + 1);
      if (fimAspa < 0) return /[<>]/.test(s.slice(j + 1)) ? NAO_SEI : INVALIDO;
      if (attr === '__proto__' || attr === 'xml:space' || vistos.has(attr)) return NAO_SEI;
      vistos.add(attr);

      // Aspa simples vira dupla; uma aspa dupla que estava la dentro vira &quot;.
      const valor = s.slice(j + 1, fimAspa);
      atributos += ' ' + attr + '="' + (aspa === "'" ? valor.split('"').join('&quot;') : valor) + '"';
      j = fimAspa + 1;
    }
  }

  for (;;) {
    if (pilha.length === 0) {
      // Nivel da raiz: so comentarios e UM elemento; nada de texto.
      while (i < n && branco(s[i])) i++;
      if (i >= n) break;

      if (s.startsWith('<!--', i)) {
        const fim = s.indexOf('-->', i + 4);
        if (fim < 0) return INVALIDO;
        raiz.push({ t: 8, c: s.slice(i, fim + 3) });
        i = fim + 3;
        continue;
      }
      if (s[i] === '<' && INICIO_NOME.test(s[i + 1] || '')) {
        if (temRaiz) return NAO_SEI;
        temRaiz = true;
        const r = tag();
        if (r !== true) return r;
        continue;
      }
      if (s[i] === '<' || /\s/.test(s[i])) return NAO_SEI;
      return INVALIDO;
    }

    const lt = s.indexOf('<', i);
    if (lt < 0) return INVALIDO;
    if (lt > i) filhos.push({ t: 3, c: s.slice(i, lt) });
    i = lt;

    if (s[i + 1] === '/') {
      const fecha = '</' + pilha[pilha.length - 1].nome + '>';
      if (!s.startsWith(fecha, i)) return INVALIDO;
      pilha.pop();
      filhos = pilha.length ? pilha[pilha.length - 1].filhos : raiz;
      i += fecha.length;
      continue;
    }
    if (s.startsWith('<!--', i)) {
      const fim = s.indexOf('-->', i + 4);
      if (fim < 0) return INVALIDO;
      filhos.push({ t: 8, c: s.slice(i, fim + 3) });
      i = fim + 3;
      continue;
    }
    if (s.startsWith('<![CDATA[', i)) {
      const fim = s.indexOf(']]>', i + 9);
      if (fim < 0) return INVALIDO;
      filhos.push({ t: 4, c: s.slice(i, fim + 3) });
      i = fim + 3;
      continue;
    }
    // Texto que acaba no meio de "<![CDATA[" ou "<!--": cortado.
    if (n - i < 9 && ('<![CDATA['.startsWith(s.slice(i)) || '<!--'.startsWith(s.slice(i)))) return INVALIDO;
    if (INICIO_NOME.test(s[i + 1] || '')) {
      const r = tag();
      if (r !== true) return r;
      continue;
    }
    return NAO_SEI;
  }

  if (!temRaiz) return INVALIDO;
  return { decl, filhos: raiz };
}

/** Escreve a arvore com a indentacao pedida (mesma regra do collapseContent da biblioteca). */
function serializar(arvore, unidade) {
  let saida = '';
  let nivel = 0;
  const cache = [''];

  const quebra = () => {
    while (cache.length <= nivel) cache.push(cache[cache.length - 1] + unidade);
    saida += NL + cache[nivel];
  };

  // preservado = o conteudo do elemento pai e mantido como esta (colapsado).
  function emitir(no, preservado) {
    if (no.t === 1) {
      if (!preservado && saida.length > 0) quebra();
      saida += '<' + no.nome + no.atributos;
      if (no.filhos === null) {
        saida += '/>';
        return;
      }
      if (no.filhos.length === 0) {
        saida += '></' + no.nome + '>';
        return;
      }
      saida += '>';
      nivel++;

      let colar = preservado;
      if (!colar) {
        const fs = no.filhos;
        const q = fs.length;
        let temTexto = false;
        let textoComQuebra = false;
        let temOutro = false;
        for (let k = 0; k < q; k++) {
          const f = fs[k];
          if (f.t === 3) {
            if (f.c.includes(NL)) {
              textoComQuebra = true;
              f.c = f.c.trim();
            } else if ((k === 0 || k === q - 1) && f.c.trim().length === 0) {
              f.c = '';
            }
            if (f.c.trim().length > 0 || q === 1) temTexto = true;
          } else if (f.t === 4) {
            temTexto = true;
          } else {
            temOutro = true;
          }
        }
        if (temTexto && (!temOutro || !textoComQuebra)) colar = true;
      }

      for (const f of no.filhos) emitir(f, colar);
      nivel--;
      if (!colar) quebra();
      saida += '</' + no.nome + '>';
      return;
    }

    // texto, CDATA ou comentario
    let c = no.c;
    if (!preservado) c = c.trim();
    if (c.length > 0) {
      if (!preservado && saida.length > 0) quebra();
      saida += c;
    }
  }

  if (arvore.decl !== null) saida += '<?xml ' + arvore.decl + '?>';
  for (const f of arvore.filhos) emitir(f, false);
  return saida.split(CR + NL).join(NL);
}

/** Formata com o motor: string, false (invalido com certeza) ou null (nao sei). */
function motor(xml, unidade) {
  const arvore = analisar(xml.trim());
  if (arvore === NAO_SEI || arvore === INVALIDO) return arvore;
  return serializar(arvore, unidade);
}

module.exports = { motor, analisar, serializar, LIMITE_CAPACIDADE };
