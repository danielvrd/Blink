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
 *   'historico'   topicos do dia escolhido, num arquivo com o relogio ligado
 *
 * Apagar, editar e arrastar funcionam igual em todos; so a gravacao muda.
 *
 * Um arquivo com o relogio ligado (historico diario) guarda um registro por
 * dia; o campo do calendario (calendario.js), ao lado do seletor, escolhe
 * qual dia esta na tela. Ver o formato em disco em src/main/notas.js.
 *
 * Um arquivo em "folha livre" (a folha do seletor) nao tem lista de topicos: no
 * lugar dela e do rascunho fica um editor de pagina com caneta (folha.js), e a
 * janela troca para o tamanho proprio da folha. O .md nao muda nesse modo; a
 * folha mora em .blink/livre (src/main/notas-livres.js).
 */

(function () {
  const { el, limpar, svg } = window.Blink.ui;

  /** Valor da opcao "+ Criar nova nota" do seletor. */
  const NOVO = '__novo__';

  /** Quanto tempo o item recem-criado fica destacado. */
  const TEMPO_PISCANDO = 1600;

  const campoNome = document.getElementById('campo-nome');

  /** O seletor de arquivos com as estrelas e os relogios (seletor.js). */
  const seletor = window.Blink.seletor.criar(document.getElementById('seletor-arquivo'), {
    valorNovo: NOVO,
    rotuloNovo: '+ Criar nova nota',
    aoEscolher: (valor) => escolherArquivo(valor),
    aoMarcar: (valor) => alternarPrincipal(valor),
    aoAlternarHistorico: (valor) => alternarHistorico(valor),
    aoAlternarPrivado: (valor) => alternarPrivado(valor),
    aoAlternarLivre: (valor) => alternarLivre(valor),
    // A lista, o calendario e as confirmacoes nunca ficam abertos juntos.
    aoAbrir: () => { fecharPopovers(); calendario.fechar(); },
  });
  const calendarioEl = document.getElementById('calendario-historico');
  /** O calendario do historico diario (calendario.js). So aparece com o
   * relogio ligado no arquivo aberto. */
  const calendario = window.Blink.calendario.criar(calendarioEl, {
    aoEscolher: (data) => {
      dataSelecionada = data;
      recemCriado = null;
      desenhar();
      rascunho.focus();
    },
    aoAbrir: () => { seletor.fechar(); fecharPopovers(); },
  });
  const lista = document.getElementById('lista');
  const folhaEl = document.getElementById('folha-livre');
  const areaRascunho = document.getElementById('area-rascunho');
  const rascunho = document.getElementById('rascunho');
  const dica = document.getElementById('dica');
  const botaoCopiar = document.getElementById('btn-copiar');
  const botaoLimpar = document.getElementById('btn-limpar');
  const botaoExcluir = document.getElementById('btn-excluir');
  const popoverLimpar = document.getElementById('popover-limpar');
  const popoverExcluir = document.getElementById('popover-excluir');
  const popoverDaily = document.getElementById('popover-daily');
  const perguntaLimpar = document.getElementById('pergunta-limpar');
  const perguntaExcluir = document.getElementById('pergunta-excluir');

  /**
   * Titulo de um topico recolhivel da daily: a primeira linha comeca com isto.
   * Quem gera e o processo principal, ao concluir uma tarefa no modo "Daily com
   * topico" (notas.js, PREFIXO_RECOLHIVEL); as linhas seguintes sao o corpo.
   */
  const PREFIXO_RECOLHIVEL = String.fromCharCode(0x25b8) + ' ';

  /**
   * O dia em que uma tarefa foi concluida fica escondido no fim do texto dela, no
   * task.md ("texto <!-- feita 2026-10-01 -->"). A tela NUNCA mostra isso: tira na
   * lista, na edicao e no botao copiar, e devolve ao salvar uma edicao.
   */
  const DATA_DA_CONCLUSAO = /[ \t]*<!-- feita (\d{4}-\d{2}-\d{2}) -->[ \t]*$/;
  const semData = (texto) => texto.replace(DATA_DA_CONCLUSAO, '');
  const comDataDe = (novo, original) => {
    const achou = DATA_DA_CONCLUSAO.exec(original);
    return achou ? `${novo} <!-- feita ${achou[1]} -->` : novo;
  };

  /** Os topicos recolhiveis abertos agora ("dia|titulo"): so na memoria, comecam todos fechados. */
  const recolhiveisAbertos = new Set();

  /** A tarefa que espera o "Remover mesmo assim?" da daily: { grupo, texto }. */
  let pendenteDaily = null;

  // --- Arquivos com cadeado ---------------------------------------------------------
  const telaSenha = document.getElementById('tela-senha');
  const nomePrivado = document.getElementById('nome-privado');
  const senhaAbrir = document.getElementById('senha-abrir');
  const erroAbrir = document.getElementById('erro-abrir');
  const botaoAbrirPrivado = document.getElementById('btn-abrir-privado');
  const barraPrivado = document.getElementById('barra-privado');
  const botaoCredencial = document.getElementById('btn-credencial');
  const modalPrivado = document.getElementById('modal-privado');
  const tituloPrivado = document.getElementById('titulo-privado');
  const textoPrivado = document.getElementById('texto-privado');
  const camposPrivado = document.getElementById('campos-privado');
  const erroPrivado = document.getElementById('erro-privado');
  const botaoPrivadoOk = document.getElementById('btn-privado-ok');
  const botaoPrivadoCancelar = document.getElementById('btn-privado-cancelar');

  /** Arquivos com cadeado (o processo principal reconhece pelo cabecalho do arquivo). */
  let privados = [];

  /**
   * O arquivo aberto e privado E esta aberto agora (a senha foi digitada)? So nesse estado os topicos
   * estao na memoria da tela; ao trocar de arquivo, minimizar ou fechar, tudo e apagado.
   */
  let desbloqueado = false;

  /**
   * O que o olhinho ja mostrou, ate trancar: id da credencial -> { login, senha }. A tela so conhece o
   * login e a senha de uma credencial depois de o usuario digitar a senha do arquivo de novo.
   */
  const revelados = new Map();

  /** A pergunta de senha aberta agora ({ cancelar }), ou null. */
  let modalAberto = null;

  /**
   * "/" no rascunho abre a lista de notas (autocompletar.js). Ligado aqui,
   * antes do tratador de Enter la embaixo: com a lista aberta o Enter
   * completa o nome, e nao pode gravar o topico.
   */
  window.Blink.autocompletar.ligar(rascunho, document.getElementById('popup-notas'), {
    obterNomes: () => {
      // Arquivo com cadeado fora da lista do "/": nada se escreve nele sem a senha.
      const nomes = arquivos.filter((a) => !ehPrivado(a)).map((a) => a.replace(/\.md$/i, ''));
      // O "task" aparece mesmo antes do task.md existir: o /task cria.
      if (!nomes.some((n) => n.toLowerCase() === 'task')) nomes.push('task');
      return nomes;
    },
  });

  /** Pasta configurada, so para mostrar na dica. */
  let pasta = '';

  /** Nome do arquivo de tarefas. Vem do processo principal. */
  let arquivoTarefas = 'task.md';

  /** Os .md da pasta, na ordem do seletor. */
  let arquivos = [];

  /** O arquivo da estrela, que o Ctrl+Alt+N abre. '' = nenhum. */
  let principal = '';

  /** Arquivos com o relogio (historico diario) ligado. */
  let historico = [];

  /** Arquivos em folha livre. */
  let livres = [];

  /** A folha (folha.js), criada na primeira vez que um arquivo em folha livre abre. */
  let folha = null;

  /** O modo em que a janela foi posta pela ultima vez (true = folha livre); null = ainda nao disse. */
  let modoDaJanela = null;

  /** Arquivo escolhido agora, ou NOVO. */
  let arquivo = NOVO;

  /** Notas comuns, na ordem da TELA: o mais novo primeiro. */
  let topicos = [];

  /** Tarefas do task.md, tambem na ordem da tela. */
  let tarefas = { pendentes: [], concluidas: [] };

  /** Dias do arquivo de historico aberto: [{ data, topicos }], topicos na ordem da tela. */
  let diasHistorico = [];

  /** O dia mostrado agora, "AAAA-MM-DD", quando ehHistorico(). */
  let dataSelecionada = '';

  /** O item recem-criado, para ele piscar: { grupo, indice } ou null. */
  let recemCriado = null;

  /** Arrastar para reordenar: { grupo, indice, item } de quem esta sendo arrastado. */
  let arrastando = null;
  let alvo = null;

  /** Um item esta sendo editado agora? So um de cada vez. */
  let editando = false;

  /**
   * O que a confirmacao da vassoura limpa: 'tudo' (a vassoura do topo) ou
   * 'concluidas' (a cinza, ao lado de "Concluidas").
   */
  let limparModo = 'tudo';

  // --- Ajudantes --------------------------------------------------------------

  /** O arquivo aberto e o de tarefas? Sem diferenciar maiuscula. */
  function ehTarefas() {
    return arquivo !== NOVO && arquivo.toLowerCase() === arquivoTarefas;
  }

  /** O arquivo aberto tem o relogio (historico diario) ligado? */
  function ehHistorico() {
    return arquivo !== NOVO && historico.some((h) => h.toLowerCase() === arquivo.toLowerCase());
  }

  /** O arquivo (por padrao, o aberto) tem cadeado? Sem diferenciar maiuscula. */
  function ehPrivado(nome = arquivo) {
    return nome !== NOVO && privados.some((p) => p.toLowerCase() === nome.toLowerCase());
  }

  /** O arquivo (por padrao, o aberto) esta em folha livre? Sem diferenciar maiuscula. */
  function ehLivre(nome = arquivo) {
    return nome !== NOVO && livres.some((l) => l.toLowerCase() === nome.toLowerCase());
  }

  /** A folha, criada na hora do primeiro uso (o Quill so e montado quando alguem liga uma folha). */
  function obterFolha() {
    if (!folha) {
      folha = window.Blink.folha.criar(folhaEl, {
        // O desenho e o texto gravam pouco depois de a ultima mudanca (o atraso e da folha).
        aoMudar: () => folha.salvarAgora(),
        aoAviso: (texto) => avisarNaDica(texto),
        obterArquivo: () => (ehLivre() ? arquivo : ''),
      });
    }
    return folha;
  }

  /** Grava o que mudou na folha aberta, se ha uma. Antes de sair dela. */
  async function salvarFolha() {
    if (folha && folha.aberta()) await folha.salvarAgora();
  }

  /** Sai da folha: grava o que faltava e a esvazia da tela. */
  async function sairDaFolha() {
    if (!folha) return;
    await salvarFolha();
    folha.esvaziar();
  }

  /** Arquivo com cadeado que ainda nao foi aberto com a senha: a tela mostra a senha no lugar da lista. */
  function privadoTrancado() {
    return ehPrivado() && !desbloqueado;
  }

  /**
   * Um item de um arquivo privado na tela: texto (string, como as outras notas) ou uma credencial
   * ({ credencial: true, id, titulo } - SEM login nem senha, que so o olhinho traz).
   */
  const ehCredencial = (item) => item !== null && typeof item === 'object' && item.credencial === true;

  /** O que o processo principal entende de um item da tela. */
  const paraOProcessoPrincipal = (item) => (ehCredencial(item) ? { tipo: 'credencial', id: item.id } : { tipo: 'texto', texto: item });

  /** Os itens que o processo principal devolve (na ordem do arquivo) para a lista da tela (invertida). */
  function aplicarItensPrivados(itens) {
    topicos = itens.map((i) => (i.tipo === 'credencial' ? { credencial: true, id: i.id, titulo: i.titulo } : i.texto)).reverse();
  }

  /**
   * Antes de sair de um arquivo privado aberto (trocar de arquivo, "/outra nota", tarefas): tranca nele e
   * apaga o conteudo da memoria da tela. Quem chama redesenha.
   */
  function trancarAoSair(novo) {
    if (!ehPrivado() || !desbloqueado) return;
    if (novo !== undefined && novo.toLowerCase() === arquivo.toLowerCase()) return;
    window.blink.privado.trancar(arquivo);
    esquecerSegredos();
  }

  /** Apaga da memoria o conteudo do arquivo privado e o que o olhinho mostrou. */
  function esquecerSegredos() {
    desbloqueado = false;
    topicos = [];
    revelados.clear();
  }

  /** A data de hoje, "AAAA-MM-DD" - mesmo formato usado no arquivo. */
  function dataDeHoje() {
    const agora = new Date();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${agora.getFullYear()}-${mes}-${dia}`;
  }

  /** "AAAA-MM-DD" -> "DD/MM/AAAA", so para mostrar numa pergunta. */
  function formatarDataBR(data) {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  /**
   * Os topicos do dia selecionado, na ordem da tela. Cria o "balde" do dia
   * na hora se ele ainda nao existe - assim apagar/editar/arrastar sempre
   * mexem na referencia certa dentro de diasHistorico.
   */
  function historicoAtual() {
    let dia = diasHistorico.find((d) => d.data === dataSelecionada);
    if (!dia) {
      dia = { data: dataSelecionada, topicos: [] };
      diasHistorico.push(dia);
    }
    return dia.topicos;
  }

  /** A lista que um grupo representa. */
  function listaDo(grupo) {
    if (grupo === 'topicos') return topicos;
    if (grupo === 'historico') return historicoAtual();
    return tarefas[grupo];
  }

  function totalDeItens() {
    if (ehTarefas()) return tarefas.pendentes.length + tarefas.concluidas.length;
    if (ehHistorico()) return historicoAtual().length;
    return topicos.length;
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
    diasHistorico = [];
    if (arquivo === NOVO) return;

    // Arquivo com cadeado: nada se le do disco aqui. Ele abre pela tela da senha (abrirPrivado).
    if (ehPrivado()) return;

    // Folha livre: o texto e o desenho vao para o editor; a lista de topicos fica vazia.
    if (ehLivre()) {
      const lida = await window.blink.livre.ler(arquivo);
      obterFolha().abrir(arquivo, lida || { conteudo: { ops: [{ insert: '\n' }] }, tinta: [] });
      return;
    }

    if (ehTarefas()) {
      const lido = await window.blink.notas.lerTarefas();
      tarefas = { pendentes: lido.pendentes.reverse(), concluidas: lido.concluidas.reverse() };
      return;
    }

    if (ehHistorico()) {
      const { dias } = await window.blink.notas.lerHistorico(arquivo);
      diasHistorico = dias.map((d) => ({ data: d.data, topicos: [...d.topicos].reverse() }));
      if (!dataSelecionada) dataSelecionada = dataDeHoje();
      return;
    }

    const { topicos: doArquivo } = await window.blink.notas.ler(arquivo);
    topicos = doArquivo.reverse();
  }

  /** Manda o que esta na tela para o disco, de volta na ordem do arquivo. */
  async function gravar() {
    if (arquivo === NOVO) return;

    // Arquivo privado: o processo principal cifra e grava (so com ele aberto). A credencial vai so pelo id.
    if (ehPrivado()) {
      if (!desbloqueado) return;
      await window.blink.privado.salvar(arquivo, [...topicos].reverse().map(paraOProcessoPrincipal));
      return;
    }

    if (ehTarefas()) {
      await window.blink.notas.salvarTarefas({
        pendentes: [...tarefas.pendentes].reverse(),
        concluidas: [...tarefas.concluidas].reverse(),
      });
      return;
    }

    if (ehHistorico()) {
      await window.blink.notas.salvarDiaHistorico(arquivo, dataSelecionada, [...historicoAtual()].reverse());
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
    historico = estado.historico;
    privados = estado.privados || [];
    livres = estado.livres || [];
    desenharSelect(estado.arquivos);
    return estado.arquivos;
  }

  // --- Desenho ----------------------------------------------------------------

  function desenharSelect(lista) {
    arquivos = lista;
    atualizarSeletor();
  }

  /** Mostra no seletor o arquivo aberto, a estrela e o relogio, sem reler a pasta. */
  function atualizarSeletor() {
    seletor.definir({ arquivos, atual: arquivo, principal, historico, privados, livres, arquivoTarefas });
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

  /**
   * Clicou no relogio: liga ou desliga o historico diario do arquivo. Pode
   * haver varios arquivos com o relogio ligado ao mesmo tempo - diferente
   * da estrela, aqui nao ha "so um por vez".
   */
  async function alternarHistorico(nome) {
    const ligado = historico.some((h) => h.toLowerCase() === nome.toLowerCase());
    const gravou = await window.blink.notas.definirHistorico(nome, !ligado);
    if (!gravou) return;

    historico = ligado
      ? historico.filter((h) => h.toLowerCase() !== nome.toLowerCase())
      : [...historico, nome];
    atualizarSeletor();

    // Se era o arquivo aberto, a tela precisa recarregar no novo modo.
    if (arquivo.toLowerCase() === nome.toLowerCase()) {
      dataSelecionada = dataDeHoje();
      await carregar();
      desenhar();
    }
  }

  /** A mensagem de uma recusa ao ligar a folha livre. */
  function mensagemDaFolha(r) {
    switch (r && r.motivo) {
      case 'tarefas': return 'O arquivo de tarefas não pode ser folha livre.';
      case 'historico': return 'Desligue o histórico diário deste arquivo antes de ligar a folha livre.';
      case 'privado': return 'Tire o cadeado deste arquivo antes de ligar a folha livre.';
      case 'inexistente': return 'O arquivo não existe mais.';
      case 'nao-livre': return 'Este arquivo não está em folha livre.';
      default: return 'Não foi possível concluir.';
    }
  }

  /**
   * Clicou na folha: liga ou desliga a folha livre do arquivo. Ligar cria a folha com os topicos do .md como
   * lista (ou volta a que ja existia); desligar volta aos topicos e a folha fica guardada no disco, para quando
   * ligar de novo. O .md nunca muda.
   */
  async function alternarLivre(nome) {
    seletor.fechar();
    const eOAberto = () => nome.toLowerCase() === arquivo.toLowerCase();
    const ligado = ehLivre(nome);

    // Desligando a folha que esta na tela: grava o que faltava antes.
    if (ligado && eOAberto()) await salvarFolha();

    const r = ligado ? await window.blink.livre.desativar(nome) : await window.blink.livre.ativar(nome);
    if (!r.ok) {
      avisarNaDica(mensagemDaFolha(r));
      return;
    }

    if (ligado && eOAberto() && folha) folha.esvaziar();
    await recarregarSeletor();

    // Se era o arquivo aberto, a tela recarrega no novo modo.
    if (eOAberto()) {
      await carregar();
      desenhar();
      focarOndeSeEscreve();
    }
    avisarNaDica(ligado ? 'Folha desligada: o arquivo voltou aos tópicos (a folha fica guardada).' : 'Folha livre ligada.');
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
    const ehTarefa = grupo === 'pendentes' || grupo === 'concluidas';
    const feita = grupo === 'concluidas';
    const piscando = recemCriado && recemCriado.grupo === grupo && recemCriado.indice === indice;

    const classes = ['topico'];
    if (piscando) classes.push('novo');
    if (ehTarefa) classes.push('tarefa', feita ? 'feita' : 'pendente');

    // Topico recolhivel da daily (gerado ao concluir uma tarefa): titulo com seta e as anotacoes embaixo.
    if (grupo === 'historico' && texto.startsWith(PREFIXO_RECOLHIVEL)) return montarRecolhivel(indice, texto, piscando);

    const item = el('div', { class: classes.join(' '), draggable: 'true' });

    // A data escondida de uma tarefa feita nunca aparece: nem na lista nem no campo de edicao.
    const mostrado = ehTarefa ? semData(texto) : texto;

    const spanTexto = el('span', {
      class: 'texto',
      texto: mostrado,
      title: 'Clique para editar',
      onclick: (evento) =>
        editar(
          evento.currentTarget,
          item,
          mostrado,
          async (novoTexto) => {
            // Editar nao pode perder a data em que a tarefa foi concluida: ela volta ao salvar.
            listaDo(grupo)[indice] = ehTarefa ? comDataDe(novoTexto, texto) : novoTexto;
            await gravar();
          },
          // O cursor entra no ponto em que se clicou - nao no fim do texto.
          posicaoDoClique(evento)
        ),
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

  /**
   * Topico recolhivel da daily (gerado ao concluir uma tarefa no modo "Daily com
   * topico"): o titulo com uma seta e, embaixo, as anotacoes. A seta abre e fecha
   * (comeca fechado; o estado so vive na memoria); as anotacoes gravam sozinhas,
   * pouco depois de parar de digitar e ao sair do campo. O titulo se edita com um
   * clique, e apagar e arrastar funcionam como em qualquer topico.
   */
  function montarRecolhivel(indice, texto, piscando) {
    const linhasDoTopico = texto.split('\n');
    const titulo = linhasDoTopico[0].slice(PREFIXO_RECOLHIVEL.length);
    const corpo = linhasDoTopico.slice(1).join('\n');
    const chave = `${dataSelecionada}|${titulo}`;

    const item = el('div', { class: `topico recolhivel${piscando ? ' novo' : ''}`, draggable: 'true' });

    const campoCorpo = el('textarea', {
      class: 'corpo-recolhivel',
      rows: '1',
      spellcheck: 'false',
      placeholder: 'Anotações…',
      'aria-label': 'Anotações do tópico',
    });
    campoCorpo.value = corpo;
    campoCorpo.hidden = !recolhiveisAbertos.has(chave);

    const seta = el('button', { class: 'seta-recolher', type: 'button' });
    const pintarSeta = () => {
      const aberto = !campoCorpo.hidden;
      seta.textContent = aberto ? String.fromCharCode(0x25be) : String.fromCharCode(0x25b8);
      seta.title = aberto ? 'Esconder as anotações' : 'Mostrar as anotações';
      seta.setAttribute('aria-label', seta.title);
      seta.setAttribute('aria-expanded', String(aberto));
      seta.classList.toggle('tem-corpo', campoCorpo.value.trim() !== '');
    };
    pintarSeta();

    seta.addEventListener('click', () => {
      const abrir = campoCorpo.hidden;
      campoCorpo.hidden = !abrir;
      if (abrir) recolhiveisAbertos.add(chave);
      else recolhiveisAbertos.delete(chave);
      pintarSeta();
      if (abrir) {
        ajustarAltura(campoCorpo);
        campoCorpo.focus({ preventScroll: true });
      }
    });

    // Gravar o corpo: o topico inteiro volta ao dia com o titulo de sempre.
    let relogio = null;
    async function salvarCorpo() {
      clearTimeout(relogio);
      relogio = null;
      const itens = listaDo('historico');
      // A tela pode ter sido redesenhada (outro topico apagado, arrastado): confere que o indice ainda e este topico.
      if (typeof itens[indice] !== 'string' || itens[indice].split('\n')[0] !== PREFIXO_RECOLHIVEL + titulo) return;

      const novoCorpo = campoCorpo.value.replace(/\s+$/, '');
      const novoTexto = PREFIXO_RECOLHIVEL + titulo + (novoCorpo !== '' ? '\n' + novoCorpo : '');
      if (itens[indice] === novoTexto) return;
      itens[indice] = novoTexto;
      await gravar();
    }

    campoCorpo.addEventListener('focus', () => {
      editando = true;
      item.draggable = false;
    });
    campoCorpo.addEventListener('blur', () => {
      editando = false;
      item.draggable = true;
      salvarCorpo();
    });
    campoCorpo.addEventListener('input', () => {
      ajustarAltura(campoCorpo);
      pintarSeta();
      clearTimeout(relogio);
      relogio = setTimeout(salvarCorpo, 600);
    });
    campoCorpo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Tab') {
        indentarComTab(campoCorpo, evento);
      } else if (evento.key === 'Escape') {
        // So sai do campo: sem isto o Esc minimizaria a janela.
        evento.preventDefault();
        evento.stopPropagation();
        campoCorpo.blur();
      }
    });

    const spanTitulo = el('span', {
      class: 'texto',
      texto: titulo,
      title: 'Clique para editar o título',
      onclick: (evento) =>
        editar(
          evento.currentTarget,
          item,
          titulo,
          async (novo) => {
            // Um titulo e uma linha so: quebras viram espaco (o que vem depois da 1a linha seria o corpo).
            const novoTitulo = novo.replace(/\s*\n\s*/g, ' ').trim();
            if (recolhiveisAbertos.delete(chave)) recolhiveisAbertos.add(`${dataSelecionada}|${novoTitulo}`);
            const corpoAgora = campoCorpo.value.replace(/\s+$/, '');
            listaDo('historico')[indice] = PREFIXO_RECOLHIVEL + novoTitulo + (corpoAgora !== '' ? '\n' + corpoAgora : '');
            await gravar();
          },
          posicaoDoClique(evento)
        ),
    });

    window.Blink.ui.anexar(item, [
      el('span', { class: 'alca', texto: '⋮⋮' }),
      el('div', { class: 'corpo-topico caixa-recolhivel' }, [el('div', { class: 'linha-titulo' }, [seta, spanTitulo]), campoCorpo]),
      el('button', {
        class: 'botao-apagar',
        texto: '×',
        title: 'Apagar tópico',
        onclick: () => apagar('historico', indice),
      }),
    ]);

    // Aberto desde o desenho: a altura so da para medir depois de o item estar na tela.
    if (!campoCorpo.hidden) setTimeout(() => { if (campoCorpo.isConnected) ajustarAltura(campoCorpo); }, 0);

    ligarArrasto(item, 'historico', indice);
    return item;
  }

  /**
   * A vassoura cinza do divisor "Concluidas": a mesma vassoura do topo, na cor
   * das concluidas, alinhada com a coluna do X de cada tarefa.
   */
  const VASSOURA_CINZA =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<line x1="18" y1="2" x2="12.2" y2="12" stroke="#d3d5dc" stroke-width="2" stroke-linecap="round"></line>' +
    '<path d="M9 11 L15.5 11 L18.5 21 L5.5 21 Z" fill="#d3d5dc"></path>' +
    '<rect x="9" y="10.2" width="6.5" height="2" rx="0.6" fill="#3a3d49"></rect>' +
    '<line x1="9.7" y1="13.2" x2="8" y2="21" stroke="#7d8190" stroke-width="1"></line>' +
    '<line x1="12.3" y1="13.2" x2="12" y2="21" stroke="#7d8190" stroke-width="1"></line>' +
    '<line x1="14.9" y1="13.2" x2="16.3" y2="21" stroke="#7d8190" stroke-width="1"></line>' +
    '</svg>';

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
      const vassoura = el('button', {
        class: 'botao-acao cinza botao-limpar-concluidas',
        type: 'button',
        title: 'Limpar as tarefas concluídas',
        'aria-label': 'Limpar as tarefas concluídas',
        onclick: () => {
          limparModo = 'concluidas';
          perguntaLimpar.textContent = 'Limpar todas as tarefas concluídas?';
          alternarPopover(popoverLimpar);
        },
      });
      vassoura.appendChild(svg(VASSOURA_CINZA));

      lista.appendChild(
        el('div', { class: 'divisor-tarefas' }, [el('span', { texto: `Concluídas (${concluidas.length})` }), vassoura])
      );
      concluidas.forEach((texto, indice) => lista.appendChild(montarItem('concluidas', indice, texto)));
    }
  }

  /**
   * Desenha a lista. Por padrao ela volta para o topo (item novo, outro
   * arquivo, outro dia); com `manter`, fica onde o usuario estava - editar,
   * apagar, concluir e reordenar nao podem empurrar a tela para o alto num
   * arquivo grande.
   */
  function desenharLista(manter = false) {
    const rolagem = lista.scrollTop;
    montarLista();
    lista.scrollTop = manter ? rolagem : 0;
  }

  function montarLista() {
    limpar(lista);

    if (ehTarefas()) {
      desenharTarefas();
      return;
    }

    const grupo = ehHistorico() ? 'historico' : 'topicos';
    const itens = listaDo(grupo);

    if (arquivo === NOVO || itens.length === 0) {
      vazio(ehHistorico() ? 'Nenhum tópico neste dia — escreva abaixo.' : 'Nenhum tópico ainda — escreva abaixo.');
      return;
    }

    // Num arquivo privado a lista mistura textos e credenciais.
    itens.forEach((item, indice) => lista.appendChild(ehCredencial(item) ? montarCredencial(indice, item) : montarItem(grupo, indice, item)));
  }

  function desenharDica() {
    const partes = [
      ehLivre() ? 'Folha livre · / abre os blocos · Esc volta ao texto' : ehTarefas() ? 'Enter adiciona uma tarefa' : 'Enter adiciona · / manda para outra nota',
    ];
    if (pasta) partes.push(`Pasta: ${pasta}`);
    dica.textContent = partes.join(' · ');
    dica.title = dica.textContent;

    rascunho.placeholder = privadoTrancado()
      ? 'Arquivo com cadeado: abra com a senha'
      : ehTarefas()
        ? 'Escreva uma tarefa…'
        : 'Escreva e pressione Enter…';
  }

  function desenhar({ manter = false } = {}) {
    campoNome.hidden = arquivo !== NOVO;

    // Arquivo privado ainda fechado: a senha no lugar da lista, e nada de escrever.
    const trancado = privadoTrancado();
    // Folha livre: o editor de pagina no lugar da lista e do rascunho.
    const livre = ehLivre();
    telaSenha.hidden = !trancado;
    lista.hidden = trancado || livre;
    folhaEl.hidden = !livre;
    areaRascunho.hidden = livre;
    barraPrivado.hidden = !(ehPrivado() && desbloqueado);
    rascunho.disabled = trancado;
    if (trancado) nomePrivado.textContent = arquivo;

    // O copiar segue a vassoura: sem nada para copiar, fica apagado. Na folha ele fica sempre aceso (o texto muda
    // sem a tela ser redesenhada); sem texto, avisa.
    botaoCopiar.disabled = arquivo === NOVO || (!livre && totalDeItens() === 0) || trancado;
    botaoCopiar.title = ehHistorico()
      ? `Copiar as anotações do dia ${formatarDataBR(dataSelecionada)}`
      : livre
        ? 'Copiar o texto da folha'
        : 'Copiar todas as anotações';
    botaoLimpar.disabled = arquivo === NOVO || (!livre && totalDeItens() === 0) || trancado;
    botaoExcluir.disabled = arquivo === NOVO;
    if (botaoLimpar.disabled) popoverLimpar.hidden = true;
    if (botaoExcluir.disabled) popoverExcluir.hidden = true;

    calendarioEl.hidden = !ehHistorico();
    if (ehHistorico()) {
      calendario.definir({
        atual: dataSelecionada,
        datas: diasHistorico.filter((d) => d.topicos.length > 0).map((d) => d.data),
      });
    }

    desenharLista(manter);
    desenharDica();

    // A janela tem um tamanho para a nota comum e outro para a folha: avisa o processo principal quando muda.
    if (livre !== modoDaJanela) {
      modoDaJanela = livre;
      window.blink.janela.modoNota(livre);
    }
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
      if (!editando) desenharLista(true);
    }, TEMPO_PISCANDO);
  }

  // --- Acoes ------------------------------------------------------------------

  /** Troca o arquivo mostrado e carrega o conteudo dele. */
  async function escolherArquivo(valor) {
    // Saindo de uma folha livre: grava o que faltava antes de trocar de arquivo.
    if (folha && folha.aberta()) await sairDaFolha();
    // Saindo de um arquivo com cadeado aberto: tranca e apaga o conteudo da memoria.
    trancarAoSair(valor);
    fecharModalPrivado();
    arquivo = valor;
    fecharPopovers();
    calendario.fechar();
    recemCriado = null;
    atualizarSeletor();

    if (arquivo === NOVO) {
      topicos = [];
      tarefas = { pendentes: [], concluidas: [] };
      diasHistorico = [];
      campoNome.value = '';
      desenhar();
      campoNome.focus();
      return;
    }

    lembrarArquivo();

    // Trocar de arquivo sempre volta o calendario para hoje.
    if (ehHistorico()) dataSelecionada = dataDeHoje();

    await carregar();
    desenhar();
    focarOndeSeEscreve();
  }

  /** O foco vai para onde o usuario escreve: a senha, num arquivo com cadeado fechado; senao o campo de escrita. */
  function focarOndeSeEscreve() {
    if (privadoTrancado()) {
      senhaAbrir.value = '';
      erroAbrir.hidden = true;
      senhaAbrir.focus();
    } else if (ehLivre()) {
      obterFolha().focar();
    } else {
      rascunho.focus();
    }
  }

  /**
   * Guarda o arquivo aberto como o "ultimo": sem estrela, e nele que o
   * Fast Note abre da proxima vez. Guarda a cada troca, e nao so ao fechar -
   * o Ctrl+Alt+N com a janela aberta recarrega a tela (janelas.abrirNota),
   * e o recarregamento tem que cair no arquivo que estava na tela.
   *
   * "Criar nova nota" ainda nao e um arquivo, entao nao entra.
   */
  function lembrarArquivo() {
    if (arquivo === NOVO) return;
    window.blink.notas.definirUltima(arquivo);
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

    trancarAoSair(arquivoTarefas);
    arquivo = arquivoTarefas;
    lembrarArquivo();
    await recarregarSeletor();
    await carregar();

    recemCriado = texto !== '' ? { grupo: 'pendentes', indice: 0 } : null;
    desenhar();
    rascunho.focus();
    if (recemCriado) agendarFimDoPiscar();
  }

  /**
   * Entende um "/nota texto" no comeco do rascunho.
   *
   * Procura o nome de arquivo MAIS LONGO que venha logo depois da barra,
   * seguido de espaco ou do fim - assim nomes com espaco funcionam:
   * "/anotacoes da sprint rever PR" vai para "anotacoes da sprint.md", e nao
   * para uma "anotacoes.md" que exista tambem. Sem diferenciar maiuscula nem
   * acento, como o filtro da lista.
   *
   * Devolve null se o rascunho nao comeca com "/", senao
   *   { arquivo, texto, tarefas }   quando achou a nota
   *   { desconhecido: nome }        quando nenhuma nota tem esse nome
   */
  function interpretarComando(bruto) {
    if (!bruto.startsWith('/')) return null;

    const depois = bruto.slice(1);
    const { normalizar } = window.Blink.autocompletar;

    // O "task" vale mesmo antes do task.md existir: o /task cria. Arquivo com cadeado nao entra: nada se escreve
    // nele sem a senha ("/privada texto" cai em "nenhuma nota chamada").
    const candidatos = arquivos.filter((a) => !ehPrivado(a)).map((a) => ({ nome: a.replace(/\.md$/i, ''), arquivo: a }));
    if (!candidatos.some((c) => c.arquivo.toLowerCase() === arquivoTarefas)) {
      candidatos.push({ nome: 'task', arquivo: arquivoTarefas });
    }
    candidatos.sort((a, b) => b.nome.length - a.nome.length);

    for (const candidato of candidatos) {
      const tamanho = candidato.nome.length;
      const seguinte = depois.charAt(tamanho);
      if (
        normalizar(depois.slice(0, tamanho)) === normalizar(candidato.nome) &&
        (seguinte === '' || /\s/.test(seguinte))
      ) {
        return {
          arquivo: candidato.arquivo,
          texto: depois.slice(tamanho).trim(),
          tarefas: candidato.arquivo.toLowerCase() === arquivoTarefas,
        };
      }
    }

    return { desconhecido: depois.split(/\s/)[0] };
  }

  /** Recado passageiro no lugar da dica do rodape. */
  let fimDoAviso = null;
  function avisarNaDica(texto) {
    clearTimeout(fimDoAviso);
    dica.textContent = texto;
    dica.title = texto;
    dica.classList.add('aviso');
    fimDoAviso = setTimeout(() => {
      dica.classList.remove('aviso');
      desenharDica();
    }, 3500);
  }

  /**
   * Grava um topico numa nota comum (ou no dia certo, se o destino tiver o
   * relogio ligado) e mostra ela, com o topico novo piscando. Texto vazio
   * so troca para a nota.
   */
  async function gravarTopico(destino, texto) {
    if (texto === '') {
      await escolherArquivo(destino);
      return true;
    }

    const destinoHistorico = historico.some((h) => h.toLowerCase() === destino.toLowerCase());
    // Escrevendo no proprio arquivo de historico aberto, respeita o dia que
    // esta selecionado no calendario; vindo de outro lugar (um "/nome" para
    // um arquivo que nao e o aberto), nao ha "dia selecionado" para ele - e
    // sempre hoje.
    const mesmoArquivoAberto = arquivo.toLowerCase() === destino.toLowerCase();
    const data = destinoHistorico && mesmoArquivoAberto ? dataSelecionada : dataDeHoje();

    const gravado = destinoHistorico
      ? (await window.blink.notas.adicionarHistorico(destino, data, texto)) && destino
      : await window.blink.notas.adicionar(destino, texto);
    if (!gravado) return false;

    trancarAoSair(gravado);
    arquivo = gravado;
    lembrarArquivo();
    await recarregarSeletor();
    if (destinoHistorico) dataSelecionada = data;
    await carregar();

    // O mais novo e sempre o primeiro da tela.
    recemCriado = { grupo: destinoHistorico ? 'historico' : 'topicos', indice: 0 };
    desenhar();
    focarOndeSeEscreve();
    agendarFimDoPiscar();
    return true;
  }

  /**
   * Grava o que esta no rascunho.
   *
   *   "/nota texto"  grava na nota e troca para ela (/task: nas tarefas)
   *   "/nota"        so troca para a nota
   *   "/inexistente" nao grava nada: avisa e deixa o texto no campo
   *   texto normal   grava no arquivo aberto
   */
  async function adicionar() {
    const bruto = rascunho.value.trim();
    if (bruto === '') return;

    const comando = interpretarComando(bruto);

    if (comando && comando.desconhecido !== undefined) {
      // Um erro de digitacao nao pode virar arquivo novo nem se perder:
      // o texto fica no campo para corrigir.
      avisarNaDica(
        comando.desconhecido === ''
          ? 'Escreva o nome de uma nota depois da barra'
          : `Nenhuma nota chamada ${comando.desconhecido}`
      );
      return;
    }

    if (comando) {
      rascunho.value = '';
      if (comando.tarefas) await adicionarTarefa(comando.texto);
      else await gravarTopico(comando.arquivo, comando.texto);
      return;
    }

    if (ehTarefas()) {
      rascunho.value = '';
      await adicionarTarefa(bruto);
      return;
    }

    // Arquivo com cadeado: grava pelo processo principal, cifrado (so com o arquivo aberto).
    if (ehPrivado()) {
      if (!desbloqueado) return;
      rascunho.value = '';
      const r = await window.blink.privado.adicionarTexto(arquivo, bruto);
      if (!r.ok) {
        avisarNaDica(mensagemDoCadeado(r));
        rascunho.value = bruto;
        return;
      }
      aplicarItensPrivados(r.itens);
      recemCriado = { grupo: 'topicos', indice: 0 };
      desenhar();
      rascunho.focus();
      agendarFimDoPiscar();
      return;
    }

    const destino = arquivo === NOVO ? campoNome.value : arquivo;
    if (await gravarTopico(destino, bruto)) {
      rascunho.value = '';
    } else {
      campoNome.focus();
    }
  }

  async function apagar(grupo, indice) {
    listaDo(grupo).splice(indice, 1);
    recemCriado = null;
    desenhar({ manter: true });
    await gravar();
  }

  /**
   * Conclui uma tarefa, ou volta uma concluida para a fazer. Ela entra no
   * topo da outra secao, que na tela e onde o olho esta.
   */
  /** Dois cliques seguidos na bolinha: o segundo espera o primeiro (a lista muda de lugar no meio). */
  let alternando = false;

  async function alternarTarefa(grupo, indice, confirmado = false) {
    if (alternando) return;
    alternando = true;

    try {
      const itens = tarefas[grupo];
      const bruto = itens[indice];
      // Quem decide e o processo principal: confere a tarefa, move, poe ou tira a data escondida e mexe na
      // daily junto. O indice la e o da lista do arquivo, que e o inverso da tela.
      const resposta = await window.blink.notas.alternarTarefa(grupo, itens.length - 1 - indice, bruto, confirmado);

      // Tirar um topico recolhivel da daily que tem anotacoes: nada mudou ainda, pergunta antes.
      if (resposta.precisaConfirmar) {
        // Abre primeiro: o alternarPopover fecha as outras confirmacoes e zera o pendente.
        alternarPopover(popoverDaily);
        pendenteDaily = { grupo, texto: bruto };
        return;
      }

      if (resposta.tarefas) {
        tarefas = { pendentes: [...resposta.tarefas.pendentes].reverse(), concluidas: [...resposta.tarefas.concluidas].reverse() };
      }
      recemCriado = null;
      desenhar({ manter: true });

      if (!resposta.ok) {
        avisarNaDica('A lista tinha mudado, então atualizei. Tente de novo.');
        return;
      }

      const daily = resposta.daily || {};
      if (daily.acao === 'registrou') avisarNaDica(`Registrada na daily (${daily.arquivo.replace(/\.md$/i, '')}).`);
      else if (daily.acao === 'removeu') avisarNaDica('Removida da daily.');
      else if (daily.acao === 'nao-achou') {
        avisarNaDica(`Não achei esta tarefa na daily de ${formatarDataBR(daily.data)} (o texto foi mudado lá). Nada foi removido de lá.`);
      }
    } finally {
      alternando = false;
    }
  }

  /**
   * O texto do botao copiar: uma linha "- topico" por anotacao, NA ORDEM EM
   * QUE FORAM ESCRITAS (a tela mostra a mais nova primeiro, entao a lista e
   * invertida), com as quebras de linha de um topico indentadas por baixo.
   *
   *   - Com o relogio ligado, so o dia selecionado.
   *   - Nas tarefas, as pendentes e depois as concluidas, como caixinhas.
   *   - Nas notas comuns, o arquivo todo.
   *
   * Sai com CRLF, o padrao do Windows: cola direito no Bloco de Notas e no
   * e-mail.
   */
  function textoParaCopiar() {
    // Sem a data escondida das tarefas feitas e sem o "▸ " dos topicos recolhiveis (o corpo vai indentado, como
    // as outras linhas de um topico).
    const limpo = (t) => semData(t.startsWith(PREFIXO_RECOLHIVEL) ? t.slice(PREFIXO_RECOLHIVEL.length) : t);
    const linhas = (itens, marca) => itens.slice().reverse().map((t) => `- ${marca}${limpo(t).split('\n').join('\n  ')}`);

    let partes;
    if (ehTarefas()) {
      partes = [...linhas(tarefas.pendentes, '[ ] '), ...linhas(tarefas.concluidas, '[x] ')];
    } else if (ehHistorico()) {
      partes = linhas(historicoAtual(), '');
    } else {
      // Num arquivo privado, so os textos: uma credencial (login e senha) nunca vai para a area de
      // transferencia por aqui - e para isso que existe o copiar de cada campo, que limpa depois de 30 s.
      partes = linhas(topicos.filter((t) => typeof t === 'string'), '');
    }
    return { texto: partes.join('\n').split('\n').join('\r\n'), total: partes.length };
  }

  async function copiarNotas() {
    if (botaoCopiar.disabled) return;

    // Folha livre: o texto da folha (a tinta e as imagens nao vao para um texto).
    if (ehLivre()) {
      const texto = folha ? folha.texto() : '';
      if (texto.trim() === '') {
        avisarNaDica('A folha não tem texto para copiar.');
        return;
      }
      const gravou = await window.blink.areaTransferencia.escrever(texto.split('\n').join('\r\n'));
      avisarNaDica(gravou ? 'Texto da folha copiado.' : 'Não foi possível copiar.');
      return;
    }

    const { texto, total } = textoParaCopiar();
    if (total === 0) return;

    const gravou = await window.blink.areaTransferencia.escrever(texto);
    avisarNaDica(gravou ? `Copiada${total === 1 ? '' : 's'}: ${total} anotaç${total === 1 ? 'ão' : 'ões'}` : 'Não foi possível copiar.');
  }

  async function limparTudo() {
    fecharPopovers();
    recemCriado = null;

    // Folha livre: apaga o texto e o desenho (as imagens guardadas ficam no disco).
    if (ehLivre()) {
      if (folha && folha.aberta()) {
        folha.limpar();
        await folha.salvarAgora();
        folha.focar();
      }
      return;
    }

    // A vassoura cinza limpa so as concluidas; as pendentes ficam.
    if (ehTarefas() && limparModo === 'concluidas') {
      tarefas.concluidas = [];
      desenhar();
      await gravar();
      return;
    }

    if (ehTarefas()) {
      tarefas = { pendentes: [], concluidas: [] };
      desenhar();
      await gravar();
      return;
    }

    // No historico, a vassoura limpa so o dia selecionado - o arquivo
    // inteiro (todos os dias) so sai pela lixeira, que ja pede confirmacao
    // por perder muito mais.
    if (ehHistorico()) {
      const dia = diasHistorico.find((d) => d.data === dataSelecionada);
      if (dia) dia.topicos = [];
      desenhar();
      await window.blink.notas.salvarDiaHistorico(arquivo, dataSelecionada, []);
      return;
    }

    // Arquivo privado: limpa tudo, credenciais inclusive (o processo principal regrava o arquivo cifrado, vazio).
    if (ehPrivado()) {
      topicos = [];
      revelados.clear();
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

    // Um arquivo com cadeado vai para a Lixeira como qualquer outro (continua cifrado la): a sessao dele acaba.
    trancarAoSair(undefined);

    // Uma folha livre que vai para a Lixeira nao pode ser regravada por uma gravacao pendente: esvazia antes.
    if (folha && ehLivre()) folha.esvaziar();

    await window.blink.notas.excluir(arquivo);

    const estado = await window.blink.notas.estado();
    // Se o excluido era o principal (ou tinha o relogio ligado), o processo
    // principal ja tirou a marca.
    principal = estado.principal;
    historico = estado.historico;
    privados = estado.privados || [];
    livres = estado.livres || [];
    arquivo = primeiroArquivo(estado.arquivos);
    desenharSelect(estado.arquivos);
    await escolherArquivo(arquivo);
  }

  // --- Editar um item -----------------------------------------------------------

  /**
   * O campo de edicao cresce com o texto, como o proprio item cresce.
   *
   * Para medir, a altura vai para "auto" - e ai o campo encolhe, a lista fica
   * mais curta por um instante e o navegador corta a rolagem. Em arquivo grande
   * a tela pulava a cada tecla; a rolagem e guardada e devolvida na mesma hora
   * (sem pintar nada no meio).
   */
  function ajustarAltura(campo) {
    const rolagem = lista.scrollTop;

    campo.style.height = 'auto';
    campo.style.height = `${campo.scrollHeight}px`;

    // Ao crescer, a lista pode ganhar a barra de rolagem: o campo fica mais estreito e o texto quebra uma
    // linha a mais, e a altura medida ficou curta. Mede de novo SEM voltar a "auto" (que tiraria a barra e
    // repetiria o ciclo) - so cresce, entao termina. (A folga de 3px e o padding e a borda, que a altura de
    // border-box nao leva; uma linha a mais passa disso de longe.)
    for (let volta = 0; volta < 3 && campo.scrollHeight > campo.clientHeight + 3; volta++) {
      campo.style.height = `${campo.scrollHeight}px`;
    }
    lista.scrollTop = rolagem;
  }

  /**
   * Em que posicao do texto o clique caiu, ou null se nao der para saber.
   * Serve para o cursor entrar onde se clicou, em vez de ir para o fim - num
   * topico comprido o fim pode estar fora da tela, e o navegador rolaria ate
   * la na primeira tecla.
   */
  function posicaoDoClique(evento) {
    const alvo = evento.currentTarget;
    let no = null;
    let deslocamento = 0;

    if (document.caretRangeFromPoint) {
      const faixa = document.caretRangeFromPoint(evento.clientX, evento.clientY);
      if (faixa) {
        no = faixa.startContainer;
        deslocamento = faixa.startOffset;
      }
    } else if (document.caretPositionFromPoint) {
      const ponto = document.caretPositionFromPoint(evento.clientX, evento.clientY);
      if (ponto) {
        no = ponto.offsetNode;
        deslocamento = ponto.offset;
      }
    }

    return no && no.nodeType === Node.TEXT_NODE && alvo.contains(no) ? deslocamento : null;
  }

  /**
   * TAB indenta em vez de tirar o foco do campo.
   *
   *   Tab          poe uma tabulacao no cursor; com varias linhas selecionadas,
   *                no comeco de cada uma
   *   Shift+Tab    tira uma tabulacao (ou ate 4 espacos) do comeco da linha, ou
   *                de cada linha selecionada
   *
   * Pelo execCommand, e nao mexendo no value: assim o Ctrl+Z desfaz. Devolve
   * true se tratou a tecla.
   */
  function indentarComTab(campo, evento) {
    if (evento.key !== 'Tab' || evento.ctrlKey || evento.altKey || evento.metaKey || evento.defaultPrevented) return false;
    evento.preventDefault();

    const texto = campo.value;
    const inicio = campo.selectionStart;
    const fim = campo.selectionEnd;
    const variasLinhas = inicio !== fim && texto.slice(inicio, fim).includes('\n');

    // Tab simples, sem selecao de varias linhas: so insere.
    if (!evento.shiftKey && !variasLinhas) {
      document.execCommand('insertText', false, '\t');
      return true;
    }

    // As linhas tocadas pela selecao. Selecao que termina logo apos uma quebra
    // nao conta a linha seguinte (e assim que os editores fazem).
    const fimUtil = fim > inicio && texto[fim - 1] === '\n' ? fim - 1 : fim;
    const comeco = texto.lastIndexOf('\n', inicio - 1) + 1;
    let fimDoBloco = texto.indexOf('\n', fimUtil);
    if (fimDoBloco === -1) fimDoBloco = texto.length;

    const linhas = texto.slice(comeco, fimDoBloco).split('\n');
    const novas = linhas.map((linha) => {
      if (!evento.shiftKey) return '\t' + linha;
      if (linha.startsWith('\t')) return linha.slice(1);
      return linha.replace(/^ {1,4}/, '');
    });
    const novoBloco = novas.join('\n');
    if (novoBloco === texto.slice(comeco, fimDoBloco)) return true; // nada a tirar

    campo.setSelectionRange(comeco, fimDoBloco);
    document.execCommand('insertText', false, novoBloco);

    // Mantem selecionado o que estava: do mesmo comeco ate o novo fim do bloco
    // (sem selecao, o cursor fica na mesma linha, deslocado pelo que mudou).
    if (inicio === fim) {
      const mudou = novas[0].length - linhas[0].length;
      const pos = Math.max(comeco, inicio + mudou);
      campo.setSelectionRange(pos, pos);
    } else {
      campo.setSelectionRange(comeco, comeco + novoBloco.length);
    }
    return true;
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
  function editar(spanTexto, item, original, aoSalvar, posicao) {
    if (editando) return;
    editando = true;

    const campo = el('textarea', { class: 'campo-edicao', rows: '1', spellcheck: 'false' });
    campo.value = original;

    // Sem isto, selecionar texto dentro do campo arrastaria a linha inteira.
    item.draggable = false;
    item.classList.add('editando');

    // A tela fica exatamente onde esta: trocar o texto pelo campo muda a altura
    // do item, e o foco, por padrao, rola ate o cursor.
    const rolagem = lista.scrollTop;
    spanTexto.replaceWith(campo);
    ajustarAltura(campo);
    campo.focus({ preventScroll: true });
    const ponto = Number.isInteger(posicao) ? Math.min(posicao, campo.value.length) : campo.value.length;
    campo.setSelectionRange(ponto, ponto);
    lista.scrollTop = rolagem;

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
      desenhar({ manter: true });
    }

    campo.addEventListener('input', () => ajustarAltura(campo));
    campo.addEventListener('blur', () => terminar(true));
    campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Tab') {
        indentarComTab(campo, evento);
      } else if (evento.key === 'Enter' && !evento.shiftKey) {
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
    popoverDaily.hidden = true;
    pendenteDaily = null;
  }

  /** Abre uma confirmacao fechando a outra, ou fecha se ja estava aberta. */
  function alternarPopover(qual) {
    const abrir = qual.hidden;
    fecharPopovers();
    seletor.fechar();
    calendario.fechar();
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
      desenhar({ manter: true });
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
    // Tab indenta (com a lista do "/" aberta, quem trata e o autocomplete, que
    // ja marcou o evento como tratado).
    if (evento.key === 'Tab') {
      indentarComTab(rascunho, evento);
      return;
    }

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

  botaoCopiar.addEventListener('click', copiarNotas);

  botaoLimpar.addEventListener('click', () => {
    if (botaoLimpar.disabled) return;
    limparModo = 'tudo';
    // No historico a pergunta cita o dia: "limpar tudo" ali limpa so ele.
    perguntaLimpar.textContent = ehHistorico()
      ? `Limpar as notas do dia ${formatarDataBR(dataSelecionada)}?`
      : ehPrivado()
        ? 'Limpar tudo deste arquivo, as credenciais também?'
        : ehLivre()
          ? 'Limpar o texto e o desenho desta folha?'
          : 'Limpar todas as notas deste arquivo?';
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

  // "O topico na daily tem anotacoes. Remover mesmo assim?"
  document.getElementById('btn-daily-sim').addEventListener('click', async () => {
    const pendente = pendenteDaily;
    fecharPopovers();
    if (!pendente) return;
    // O indice pode ter mudado enquanto a pergunta estava aberta: acha a tarefa de novo pelo texto.
    const indice = tarefas[pendente.grupo].indexOf(pendente.texto);
    if (indice >= 0) await alternarTarefa(pendente.grupo, indice, true);
  });
  document.getElementById('btn-daily-nao').addEventListener('click', fecharPopovers);

  document.getElementById('btn-fechar').addEventListener('click', () => window.blink.janela.fechar());
  // Minimizar vai para a barra de tarefas; a janela volta pelo icone ou pela bind.
  document.getElementById('btn-minimizar').addEventListener('click', () => window.blink.janela.minimizar());

  // O olho: abre as configuracoes na aba do Fast Note e fecha esta janela.
  document.getElementById('btn-olho').addEventListener('click', () => window.blink.janela.abrirPrincipal('note'));

  // Os botoes do cabecalho nunca tomam o foco do teclado: clicar em "minimizar"
  // deixava o foco nele, e ao voltar nao dava para digitar.
  for (const id of ['btn-minimizar', 'btn-fechar', 'btn-olho']) {
    document.getElementById(id).addEventListener('mousedown', (evento) => evento.preventDefault());
  }

  // A janela voltou da barra de tarefas: o foco volta para onde se escreve -
  // o campo de edicao, se havia um aberto; "+ Criar nova nota", se e o que
  // esta na tela; senao o campo de escrita.
  window.blink.notas.aoFocar(() => {
    const campoDoModal = modalAberto && camposPrivado.querySelector('input');
    const edicao = document.querySelector('.campo-edicao');
    if (campoDoModal) campoDoModal.focus();
    else if (edicao) edicao.focus({ preventScroll: true });
    else if (arquivo === NOVO) campoNome.focus();
    else focarOndeSeEscreve();
  });

  // Fechar ou recarregar com a folha aberta: o que faltava gravar vai agora, de forma sincrona (uma gravacao
  // assincrona nao teria tempo de terminar). Minimizar so grava.
  window.addEventListener('beforeunload', () => { if (folha) folha.salvarSincrono(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && folha) folha.salvarAgora(); });

  // Soltar um arquivo na janela (uma imagem fora da folha, por exemplo) nao pode abrir o arquivo no lugar do Fast
  // Note. Na folha, quem trata e o editor; reordenar topicos arrasta texto, nao arquivo, e segue como era.
  const trazArquivos = (evento) => !!evento.dataTransfer && [...evento.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', (evento) => { if (trazArquivos(evento)) evento.preventDefault(); });
  window.addEventListener('drop', (evento) => { if (trazArquivos(evento)) evento.preventDefault(); });

  // O processo principal trancou tudo (a janela foi minimizada): apaga o conteudo da memoria e volta a pedir a senha.
  window.blink.privado.aoTrancar(() => {
    fecharModalPrivado();
    const estavaAberto = ehPrivado() && desbloqueado;
    esquecerSegredos();
    if (estavaAberto) desenhar();
  });

  window.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;

    // Esc com a pergunta de senha aberta so fecha ela.
    if (modalAberto) {
      modalAberto.cancelar();
      return;
    }

    // Esc com a lista de arquivos aberta so fecha ela.
    if (seletor.estaAberto()) {
      seletor.fechar();
      return;
    }

    // Esc com o calendario aberto so fecha ele.
    if (calendario.estaAberto()) {
      calendario.fechar();
      return;
    }

    // Esc com uma confirmacao aberta so fecha ela.
    if (!popoverLimpar.hidden || !popoverExcluir.hidden || !popoverDaily.hidden) {
      fecharPopovers();
      return;
    }

    // Esc com a caneta, o marca-texto ou a borracha ligados volta para o texto (o menu "/" da folha trata o
    // proprio Esc antes de chegar aqui).
    if (folha && ehLivre() && folha.voltarParaTexto()) return;

    // Esc minimiza (vai para a barra de tarefas), em vez de fechar. Fechar de
    // verdade e so pelo X.
    window.blink.janela.minimizar();
  });

  // --- Arquivos com cadeado ----------------------------------------------------------

  /**
   * A mensagem para o usuario de uma recusa do processo principal ({ ok: false, motivo }). Nenhuma
   * deixa escapar se foi a senha, o arquivo adulterado ou outra coisa que falhou alem do necessario.
   */
  function mensagemDoCadeado(r) {
    switch (r && r.motivo) {
      case 'senha': return 'Senha incorreta.';
      case 'espere': return 'Espere um instante para tentar de novo.';
      case 'formato': return 'O arquivo está danificado ou não é um arquivo privado.';
      case 'senha-curta': return 'Use uma senha com pelo menos 4 caracteres.';
      case 'historico': return 'Desligue o histórico diário deste arquivo antes de pôr o cadeado.';
      case 'tarefas': return 'O arquivo de tarefas não pode ter cadeado.';
      case 'livre': return 'Desligue a folha livre deste arquivo antes de pôr o cadeado.';
      case 'ja-privado': return 'Este arquivo já tem cadeado.';
      case 'nao-privado': return 'Este arquivo não tem cadeado.';
      case 'inexistente': return 'O arquivo não existe mais.';
      case 'trancado': return 'O arquivo foi trancado. Abra de novo com a senha.';
      default: return 'Não foi possível concluir.';
    }
  }

  /** O erro que a pergunta de senha mostra, e quanto tempo o botao fica parado (a senha errada espera 1 s). */
  const erroDe = (r) => ({ erro: mensagemDoCadeado(r), espera: r.motivo === 'senha' ? 1000 : r.espera || 0 });

  /** Fecha a pergunta de senha (sem resposta) e apaga os campos, com o que foi digitado. */
  function fecharModalPrivado() {
    if (modalAberto) modalAberto.cancelar();
  }

  /**
   * Abre a pergunta de senha / o formulario de credencial por cima da janela.
   *
   *   titulo, texto   o que a caixa diz
   *   campos          [{ id, rotulo, tipo }] - 'password' esconde o que se digita
   *   rotuloOk        o texto do botao de confirmar
   *   aoConfirmar     recebe { id: valor }; devolve null (deu certo: fecha) ou { erro, espera } (fica aberta,
   *                   mostra o erro e para o botao por `espera` ms)
   *
   * Devolve uma Promise: true se confirmou, false se cancelou (Esc, Cancelar, clicar fora). Os campos sao
   * apagados do DOM ao fechar.
   */
  function abrirModalPrivado({ titulo, texto, campos, rotuloOk, aoConfirmar }) {
    fecharModalPrivado();

    return new Promise((resolve) => {
      tituloPrivado.textContent = titulo;
      textoPrivado.textContent = texto || '';
      textoPrivado.hidden = !texto;
      erroPrivado.hidden = true;
      botaoPrivadoOk.textContent = rotuloOk;
      botaoPrivadoOk.disabled = false;
      limpar(camposPrivado);

      const entradas = campos.map((c) => {
        const input = el('input', {
          class: 'campo-privado',
          id: `campo-privado-${c.id}`,
          type: c.tipo || 'text',
          'aria-label': c.rotulo,
          autocomplete: 'off',
          spellcheck: 'false',
          maxlength: '200',
        });
        window.Blink.ui.anexar(camposPrivado, [el('label', { class: 'rotulo-privado', for: input.id, texto: c.rotulo }), input]);
        return { id: c.id, input };
      });

      let fechado = false;
      let ocupado = false;

      const fechar = (resposta) => {
        if (fechado) return;
        fechado = true;
        modalAberto = null;
        modalPrivado.hidden = true;
        // O que foi digitado e o texto da pergunta (que cita o titulo de uma credencial) saem do DOM.
        limpar(camposPrivado);
        tituloPrivado.textContent = '';
        textoPrivado.textContent = '';
        erroPrivado.textContent = '';
        resolve(resposta);
        if (!privadoTrancado()) rascunho.focus();
      };

      const confirmar = async () => {
        if (ocupado || fechado) return;
        ocupado = true;
        botaoPrivadoOk.disabled = true;
        erroPrivado.hidden = true;

        const valores = {};
        for (const { id, input } of entradas) valores[id] = input.value;

        let resposta;
        try {
          resposta = await aoConfirmar(valores);
        } catch (erro) {
          resposta = { erro: 'Não foi possível concluir.' };
        }

        if (!resposta) {
          fechar(true);
          return;
        }

        // Deu errado: a pergunta continua aberta, sem o que foi digitado nos campos de senha.
        erroPrivado.textContent = resposta.erro;
        erroPrivado.hidden = false;
        for (const { input } of entradas) if (input.type === 'password') input.value = '';
        entradas[0].input.focus();
        ocupado = false;
        setTimeout(() => { if (!fechado) botaoPrivadoOk.disabled = false; }, resposta.espera || 0);
      };

      for (const { input } of entradas) {
        input.addEventListener('keydown', (evento) => {
          if (evento.key === 'Enter') {
            evento.preventDefault();
            if (!botaoPrivadoOk.disabled) confirmar();
          }
        });
      }

      botaoPrivadoOk.onclick = confirmar;
      botaoPrivadoCancelar.onclick = () => fechar(false);
      // Clicar no fundo escuro, fora da caixa, cancela.
      modalPrivado.onmousedown = (evento) => { if (evento.target === modalPrivado) fechar(false); };

      modalAberto = { cancelar: () => fechar(false) };
      modalPrivado.hidden = false;
      entradas[0].input.focus();
    });
  }

  /** A tela da senha: abre o arquivo privado com o que foi digitado. */
  async function abrirPrivado() {
    if (!privadoTrancado() || botaoAbrirPrivado.disabled) return;
    const senha = senhaAbrir.value;
    if (senha === '') return;

    botaoAbrirPrivado.disabled = true;
    erroAbrir.hidden = true;
    const r = await window.blink.privado.abrir(arquivo, senha);
    senhaAbrir.value = '';

    if (r.ok) {
      botaoAbrirPrivado.disabled = false;
      desbloqueado = true;
      aplicarItensPrivados(r.itens);
      recemCriado = null;
      desenhar();
      rascunho.focus();
      return;
    }

    erroAbrir.textContent = mensagemDoCadeado(r);
    erroAbrir.hidden = false;
    // Senha errada: o botao fica parado 1 s antes de aceitar outra tentativa (o processo principal tambem espera).
    setTimeout(() => {
      botaoAbrirPrivado.disabled = false;
      if (privadoTrancado()) senhaAbrir.focus();
    }, erroDe(r).espera);
  }

  /**
   * O cadeado de um arquivo, no seletor: pos (Definir senha) ou tirar (pede a senha, avisa das credenciais).
   * O processo principal faz a conversao do arquivo; aqui so se pergunta e se redesenha.
   */
  async function alternarPrivado(valor) {
    seletor.fechar();
    const eOAberto = () => valor.toLowerCase() === arquivo.toLowerCase();

    if (ehPrivado(valor)) {
      const confirmou = await abrirModalPrivado({
        titulo: 'Tirar o cadeado',
        texto: `As senhas das credenciais de "${valor}" vão ficar visíveis no arquivo, em texto comum. Digite a senha do arquivo para continuar.`,
        campos: [{ id: 'senha', rotulo: 'Senha do arquivo', tipo: 'password' }],
        rotuloOk: 'Tirar o cadeado',
        aoConfirmar: async ({ senha }) => {
          const r = await window.blink.privado.desativar(valor, senha);
          return r.ok ? null : erroDe(r);
        },
      });
      if (!confirmou) return;

      if (eOAberto()) esquecerSegredos();
      await recarregarSeletor();
      if (eOAberto()) {
        await carregar();
        desenhar();
      }
      avisarNaDica('Cadeado retirado: o arquivo voltou a ser um .md comum.');
      return;
    }

    let aberto = null;
    const confirmou = await abrirModalPrivado({
      titulo: 'Definir senha',
      texto: `Esta senha protege "${valor}". Sem a senha não há como recuperar o conteúdo — nem o Blink consegue. Pode usar a mesma senha em mais de um arquivo.`,
      campos: [
        { id: 'senha', rotulo: 'Senha', tipo: 'password' },
        { id: 'confirmar', rotulo: 'Repita a senha', tipo: 'password' },
      ],
      rotuloOk: 'Pôr o cadeado',
      aoConfirmar: async ({ senha, confirmar }) => {
        if (senha.length < 4) return { erro: mensagemDoCadeado({ motivo: 'senha-curta' }) };
        if (senha !== confirmar) return { erro: 'As senhas não conferem.' };
        const r = await window.blink.privado.ativar(valor, senha);
        if (!r.ok) return erroDe(r);
        aberto = r;
        return null;
      },
    });
    if (!confirmou) return;

    // O arquivo recem-protegido fica aberto para quem acabou de digitar a senha - se e o que esta na tela. Se
    // nao e, tranca ja: nao deixa uma sessao aberta num arquivo que ninguem esta vendo.
    const abertoNaTela = eOAberto();
    if (!abertoNaTela) window.blink.privado.trancar(valor);
    await recarregarSeletor();
    if (abertoNaTela) {
      desbloqueado = true;
      aplicarItensPrivados(aberto.itens);
      recemCriado = null;
      desenhar();
      rascunho.focus();
    }
    avisarNaDica('Cadeado posto: o arquivo está criptografado.');
  }

  const OLHINHO =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z" fill="none" stroke="currentColor" stroke-width="1.7"></path>' +
    '<circle cx="12" cy="12" r="3.2" fill="currentColor"></circle></svg>';

  const CHAVE =
    '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"></circle>' +
    '<path d="M12 12h9M18 12v4M21 12v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';

  /**
   * Uma credencial: o titulo e, embaixo, login e senha como ••••••. O olhinho (pede a senha do arquivo de novo)
   * mostra os dois ate trancar; cada campo tem o seu "copiar", que nao precisa mostrar nada.
   */
  function montarCredencial(indice, credencial) {
    const piscando = recemCriado && recemCriado.grupo === 'topicos' && recemCriado.indice === indice;
    const item = el('div', { class: `topico credencial${piscando ? ' novo' : ''}`, draggable: 'true' });
    const mostrando = revelados.get(credencial.id);

    const olhinho = el('button', {
      class: `botao-olhinho${mostrando ? ' ligado' : ''}`,
      type: 'button',
      title: mostrando ? 'Esconder o login e a senha' : 'Ver o login e a senha (pede a senha do arquivo)',
      'aria-label': mostrando ? 'Esconder o login e a senha' : 'Ver o login e a senha',
      'aria-pressed': String(!!mostrando),
      onclick: () => alternarOlhinho(credencial),
    });
    olhinho.appendChild(svg(OLHINHO));

    const icone = el('span', { class: 'icone-chave' });
    icone.appendChild(svg(CHAVE));

    const linhaCampo = (rotulo, campo) =>
      el('div', { class: 'linha-credencial' }, [
        el('span', { class: 'rotulo-credencial', texto: rotulo }),
        el('span', { class: `valor-credencial${mostrando ? ' revelado' : ''}`, 'data-campo': campo, texto: mostrando ? mostrando[campo] : '••••••' }),
        el('button', {
          class: 'botao-copiar-campo',
          type: 'button',
          texto: 'copiar',
          title: `Copiar o ${rotulo.toLowerCase()} (sai da área de transferência em 30 s)`,
          onclick: () => copiarCampo(credencial, campo),
        }),
      ]);

    window.Blink.ui.anexar(item, [
      el('span', { class: 'alca', texto: '⋮⋮' }),
      el('div', { class: 'corpo-topico caixa-recolhivel' }, [
        el('div', { class: 'linha-titulo' }, [icone, el('span', { class: 'titulo-credencial', texto: credencial.titulo, title: credencial.titulo }), olhinho]),
        linhaCampo('login', 'login'),
        linhaCampo('senha', 'senha'),
      ]),
      el('button', { class: 'botao-apagar', texto: '×', title: 'Apagar credencial', onclick: () => apagar('topicos', indice) }),
    ]);

    ligarArrasto(item, 'topicos', indice);
    return item;
  }

  /** O olhinho: ligado, esconde (sem pedir nada); desligado, pede a senha do arquivo e mostra. */
  async function alternarOlhinho(credencial) {
    if (revelados.has(credencial.id)) {
      revelados.delete(credencial.id);
      desenhar({ manter: true });
      return;
    }

    const confirmou = await abrirModalPrivado({
      titulo: 'Ver credencial',
      texto: `Digite a senha do arquivo para ver o login e a senha de "${credencial.titulo}". Eles ficam visíveis até o arquivo ser trancado (trocar de arquivo, minimizar ou fechar).`,
      campos: [{ id: 'senha', rotulo: 'Senha do arquivo', tipo: 'password' }],
      rotuloOk: 'Ver',
      aoConfirmar: async ({ senha }) => {
        const r = await window.blink.privado.revelar(arquivo, credencial.id, senha);
        if (!r.ok) return erroDe(r);
        revelados.set(credencial.id, { login: r.login, senha: r.senha });
        return null;
      },
    });
    if (confirmou) desenhar({ manter: true });
  }

  /** Copia o login ou a senha pelo processo principal: a tela nunca ve o valor. */
  async function copiarCampo(credencial, campo) {
    const r = await window.blink.privado.copiar(arquivo, credencial.id, campo);
    if (!r.ok) {
      avisarNaDica(mensagemDoCadeado(r));
      return;
    }
    const nome = campo === 'senha' ? 'Senha copiada' : 'Login copiado';
    avisarNaDica(`${nome}. Sai da área de transferência em ${r.segundos} s${r.escondido ? '.' : ' (pode aparecer no histórico do Windows).'}`);
  }

  /** O botao "+ credencial": titulo, login e senha. */
  async function novaCredencial() {
    if (!ehPrivado() || !desbloqueado) return;

    const confirmou = await abrirModalPrivado({
      titulo: 'Nova credencial',
      texto: '',
      campos: [
        { id: 'titulo', rotulo: 'Título (ex.: Banco do João)' },
        { id: 'login', rotulo: 'Login' },
        { id: 'senha', rotulo: 'Senha', tipo: 'password' },
      ],
      rotuloOk: 'Salvar',
      aoConfirmar: async ({ titulo, login, senha }) => {
        if (titulo.trim() === '') return { erro: 'Escreva um título.' };
        const r = await window.blink.privado.adicionarCredencial(arquivo, titulo, login, senha);
        if (!r.ok) return erroDe(r);
        aplicarItensPrivados(r.itens);
        return null;
      },
    });
    if (!confirmou) return;

    recemCriado = { grupo: 'topicos', indice: 0 };
    desenhar();
    agendarFimDoPiscar();
  }

  botaoAbrirPrivado.addEventListener('click', abrirPrivado);
  senhaAbrir.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      abrirPrivado();
    }
  });
  botaoCredencial.addEventListener('click', novaCredencial);

  // --- Inicio --------------------------------------------------------------------

  async function iniciar() {
    // Fonte e tamanho do texto, os da aba Fast Note das configuracoes. Trocados la com esta janela aberta,
    // valem na hora; um campo de edicao aberto reajusta a altura (a fonte nova quebra as linhas em outros pontos).
    window.Blink.aparencia.aoAplicar(() => {
      const edicao = document.querySelector('.campo-edicao');
      if (edicao) ajustarAltura(edicao);
      for (const corpo of document.querySelectorAll('.corpo-recolhivel:not([hidden])')) ajustarAltura(corpo);
    });
    await window.Blink.aparencia.iniciar('note');

    const estado = await window.blink.notas.estado();
    pasta = estado.pasta;
    arquivoTarefas = estado.arquivoTarefas;
    principal = estado.principal;
    historico = estado.historico;
    privados = estado.privados || [];
    livres = estado.livres || [];

    // Abre no arquivo da estrela. Sem estrela, no ultimo que estava aberto.
    // Sem nenhum dos dois, o de sempre.
    arquivo = principal || estado.ultima || primeiroArquivo(estado.arquivos);
    if (ehHistorico()) dataSelecionada = dataDeHoje();
    desenharSelect(estado.arquivos);
    await carregar();

    desenhar();
    if (arquivo === NOVO) campoNome.focus();
    else focarOndeSeEscreve();
  }

  iniciar();
})();
