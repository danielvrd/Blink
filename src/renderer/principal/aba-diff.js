/**
 * Aba "Diff Checker" da janela principal.
 *
 * A mais simples das tres: so o atalho. A comparacao em si vem na etapa 4.
 *
 * O design nao tem seletor de tema aqui - o esquema preto e fixo.
 */

window.Blink = window.Blink || {};

(function () {
  const { el } = window.Blink.ui;

  /** Monta a aba. `estado` e o que veio de window.blink.config.ler(). */
  function montar(estado) {
    return el('div', { class: 'painel-aba' }, [
      window.Blink.campoBind.montar({
        ferramenta: 'diff',
        rotulo: 'Atalho de captura e comparação',
        acelerador: estado.valores.binds.diff,
        registrado: estado.situacaoBinds.diff,
      }),

      window.Blink.pecas.rodape({
        ferramenta: 'diff',
        legenda: 'Assim abriria após usar a bind duas vezes:',
      }),
    ]);
  }

  window.Blink.abaDiff = { montar };
})();
