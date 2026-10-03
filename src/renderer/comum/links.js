/**
 * Links clicaveis nas anotacoes do Fast Note.
 *
 *   partir(texto)         o texto em pedacos [{ texto, url }]: url e null no que nao e link
 *   urlEm(texto, indice)  a URL que contem a posicao `indice` do texto (ou null) - para o Ctrl+clique num campo
 *   ligarCtrlClique(campo) Ctrl+clique numa URL dentro de um <textarea> abre o link
 *   preencher(no, texto)  poe o texto num elemento, com um <span class="link"> em cada URL (clique abre)
 *   abrir(url)            pede ao processo principal para abrir no navegador
 *
 * Reconhece "http://...", "https://..." e "www....". Corta a pontuacao do fim ("veja https://a.com." nao leva o ponto)
 * e o parentese que fecha sem ter aberto ("(veja https://a.com)"). Tudo e montado por DOM (textContent), nunca por
 * innerHTML: um texto com "<script>" continua sendo so texto. Quem decide se abre e o processo principal (so http, https
 * e mailto - ver src/main/links.js).
 *
 * Carregue DEPOIS do ui.js.
 */

window.Blink = window.Blink || {};

(function () {
  // "www." so conta no comeco do texto ou depois de algo que nao e parte de uma palavra, um e-mail ou um dominio.
  const PADRAO = /(?:https?:\/\/|(?<![\w@.\/-])www\.)[^\s<>"'`]+/gi;

  /** Tira do fim da URL o que e pontuacao do texto em volta, nao da URL. */
  function aparar(url) {
    let fim = url.length;
    while (fim > 0) {
      const c = url[fim - 1];
      if ('.,;:!?\'"'.includes(c)) { fim--; continue; }
      // Fechamento sem abertura dentro da propria URL: pertence ao texto em volta.
      const par = { ')': '(', ']': '[', '}': '{', '>': '<' }[c];
      if (par) {
        const trecho = url.slice(0, fim);
        const abre = trecho.split(par).length - 1;
        const fecha = trecho.split(c).length - 1;
        if (fecha > abre) { fim--; continue; }
      }
      break;
    }
    return url.slice(0, fim);
  }

  /** O endereco de verdade de uma URL achada ("www.x.com" vira "https://www.x.com"). */
  const normalizar = (achado) => (/^www\./i.test(achado) ? `https://${achado}` : achado);

  /** Acha todas as URLs de um texto: [{ inicio, fim, achado, url }]. */
  function achar(texto) {
    const resultado = [];
    for (const m of String(texto).matchAll(PADRAO)) {
      const achado = aparar(m[0]);
      // "http://" sozinho ou "www." sozinho nao e link.
      if (!/^(?:https?:\/\/|www\.)[^\s]/i.test(achado)) continue;
      resultado.push({ inicio: m.index, fim: m.index + achado.length, achado, url: normalizar(achado) });
    }
    return resultado;
  }

  function partir(texto) {
    const t = String(texto);
    const partes = [];
    let cursor = 0;
    for (const { inicio, fim, achado, url } of achar(t)) {
      if (inicio > cursor) partes.push({ texto: t.slice(cursor, inicio), url: null });
      partes.push({ texto: achado, url });
      cursor = fim;
    }
    if (cursor < t.length) partes.push({ texto: t.slice(cursor), url: null });
    return partes;
  }

  function urlEm(texto, indice) {
    const achada = achar(texto).find((a) => indice >= a.inicio && indice <= a.fim);
    return achada ? achada.url : null;
  }

  function abrir(url) {
    return window.blink.link.abrir(url);
  }

  /** Poe `texto` em `no`, com um <span class="link"> em cada URL; clicar no link abre e NAO chega no clique do texto (que edita). */
  function preencher(no, texto) {
    no.replaceChildren();
    for (const { texto: pedaco, url } of partir(texto)) {
      if (!url) {
        no.appendChild(document.createTextNode(pedaco));
        continue;
      }
      const link = document.createElement('span');
      link.className = 'link';
      link.setAttribute('role', 'link');
      link.title = `${url} — clique para abrir`;
      link.textContent = pedaco;
      link.addEventListener('click', (evento) => {
        evento.stopPropagation();
        evento.preventDefault();
        abrir(url);
      });
      no.appendChild(link);
    }
  }

  /** Ctrl+clique numa URL dentro de um campo de texto abre o link (um clique simples so poe o cursor). */
  function ligarCtrlClique(campo) {
    campo.addEventListener('click', (evento) => {
      if (!(evento.ctrlKey || evento.metaKey)) return;
      const url = urlEm(campo.value, campo.selectionStart);
      if (!url) return;
      evento.preventDefault();
      abrir(url);
    });
  }

  window.Blink.links = { partir, achar, urlEm, preencher, ligarCtrlClique, abrir };
})();
