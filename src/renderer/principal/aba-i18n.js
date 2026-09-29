/**
 * Aba "I18n" da janela principal.
 *
 * Sem opcoes: a tabela de caracteres e fixa no codigo (src/main/ferramenta-i18n.js).
 * Aqui so o atalho e o rodape, no mesmo molde das outras abas.
 */

window.Blink = window.Blink || {};

(function () {
  const { el } = window.Blink.ui;

  function montar(estado) {
    return el('div', { class: 'painel-aba' }, [
      window.Blink.campoBind.montar({
        ferramenta: 'i18n',
        rotulo: 'Atalho para converter seleção',
        acelerador: estado.valores.binds.i18n,
        registrado: estado.situacaoBinds.i18n,
      }),

      window.Blink.pecas.rodape({
        ferramenta: 'i18n',
        legenda: 'Selecione um texto em qualquer lugar e use a bind: os acentos viram sequências de escape do JavaScript, prontas para colar.',
      }),
    ]);
  }

  window.Blink.abaI18n = { montar };
})();
