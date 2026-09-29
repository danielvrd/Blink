/**
 * Bloco de notas do Fast Note.
 *
 * Escreve topicos em arquivos .md de uma pasta escolhida. Quem mexe em
 * disco e o processo principal (src/main/notas.js); aqui e so a tela.
 *
 * Uma inversao importante: no arquivo os topicos ficam em ordem
 * cronologica, com o mais novo no fim, para o .md se ler como um diario.
 * Na tela o mais novo aparece em cima, que e onde o olho vai primeiro.
 * Entao as listas daqui sao sempre o inverso das do arquivo, e a conversao
 * acontece em dois lugares so: carregar() e gravar().
 *
 * O task.md e um arquivo especial: em vez de uma lista de topicos, tem duas
 * - tarefas a fazer e concluidas. Cada lista e um "grupo":
 *
 *   'topicos'     notas comuns
 *   'pendentes'   tarefas a fazer
 *   'concluidas'  tarefas feitas
 *
 * Apagar, editar e arrastar funcionam igual nos tres; so a gravacao muda.
 */

(function () {
  const { el, limpar } = window.Blink.ui;

  /** Valor da opcao "+ Criar nova nota" do select. */
  const NOVO = '__novo__';

  /**
   * "/task texto" no rascunho manda o texto para o arquivo de tarefas, de
   * qualquer arquivo que esteja aberto. "/task" sozinho so abre as tarefas.
   */
  const COMANDO_TAREFA = /^\/task(?:\s+([\s\S]*))?$/i;

  /** Quanto tempo o item recem-criado fica destacado. */
  const TEMPO_PISCANDO = 1600;

  const campoNome = document.getElementById('campo-nome');

  /** O seletor de arquivos com as estrelas (seletor.js). */
  const seletor = window.Blink.seletor.criar(document.getElementById('seletor-arquivo'), {
    valorNovo: NOVO,
    rotuloNovo: '+ Criar nova nota',
    aoEscolher: (valor) => escolherArquivo(valor),
    aoMarcar: (valor) => alternarPrincipal(valor),
    // A lista e as confirmacoes nunca ficam abertas juntas.
    aoAbrir: () => fecharPopovers(),
  });
  const lista = document.getElementById('lista');
  const rascunho = document.getElementById('rascunho');
  const dica = document.getElementById('dica');
  const botaoLimpar = document.getElementById('btn-limpar');
  const botaoExcluir = document.getElementById('btn-excluir');
  const popoverLimpar = document.getElementById('popover-limpar');
  const popoverExcluir = document.getElementById('popover-excluir');
  const perguntaExcluir = document.getElementById('pergunta-excluir');

  /** Pasta configurada, so para mostrar na dica. */
  let pasta = '';

  /** Nome do arquivo de tarefas. Vem do processo principal. */
  let arquivoTarefas = 'task.md';

  /** Os .md da pasta, na ordem do seletor. */
  let arquivos = [];

  /** O arquivo da estrela, que o Ctrl+Alt+N abre. '' = nenhum. */
  let principal = '';

  /** Arquivo escolhido agora, ou NOVO. */
  let arquivo = NOVO;

  /** Notas comuns, na ordem da TELA: o mais novo primeiro. */
  let topicos = [];

  /** Tarefas do task.md, tambem na ordem da tela. */
  let tarefas = { pendentes: [], concluidas: [] };

  /** O item recem-criado, para ele piscar: { grupo, indice } ou null. */
  let recemCriado = null;

  /** Arrastar para reordenar: { grupo, indice, item } de quem esta sendo arrastado. */
  let arrastando = null;
  let alvo = null;

  /** Um item esta sendo editado agora? So um de cada vez. */
  let editando = false;

  // --- Ajudantes --------------------------------------------------------------

  /** O arquivo aberto e o de tarefas? Sem diferenciar maiuscula. */
  function ehTarefas() {
    return arquivo !== NOVO && arquivo.toLowerCase() === arquivoTarefas;
  }

  /** A lista que um grupo representa. */
  function listaDo(grupo) {
    return grupo === 'topicos' ? topicos : tarefas[grupo];
  }

  function totalDeItens() {
    return ehTarefas() ? tarefas.pendentes.length + tarefas.concluidas.length : topicos.length;
  }

  /**
   * Em que arquivo abrir: a primeira nota comum, que e onde se escreve no
   * dia a dia. Sem notas comuns, as tarefas. Pasta vazia, "criar nova".
   */
  function primeiroArquivo(arquivos) {
    const comuns = arquivos.filter((a) => a.toLowerCase() !== arquivoTarefas);
    if (comuns.length > 0) return comuns[0];
    const deTarefas = arquivos.find((a) => a.toLowerCase() === arquivoTarefas);
    return deTarefas || NOVO;
  }

  // --- Disco ------------------------------------------------------------------

  /** Le o arquivo aberto e inverte para a ordem da tela. */
  async function carregar() {
    topicos = [];
    tarefas = { pendentes: [], concluidas: [] };
    if (arquivo === NOVO) return;

    if (ehTarefas()) {
      const lido = await window.blink.notas.lerTarefas();
      tarefas = { pendentes: lido.pendentes.reverse(), concluidas: lido.concluidas.reverse() };
      return;
    }

    const { topicos: doArquivo } = await window.blink.notas.ler(arquivo);
    topicos = doArquivo.reverse();
  }

  /** Manda o que esta na tela para o disco, de volta na ordem do arquivo. */
  async function gravar() {
    if (arquivo === NOVO) return;

    if (ehTarefas()) {
      await window.blink.notas.salvarTarefas({
        pendentes: [...tarefas.pendentes].reverse(),
        concluidas: [...tarefas.concluidas].reverse(),
      });
      return;
    }

    await window.blink.notas.salvar(arquivo, [...topicos].reverse());
  }

  /** Relê a lista de arquivos - pode ter nascido um - e redesenha o seletor. */
  async function recarregarSeletor() {
    const estado = await window.blink.notas.estado();
    pasta = estado.pasta;
    arquivoTarefas = estado.arquivoTarefas;
    principal = estado.principal;
    desenharSelect(estado.arquivos);
    return estado.arquivos;
  }

  // --- Desenho ----------------------------------------------------------------

  function desenharSelect(lista) {
    arquivos = lista;
    atualizarSeletor();
  }

  /** Mostra no seletor o arquivo aberto e a estrela, sem reler a pasta. */
  function atualizarSeletor() {
    seletor.definir({ arquivos, atual: arquivo, principal });
  }

  /**
   * Clicou na estrela: marca como principal, ou desmarca se ja era. So um
   * por vez - marcar outro tira a estrela do anterior.
   */
  async function alternarPrincipal(nome) {
    const novo = principal.toLowerCase() === nome.toLowerCase() ? '' : nome;
    const gravou = await window.blink.notas.definirPrincipal(novo);
    if (gravou) principal = novo;
    atualizarSeletor();
  }

  function vazio(texto) {
    lista.appendChild(el('div', { class: 'vazio', texto }));
  }

  /**
   * Monta a linha de um item.
   *
   * Nota comum: alca, traco, texto, apagar.
   * Tarefa: alca, bolinha (marca e desmarca), texto, apagar.
   */
  function montarItem(grupo, indice, texto) {
    const ehTarefa = grupo !== 'topicos';
    const feita = grupo === 'concluidas';
    const piscando = recemCriado && recemCriado.grupo === grupo && recemCriado.indice === indice;

    const classes = ['topico'];
    if (piscando) classes.push('novo');
    if (ehTarefa) classes.push('tarefa', feita ? 'feita' : 'pendente');

    const item = el('div', { class: classes.join(' '), draggable: 'true' });

    const spanTexto = el('span', {
      class: 'texto',
      texto,
      title: 'Clique para editar',
      onclick: (evento) =>
        editar(evento.currentTarget, item, texto, async (novoTexto) => {
          listaDo(grupo)[indice] = novoTexto;
          await gravar();
        }),
    });

    const inicio = ehTarefa
      ? el('button', {
          class: 'marcador-tarefa',
          title: feita ? 'Voltar para a fazer' : 'Marcar como concluída',
          'aria-label': feita ? 'Voltar para a fazer' : 'Marcar como concluída',
          onclick: () => alternarTarefa(grupo, indice),
        })
      : el('span', { class: 'traco', texto: '–' });

    window.Blink.ui.anexar(item, [
      el('span', { class: 'alca', texto: '⋮⋮' }),
      el('div', { class: 'corpo-topico' }, [inicio, spanTexto]),
      el('button', {
        class: 'botao-apagar',
        texto: '×',
        title: ehTarefa ? 'Apagar tarefa' : 'Apagar tópico',
        onclick: () => apagar(grupo, indice),
      }),
    ]);

    ligarArrasto(item, grupo, indice);
    return item;
  }

  /** As tarefas: a fazer em cima, uma linha divisoria, concluidas embaixo. */
  function desenharTarefas() {
    const { pendentes, concluidas } = tarefas;

    if (pendentes.length === 0 && concluidas.length === 0) {
      vazio('Nenhuma tarefa ainda — escreva abaixo.');
      return;
    }

    if (pendentes.length === 0) vazio('Nada a fazer.');
    pendentes.forEach((texto, indice) => lista.appendChild(montarItem('pendentes', indice, texto)));

    if (concluidas.length > 0) {
      lista.appendChild(el('div', { class: 'divisor-tarefas', texto: `Concluídas (${concluidas.length})` }));
      concluidas.forEach((texto, indice) => lista.appendChild(montarItem('concluidas', indice, texto)));
    }
  }

  function desenharLista() {
    limpar(lista);

    if (ehTarefas()) {
      desenharTarefas();
      return;
    }

    if (arquivo === NOVO || topicos.length === 0) {
      vazio('Nenhum tópico ainda — escreva abaixo.');
      return;
    }

    topicos.forEach((texto, indice) => lista.appendChild(montarItem('topicos', indice, texto)));
  }

  function desenharDica() {
    const partes = [ehTarefas() ? 'Enter adiciona uma tarefa' : 'Enter adiciona · /task vira tarefa'];
    if (pasta) partes.push(`Pasta: ${pasta}`);
    dica.textContent = partes.join(' · ');
    dica.title = dica.textContent;

    rascunho.placeholder = ehTarefas()
      ? 'Escreva uma tarefa…'
      : 'Escreva e pressione Enter…';
  }

  function desenhar() {
    campoNome.hidden = arquivo !== NOVO;
    botaoLimpar.disabled = arquivo === NOVO || totalDeItens() === 0;
    botaoExcluir.disabled = arquivo === NOVO;
    if (botaoLimpar.disabled) popoverLimpar.hidden = true;
    if (botaoExcluir.disabled) popoverExcluir.hidden = true;

    desenharLista();
    desenharDica();
  }

  /**
   * Tira o destaque do item recem-criado depois de um tempo.
   *
   * Se o usuario estiver editando algum item nesse momento, nao redesenha:
   * redesenhar destruiria o campo de edicao aberto, com o que ele digitou.
   */
  function agendarFimDoPiscar() {
    setTimeout(() => {
      recemCriado = null;
      if (!editando) desenharLista();
    }, TEMPO_PISCANDO);
  }

  // --- Acoes ------------------------------------------------------------------

  /** Troca o arquivo mostrado e carrega o conteudo dele. */
  async function escolherArquivo(valor) {
    arquivo = valor;
    fecharPopovers();
    recemCriado = null;
    atualizarSeletor();

    if (arquivo === NOVO) {
      topicos = [];
      tarefas = { pendentes: [], concluidas: [] };
      campoNome.value = '';
      desenhar();
      campoNome.focus();
      return;
    }

    await carregar();
    desenhar();
    rascunho.focus();
  }

  /**
   * Manda o texto para as tarefas e abre o task.md, com o item novo
   * piscando. Texto vazio (um "/task" sozinho) so abre.
   */
  async function adicionarTarefa(texto) {
    if (texto !== '') {
      await window.blink.notas.adicionarTarefa(texto);
    } else {
      // Para abrir, o arquivo precisa existir: regravar o que ha cria se
      // faltar e nao muda nada se ja existir.
      const atuais = await window.blink.notas.lerTarefas();
      await window.blink.notas.salvarTarefas(atuais);
    }

    arquivo = arquivoTarefas;
    await recarregarSeletor();
    await carregar();

    recemCriado = texto !== '' ? { grupo: 'pendentes', indice: 0 } : null;
    desenhar();
    rascunho.focus();
    if (recemCriado) agendarFimDoPiscar();
  }

  /** Grava o que esta no rascunho: topico, tarefa, ou "/task". */
  async function adicionar() {
    const bruto = rascunho.value.trim();
    if (bruto === '') return;

    const comando = bruto.match(COMANDO_TAREFA);
    if (comando || ehTarefas()) {
      rascunho.value = '';
      await adicionarTarefa(comando ? (comando[1] || '').trim() : bruto);
      return;
    }

    const destino = arquivo === NOVO ? campoNome.value : arquivo;
    const gravado = await window.blink.notas.adicionar(destino, bruto);

    if (!gravado) {
      campoNome.focus();
      return;
    }

    rascunho.value = '';
    arquivo = gravado;
    await recarregarSeletor();
    await carregar();

    // O mais novo e sempre o primeiro da tela.
    recemCriado = { grupo: 'topicos', indice: 0 };
    desenhar();
    rascunho.focus();
    agendarFimDoPiscar();
  }

  async function apagar(grupo, indice) {
    listaDo(grupo).splice(indice, 1);
    recemCriado = null;
    desenhar();
    await gravar();
  }

  /**
   * Conclui uma tarefa, ou volta uma concluida para a fazer. Ela entra no
   * topo da outra secao, que na tela e onde o olho esta.
   */
  async function alternarTarefa(grupo, indice) {
    const destino = grupo === 'pendentes' ? 'concluidas' : 'pendentes';
    const [tarefa] = tarefas[grupo].splice(indice, 1);
    tarefas[destino].unshift(tarefa);

    recemCriado = null;
    desenhar();
    await gravar();
  }

  async function limparTudo() {
    fecharPopovers();
    recemCriado = null;

    if (ehTarefas()) {
      tarefas = { pendentes: [], concluidas: [] };
      desenhar();
      await gravar();
      return;
    }

    topicos = [];
    desenhar();
    await window.blink.notas.limpar(arquivo);
  }

  /**
   * Manda o arquivo aberto para a Lixeira e cai no proximo que sobrar - ou
   * em "+ Criar nova nota", se a pasta ficou vazia.
   */
  async function excluirArquivo() {
    fecharPopovers();
    if (arquivo === NOVO) return;

    await window.blink.notas.excluir(arquivo);

    const estado = await window.blink.notas.estado();
    // Se o excluido era o principal, o processo principal ja tirou a estrela.
    principal = estado.principal;
    arquivo = primeiroArquivo(estado.arquivos);
    desenharSelect(estado.arquivos);
    await escolherArquivo(arquivo);
  }

  // --- Editar um item -----------------------------------------------------------

  /** O campo de edicao cresce com o texto, como o proprio item cresce. */
  function ajustarAltura(campo) {
    campo.style.height = 'auto';
    campo.style.height = `${campo.scrollHeight}px`;
  }

  /**
   * Troca o texto de um item por um campo de edicao, no mesmo lugar.
   *
   *   Enter        salva
   *   Shift+Enter  quebra linha, como no rascunho
   *   Esc          desiste
   *   clicar fora  salva
   *
   * Texto vazio ao salvar desfaz a edicao em vez de apagar o item: apagar
   * tem o proprio botao, e esvaziar sem querer nao deve custar um item.
   *
   * `aoSalvar` recebe o texto novo e cuida de guardar, qualquer que seja o
   * grupo.
   */
  function editar(spanTexto, item, original, aoSalvar) {
    if (editando) return;
    editando = true;

    const campo = el('textarea', { class: 'campo-edicao', rows: '1', spellcheck: 'false' });
    campo.value = original;

    // Sem isto, selecionar texto dentro do campo arrastaria a linha inteira.
    item.draggable = false;
    item.classList.add('editando');

    spanTexto.replaceWith(campo);
    ajustarAltura(campo);
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);

    // Enter e clicar fora podem chegar os dois; so o primeiro vale.
    let terminado = false;

    async function terminar(salvar) {
      if (terminado) return;
      terminado = true;
      editando = false;

      const novo = campo.value.trim();
      const mudou = salvar && novo !== '' && novo !== original;

      if (mudou) await aoSalvar(novo);
      recemCriado = null;
      desenhar();
    }

    campo.addEventListener('input', () => ajustarAltura(campo));
    campo.addEventListener('blur', () => terminar(true));
    campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' && !evento.shiftKey) {
        evento.preventDefault();
        terminar(true);
      } else if (evento.key === 'Escape') {
        // Sem o stopPropagation o Esc chegaria na janela e fecharia o Fast
        // Note inteiro, em vez de so desistir da edicao.
        evento.preventDefault();
        evento.stopPropagation();
        terminar(false);
      }
    });
  }

  // --- Confirmacoes (limpar tudo e excluir) ------------------------------------

  /** Fecha as duas confirmacoes. Uma aberta nunca fica por cima da outra. */
  function fecharPopovers() {
    popoverLimpar.hidden = true;
    popoverExcluir.hidden = true;
  }

  /** Abre uma confirmacao fechando a outra, ou fecha se ja estava aberta. */
  function alternarPopover(qual) {
    const abrir = qual.hidden;
    fecharPopovers();
    seletor.fechar();
    qual.hidden = !abrir;
  }

  // --- Arrastar para reordenar ---------------------------------------------------

  /** Tira as linhas-guia de todos os itens. */
  function limparGuias() {
    for (const item of lista.querySelectorAll('.topico')) {
      item.classList.remove('solta-acima', 'solta-abaixo', 'arrastando');
    }
  }

  /**
   * Arrasta dentro do mesmo grupo. Soltar uma tarefa a fazer no meio das
   * concluidas nao e permitido - o cursor mostra o sinal de proibido -
   * porque para isso existe a bolinha.
   */
  function ligarArrasto(item, grupo, indice) {
    item.addEventListener('dragstart', (evento) => {
      arrastando = { grupo, indice, item };
      evento.dataTransfer.effectAllowed = 'move';
      // O Firefox e alguns navegadores so comecam o arrasto se houver dado.
      evento.dataTransfer.setData('text/plain', String(indice));
      item.classList.add('arrastando');
    });

    item.addEventListener('dragover', (evento) => {
      if (!arrastando || arrastando.grupo !== grupo) return;
      evento.preventDefault();
      if (arrastando.indice === indice || alvo === item) return;

      alvo = item;
      limparGuias();
      arrastando.item.classList.add('arrastando');

      // Descendo, a guia fica embaixo do item; subindo, em cima. E onde o
      // item vai parar.
      item.classList.add(arrastando.indice < indice ? 'solta-abaixo' : 'solta-acima');
    });

    item.addEventListener('drop', async (evento) => {
      evento.preventDefault();
      const origem = arrastando;
      arrastando = null;
      alvo = null;

      if (!origem || origem.grupo !== grupo || origem.indice === indice) {
        limparGuias();
        return;
      }

      const itens = listaDo(grupo);
      const [movido] = itens.splice(origem.indice, 1);
      itens.splice(indice, 0, movido);

      recemCriado = null;
      desenhar();
      await gravar();
    });

    item.addEventListener('dragend', () => {
      arrastando = null;
      alvo = null;
      limparGuias();
    });
  }

  // --- Ligacoes ------------------------------------------------------------------


  rascunho.addEventListener('keydown', (evento) => {
    // Enter grava; Shift+Enter quebra linha dentro do item.
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      adicionar();
    }
  });

  // Enter no nome do arquivo novo pula para o rascunho, em vez de nao fazer
  // nada - o proximo passo e sempre escrever o primeiro topico.
  campoNome.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      rascunho.focus();
    }
  });

  botaoLimpar.addEventListener('click', () => {
    if (botaoLimpar.disabled) return;
    alternarPopover(popoverLimpar);
  });

  botaoExcluir.addEventListener('click', () => {
    if (botaoExcluir.disabled) return;
    // A pergunta cita o nome: excluir e mais serio que limpar, entao vale
    // deixar claro qual arquivo vai embora.
    perguntaExcluir.textContent = `Excluir o arquivo ${arquivo}?`;
    alternarPopover(popoverExcluir);
  });

  document.getElementById('btn-limpar-sim').addEventListener('click', limparTudo);
  document.getElementById('btn-limpar-nao').addEventListener('click', fecharPopovers);
  document.getElementById('btn-excluir-sim').addEventListener('click', excluirArquivo);
  document.getElementById('btn-excluir-nao').addEventListener('click', fecharPopovers);

  document.getElementById('btn-fechar').addEventListener('click', () => window.blink.janela.fechar());

  window.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;

    // Esc com a lista de arquivos aberta so fecha ela.
    if (seletor.estaAberto()) {
      seletor.fechar();
      return;
    }

    // Esc com uma confirmacao aberta so fecha ela.
    if (!popoverLimpar.hidden || !popoverExcluir.hidden) {
      fecharPopovers();
      return;
    }
    window.blink.janela.fechar();
  });

  // --- Inicio --------------------------------------------------------------------

  async function iniciar() {
    const estado = await window.blink.notas.estado();
    pasta = estado.pasta;
    arquivoTarefas = estado.arquivoTarefas;
    principal = estado.principal;

    // Abre no arquivo da estrela. Sem estrela, o de sempre.
    arquivo = principal || primeiroArquivo(estado.arquivos);
    desenharSelect(estado.arquivos);
    await carregar();

    desenhar();
    if (arquivo === NOVO) campoNome.focus();
    else rascunho.focus();
  }

  iniciar();
})();
