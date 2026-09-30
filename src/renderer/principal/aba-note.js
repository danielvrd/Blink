/**
 * Aba "Fast Note" da janela principal.
 *
 * Tem o atalho e a pasta onde os arquivos .md sao gravados. O bloco de notas
 * em si vem na etapa 3.
 */

window.Blink = window.Blink || {};

(function () {
  const { el } = window.Blink.ui;

  const SEM_PASTA = 'Nenhuma pasta escolhida';

  function montar(estado) {
    const pastaAtual = estado.valores.pastaNotas;

    const caminho = el('div', {
      class: pastaAtual ? 'caminho-pasta' : 'caminho-pasta vazio',
      texto: pastaAtual || SEM_PASTA,
      // O caminho completo no title, porque a caixa corta com reticencias
      // quando a pasta e funda demais para caber.
      title: pastaAtual || SEM_PASTA,
    });

    const botaoPasta = el('button', {
      class: 'botao-fantasma',
      texto: 'Selecionar…',
      onclick: async () => {
        // Quem abre o seletor de pasta do Windows e grava a escolha e o
        // processo principal. Devolve null se o usuario cancelar.
        const escolhida = await window.blink.pasta.escolher();
        if (!escolhida) return;

        caminho.textContent = escolhida;
        caminho.title = escolhida;
        caminho.classList.remove('vazio');
        // A copia em memoria acompanha o que foi gravado.
        estado.valores.pastaNotas = escolhida;
      },
    });

    return el('div', { class: 'painel-aba' }, [
      window.Blink.campoBind.montar({
        ferramenta: 'note',
        rotulo: 'Atalho para abrir',
        acelerador: estado.valores.binds.note,
        registrado: estado.situacaoBinds.note,
      }),

      el('div', { class: 'secao' }, [
        el('div', { class: 'rotulo', texto: 'Pasta de notas' }),
        el('div', { class: 'linha-campo' }, [caminho, botaoPasta]),
      ]),

      window.Blink.pecas.rodape({
        ferramenta: 'note',
        legenda: 'Assim abriria ao usar a bind:',
      }),
    ]);
  }

  window.Blink.abaNote = { montar };
})();
