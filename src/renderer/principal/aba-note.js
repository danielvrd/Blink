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

  /**
   * O que acontece ao concluir uma tarefa do task.md. Os valores sao os do config.js
   * (MODOS_AO_CONCLUIR): nada e registrado, vira um topico na daily, ou um topico
   * recolhivel (com as anotacoes embaixo) na daily.
   */
  const MODOS_AO_CONCLUIR = [
    { valor: 'nada', rotulo: 'Não registrar' },
    { valor: 'daily', rotulo: 'Na daily' },
    { valor: 'dailyTopico', rotulo: 'Daily com tópico' },
  ];

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

    // O arquivo da daily: so os que tem o relogio ligado (a lista vem do processo principal, ja sem os que
    // sumiram da pasta). "Nenhum" = nada e registrado, qualquer que seja o modo.
    const arquivoSalvo = (estado.tarefas && estado.tarefas.arquivoDaily) || '';
    const selectDaily = el('select', {
      class: 'campo-select',
      id: 'arquivo-daily',
      onchange: (evento) => window.blink.config.gravar('tarefas.arquivoDaily', evento.target.value),
    });
    selectDaily.appendChild(el('option', { value: '', texto: 'Nenhum' }));
    const avisoDaily = el('div', { class: 'nota-campo', hidden: true, texto: 'Nenhum arquivo com o relógio ligado ainda: ligue o relógio de um arquivo no Fast Note para usá-lo como daily.' });
    window.blink.notas.estado().then((notas) => {
      for (const nome of notas.historico) {
        selectDaily.appendChild(el('option', { value: nome, texto: nome.replace(/\.md$/i, ''), selected: nome.toLowerCase() === arquivoSalvo.toLowerCase() }));
      }
      avisoDaily.hidden = notas.historico.length > 0;
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

      // Fonte e tamanho do texto dos topicos e do rascunho (valem na hora na janela aberta).
      window.Blink.aparencia.montarCampos('note', estado.aparencia.note),

      // Ao concluir uma tarefa (a bolinha do task.md): registrar na daily?
      el('div', { class: 'secao' }, [
        el('div', { class: 'rotulo', texto: 'Ao concluir uma tarefa' }),
        window.Blink.pecas.segmentado({
          opcoes: MODOS_AO_CONCLUIR,
          valor: estado.tarefas.aoConcluir,
          aoTrocar: (valor) => window.blink.config.gravar('tarefas.aoConcluir', valor),
        }),
      ]),

      el('div', { class: 'secao' }, [
        el('div', { class: 'rotulo', texto: 'Arquivo da daily' }),
        selectDaily,
        avisoDaily,
      ]),

      window.Blink.pecas.rodape({
        ferramenta: 'note',
        legenda: 'Assim abriria ao usar a bind:',
      }),
    ]);
  }

  window.Blink.abaNote = { montar };
})();
