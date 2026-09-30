/**
 * Janela principal do Blink.
 *
 * Junta as pecas: le a configuracao, monta a barra de abas, troca de aba e
 * liga os botoes da barra de titulo. O conteudo de cada aba fica no seu
 * proprio arquivo (aba-diff.js, aba-note.js, aba-sql.js).
 */

(function () {
  const { el, limpar } = window.Blink.ui;

  const ABAS = [
    { id: 'diff', rotulo: 'Diff Checker', montar: () => window.Blink.abaDiff.montar(estado) },
    { id: 'note', rotulo: 'Fast Note', montar: () => window.Blink.abaNote.montar(estado) },
    { id: 'sql', rotulo: 'Formatter', montar: () => window.Blink.abaSql.montar(estado) },
    { id: 'i18n', rotulo: 'I18n', montar: () => window.Blink.abaI18n.montar(estado) },
  ];

  /** Tudo que veio do processo principal: valores, situacao das binds etc. */
  let estado = null;

  /** A aba que esta na tela agora. */
  let abaAtual = null;

  const barraAbas = document.getElementById('barra-abas');
  const conteudo = document.getElementById('conteudo');

  /** Os botoes das abas, na mesma ordem de ABAS. */
  let botoesAba = [];

  /**
   * Mostra uma aba.
   *
   * A aba e montada do zero a cada troca. Sao poucos elementos e o codigo
   * fica bem mais simples do que guardar as tres na memoria e esconder duas:
   * cada aba sempre nasce com os valores atuais da configuracao.
   *
   * "Atuais" de verdade: a configuracao e RELIDA a cada troca. A janela
   * principal fica escondida por horas e o que ela leu na abertura envelhece -
   * a pasta das notas, por exemplo, tambem muda por fora (o seletor que o
   * Ctrl+Alt+N abre quando ainda nao ha pasta), e a aba continuava mostrando
   * "Nenhuma pasta escolhida" com a pasta ja salva.
   */
  async function mostrarAba(id) {
    const indice = ABAS.findIndex((aba) => aba.id === id);
    const aba = ABAS[indice];
    if (!aba) return;

    estado = await window.blink.config.ler();
    abaAtual = id;

    botoesAba.forEach((botao, i) => botao.classList.toggle('ativa', i === indice));

    limpar(conteudo);
    conteudo.appendChild(aba.montar());

    // Guarda para o app reabrir na mesma aba da proxima vez.
    window.blink.config.gravar('abaAtiva', id);
  }

  function montarBarraAbas() {
    botoesAba = ABAS.map((aba) =>
      el('button', {
        class: 'aba',
        texto: aba.rotulo,
        onclick: () => mostrarAba(aba.id),
      })
    );

    limpar(barraAbas);
    window.Blink.ui.anexar(barraAbas, botoesAba);
  }

  function ligarBarraTitulo() {
    document.getElementById('btn-minimizar').addEventListener('click', () => {
      window.blink.janela.minimizar();
    });

    // O X esconde na bandeja em vez de encerrar: sair e so pelo menu do
    // icone, como pede o design.
    document.getElementById('btn-fechar').addEventListener('click', () => {
      window.blink.janela.esconder();
    });

    // Maximiza, ou volta ao tamanho de antes se ja estiver maximizada.
    // Clicar duas vezes na barra de titulo faz o mesmo - isso o Windows
    // resolve sozinho.
    document.getElementById('btn-maximizar').addEventListener('click', () => {
      window.blink.janela.alternarMaximizar();
    });
  }

  async function iniciar() {
    estado = await window.blink.config.ler();

    ligarBarraTitulo();
    montarBarraAbas();
    await mostrarAba(estado.valores.abaAtiva);

    // O olho do cabecalho de uma ferramenta pede para abrir numa aba: a
    // janela principal pode estar escondida ha tempo, ja carregada.
    window.blink.principal.aoTrocarAba((id) => mostrarAba(id));

    // Ao voltar para a janela, a aba do Fast Note e desenhada de novo: a
    // pasta pode ter mudado enquanto ela estava escondida. So essa aba - as
    // outras podem estar no meio de uma gravacao de atalho, que uma aba
    // redesenhada interromperia.
    // Com uma pequena espera: quando o foco volta do seletor de pasta, o
    // processo principal ainda esta gravando a escolha.
    window.addEventListener('focus', () => {
      setTimeout(() => {
        if (abaAtual === 'note') mostrarAba('note');
      }, 150);
    });
  }

  iniciar();
})();
