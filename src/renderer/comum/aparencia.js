/**
 * Fonte e tamanho do texto do Fast Note (topicos, edicao e rascunho) e do Diff
 * (as celulas), escolhidos nas abas da janela principal.
 *
 * O CSS das duas janelas usa duas variaveis, definidas aqui no <html>:
 *
 *   --fonte-conteudo     a pilha de fontes (a da lista abaixo)
 *   --tamanho-conteudo   o tamanho, em px
 *
 * Cada janela chama iniciar('note') ou iniciar('diff'): le a aparencia dela
 * (o processo principal ja devolve com os padroes onde faltar) e fica ouvindo o
 * "config:mudou", que chega quando uma aba grava um campo de aparencia - a
 * troca vale na hora, sem reabrir a janela. A janela principal so usa as listas
 * (FONTES, TAMANHOS) para montar os seletores das abas.
 *
 * Carregue DEPOIS do ui.js.
 */

window.Blink = window.Blink || {};

(function () {
  /**
   * As fontes oferecidas, com a pilha de CSS de cada uma. Os nomes (valor) sao os
   * do config.js (FONTES_VALIDAS) - o teste de aparencia confere que as duas
   * listas batem. Lista fixa: o Electron nao enumera as fontes instaladas.
   */
  const FONTES = [
    { valor: 'JetBrains Mono', pilha: '"JetBrains Mono", Consolas, monospace' },
    { valor: 'Cascadia Mono', pilha: '"Cascadia Mono", Consolas, monospace' },
    { valor: 'Consolas', pilha: 'Consolas, monospace' },
    { valor: 'Courier New', pilha: '"Courier New", monospace' },
    { valor: 'Lucida Console', pilha: '"Lucida Console", monospace' },
    { valor: 'Segoe UI', pilha: '"Segoe UI", system-ui, sans-serif' },
    { valor: 'Arial', pilha: 'Arial, sans-serif' },
    { valor: 'Calibri', pilha: 'Calibri, "Segoe UI", sans-serif' },
    { valor: 'Verdana', pilha: 'Verdana, sans-serif' },
    { valor: 'Tahoma', pilha: 'Tahoma, sans-serif' },
  ];

  /** 10 a 20 px. */
  const TAMANHOS = Array.from({ length: 11 }, (_, i) => 10 + i);

  /**
   * Os temas de cores do codigo no Diff (realce de sintaxe). Os valores sao os do
   * config.js (TEMAS_DIFF); as cores de cada um ficam em diff.css, na classe
   * "tema-<valor>" que vai no <html>. 'semcores' nao define nenhuma cor.
   */
  const TEMAS = [
    { valor: 'darkplus', rotulo: 'Dark+ (VS Code)' },
    { valor: 'monokai', rotulo: 'Monokai' },
    { valor: 'onedark', rotulo: 'One Dark' },
    { valor: 'dracula', rotulo: 'Dracula' },
    { valor: 'githubdark', rotulo: 'GitHub Dark' },
    { valor: 'semcores', rotulo: 'Sem cores' },
  ];

  const pilhaDe = (nome) => (FONTES.find((f) => f.valor === nome) || FONTES[0]).pilha;

  /** Quem quer saber quando a aparencia e aplicada (o Fast Note reajusta o campo de edicao aberto). */
  const ouvintes = [];

  /** Poe a fonte e o tamanho no <html>. */
  function aplicar({ fonte, tamanho }) {
    const raiz = document.documentElement;
    raiz.style.setProperty('--fonte-conteudo', pilhaDe(fonte));
    raiz.style.setProperty('--tamanho-conteudo', `${tamanho}px`);
    for (const ouvinte of ouvintes) ouvinte({ fonte, tamanho });
  }

  /** Poe a classe do tema no <html>, no lugar da que estava. */
  function aplicarTema(tema) {
    const raiz = document.documentElement;
    for (const classe of [...raiz.classList]) if (classe.startsWith('tema-')) raiz.classList.remove(classe);
    raiz.classList.add(`tema-${tema}`);
  }

  /**
   * Le a aparencia de uma janela ('note' ou 'diff') e a aplica; depois acompanha as
   * mudancas. O Diff tambem aplica o tema das cores do codigo.
   */
  async function iniciar(janela) {
    const aplicarTudo = async () => {
      const config = await window.blink.config.ler();
      aplicar(config.aparencia[janela]);
      if (janela === 'diff') aplicarTema(config.diffTema);
    };
    await aplicarTudo();

    window.blink.config.aoMudar(async ({ caminho }) => {
      if (typeof caminho !== 'string') return;
      if (caminho.startsWith(`aparencia.${janela}.`) || (janela === 'diff' && caminho === 'diff.tema')) await aplicarTudo();
    });
  }

  function aoAplicar(callback) {
    ouvintes.push(callback);
  }

  /**
   * A linha "Fonte | Tamanho" das abas Fast Note e Diff Checker. `atual` e o que esta salvo
   * ({ fonte, tamanho }); cada troca grava na hora em aparencia.<janela>.fonte / .tamanho, e o
   * processo principal avisa as janelas abertas.
   */
  function montarCampos(janela, atual) {
    const { el, rotulo } = window.Blink.ui;

    const selectFonte = el('select', {
      class: 'campo-select',
      id: `fonte-${janela}`,
      onchange: (evento) => window.blink.config.gravar(`aparencia.${janela}.fonte`, evento.target.value),
    });
    for (const fonte of FONTES) {
      const opcao = el('option', { value: fonte.valor, texto: fonte.valor, selected: fonte.valor === atual.fonte });
      // Cada nome na sua propria fonte, para dar para escolher vendo (pelo CSSOM: o CSP bloqueia o atributo style).
      opcao.style.fontFamily = fonte.pilha;
      selectFonte.appendChild(opcao);
    }

    const selectTamanho = el('select', {
      class: 'campo-select',
      id: `tamanho-${janela}`,
      onchange: (evento) => window.blink.config.gravar(`aparencia.${janela}.tamanho`, Number(evento.target.value)),
    });
    for (const tamanho of TAMANHOS) {
      selectTamanho.appendChild(el('option', { value: String(tamanho), texto: `${tamanho} px`, selected: tamanho === atual.tamanho }));
    }

    return el('div', { class: 'secao grade-2' }, [
      el('div', {}, [rotulo('Fonte'), selectFonte]),
      el('div', {}, [rotulo('Tamanho'), selectTamanho]),
    ]);
  }

  /** O seletor "Tema" da aba Diff Checker: grava em diff.tema, e o Diff aberto troca as cores na hora. */
  function montarTema(atual) {
    const { el, rotulo } = window.Blink.ui;

    const select = el('select', {
      class: 'campo-select',
      id: 'tema-diff',
      onchange: (evento) => window.blink.config.gravar('diff.tema', evento.target.value),
    });
    for (const tema of TEMAS) {
      select.appendChild(el('option', { value: tema.valor, texto: tema.rotulo, selected: tema.valor === atual }));
    }

    return el('div', { class: 'secao' }, [rotulo('Tema das cores do código'), select]);
  }

  window.Blink.aparencia = { FONTES, TAMANHOS, TEMAS, iniciar, aoAplicar, aplicar, montarCampos, montarTema };
})();
