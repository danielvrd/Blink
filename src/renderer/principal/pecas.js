/**
 * Pedacos que as tres abas repetem.
 *
 * Mora aqui o que aparece igual em Diff Checker, Fast Note e SQL Formatter,
 * para nao ter tres copias do mesmo HTML.
 */

window.Blink = window.Blink || {};

(function () {
  const { el } = window.Blink.ui;

  /**
   * Rodape da aba: uma legenda e o botao "Abrir".
   *
   * O botao chama a mesma funcao do processo principal que a bind global
   * chama, entao a ferramenta abre igual pelos dois caminhos. Nas etapas 2, 3
   * e 4 essa funcao passa a abrir a janela de verdade; por enquanto ela so
   * escreve no console.
   */
  function rodape({ ferramenta, legenda }) {
    return el('div', { class: 'rodape-aba' }, [
      el('div', { class: 'legenda', texto: legenda }),
      el('button', {
        class: 'botao-primario',
        texto: 'Abrir',
        title: 'Abrir a janela da ferramenta',
        onclick: () => window.blink.demonstracao.abrir(ferramenta),
      }),
    ]);
  }

  /**
   * Controle segmentado: botoes lado a lado onde so um fica ativo.
   *
   * opcoes    [{ valor, rotulo }]
   * valor     qual esta ativo agora
   * mono      true usa a fonte monoespacada (usado em UPPER / lower)
   * aoTrocar  recebe o novo valor
   */
  function segmentado({ opcoes, valor, mono, aoTrocar }) {
    const caixa = el('div', { class: mono ? 'segmentado mono' : 'segmentado' });

    const botoes = opcoes.map((opcao) =>
      el('button', {
        class: opcao.valor === valor ? 'ativo' : '',
        texto: opcao.rotulo,
        onclick: () => {
          // Tira o ativo de todos e poe so neste.
          botoes.forEach((b, i) => b.classList.toggle('ativo', opcoes[i].valor === opcao.valor));
          aoTrocar(opcao.valor);
        },
      })
    );

    window.Blink.ui.anexar(caixa, botoes);
    return caixa;
  }

  /**
   * Interruptor liga/desliga, com o texto a esquerda.
   *
   * rotulo    o que a opcao faz
   * ligado    estado atual
   * aoTrocar  recebe o novo estado (true/false)
   */
  function interruptor({ rotulo, ligado, aoTrocar }) {
    let estado = ligado;

    const botao = el('button', {
      class: estado ? 'interruptor ligado' : 'interruptor',
      role: 'switch',
      'aria-checked': String(estado),
      'aria-label': rotulo,
      onclick: () => {
        estado = !estado;
        botao.classList.toggle('ligado', estado);
        botao.setAttribute('aria-checked', String(estado));
        aoTrocar(estado);
      },
    });

    return el('label', { class: 'linha-interruptor' }, [
      el('span', { class: 'texto-interruptor', texto: rotulo }),
      botao,
    ]);
  }

  window.Blink.pecas = { rodape, segmentado, interruptor };
})();
