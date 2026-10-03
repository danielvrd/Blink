/**
 * Aba "Diff Checker" da janela principal.
 *
 * O atalho e a fonte e o tamanho do texto das celulas.
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

      // Fonte e tamanho do texto das celulas (valem na hora na janela aberta).
      window.Blink.aparencia.montarCampos('diff', estado.aparencia.diff),

      // As cores do codigo (realce de sintaxe): o tema vale na hora na janela aberta.
      window.Blink.aparencia.montarTema(estado.diffTema),

      window.Blink.pecas.rodape({
        ferramenta: 'diff',
        legenda: 'Assim abriria após usar a bind duas vezes:',
      }),
    ]);
  }

  window.Blink.abaDiff = { montar };
})();
