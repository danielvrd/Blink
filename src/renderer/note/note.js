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
 */

(function () {
  const { el, limpar } = window.Blink.ui;

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
  const rascunho = document.getElementById('rascunho');
  const dica = document.getElementById('dica');
  const botaoCopiar = document.getElementById('btn-copiar');
  const botaoLimpar = document.getElementById('btn-limpar');
  const botaoExcluir = document.getElementById('btn-excluir');
  const popoverLimpar = document.getElementById('popover-limpar');
  const popoverExcluir = document.getElementById('popover-excluir');
  const perguntaLimpar = document.getElementById('pergunta-limpar');
  const perguntaExcluir = document.getElementById('pergunta-excluir');

  /**
   * "/" no rascunho abre a lista de notas (autocompletar.js). Ligado aqui,
   * antes do tratador de Enter la embaixo: com a lista aberta o Enter
   * completa o nome, e nao pode gravar o topico.
   */
  window.Blink.autocompletar.ligar(rascunho, document.getElementById('popup-notas'), {
    obterNomes: () => {
      const nomes = arquivos.map((a) => a.replace(/\.md$/i, ''));
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

  // --- Ajudantes --------------------------------------------------------------

  /** O arquivo aberto e o de tarefas? Sem diferenciar maiuscula. */
  function ehTarefas() {
    return arquivo !== NOVO && arquivo.toLowerCase() === arquivoTarefas;
  }

  /** O arquivo aberto tem o relogio (historico diario) ligado? */
  function ehHistorico() {
    return arquivo !== NOVO && historico.some((h) => h.toLowerCase() === arquivo.toLowerCase());
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
    seletor.definir({ arquivos, atual: arquivo, principal, historico, arquivoTarefas });
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

    const grupo = ehHistorico() ? 'historico' : 'topicos';
    const itens = listaDo(grupo);

    if (arquivo === NOVO || itens.length === 0) {
      vazio(ehHistorico() ? 'Nenhum tópico neste dia — escreva abaixo.' : 'Nenhum tópico ainda — escreva abaixo.');
      return;
    }

    itens.forEach((texto, indice) => lista.appendChild(montarItem(grupo, indice, texto)));
  }

  function desenharDica() {
    const partes = [ehTarefas() ? 'Enter adiciona uma tarefa' : 'Enter adiciona · / manda para outra nota'];
    if (pasta) partes.push(`Pasta: ${pasta}`);
    dica.textContent = partes.join(' · ');
    dica.title = dica.textContent;

    rascunho.placeholder = ehTarefas()
      ? 'Escreva uma tarefa…'
      : 'Escreva e pressione Enter…';
  }

  function desenhar() {
    campoNome.hidden = arquivo !== NOVO;
    // O copiar segue a vassoura: sem nada para copiar, fica apagado.
    botaoCopiar.disabled = arquivo === NOVO || totalDeItens() === 0;
    botaoCopiar.title = ehHistorico()
      ? `Copiar as anotações do dia ${formatarDataBR(dataSelecionada)}`
      : 'Copiar todas as anotações';
    botaoLimpar.disabled = arquivo === NOVO || totalDeItens() === 0;
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
    rascunho.focus();
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

    // O "task" vale mesmo antes do task.md existir: o /task cria.
    const candidatos = arquivos.map((a) => ({ nome: a.replace(/\.md$/i, ''), arquivo: a }));
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

    arquivo = gravado;
    lembrarArquivo();
    await recarregarSeletor();
    if (destinoHistorico) dataSelecionada = data;
    await carregar();

    // O mais novo e sempre o primeiro da tela.
    recemCriado = { grupo: destinoHistorico ? 'historico' : 'topicos', indice: 0 };
    desenhar();
    rascunho.focus();
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
    const linhas = (itens, marca) => itens.slice().reverse().map((t) => `- ${marca}${t.split('\n').join('\n  ')}`);

    let partes;
    if (ehTarefas()) {
      partes = [...linhas(tarefas.pendentes, '[ ] '), ...linhas(tarefas.concluidas, '[x] ')];
    } else if (ehHistorico()) {
      partes = linhas(historicoAtual(), '');
    } else {
      partes = linhas(topicos, '');
    }
    return { texto: partes.join('\n').split('\n').join('\r\n'), total: partes.length };
  }

  async function copiarNotas() {
    if (botaoCopiar.disabled) return;
    const { texto, total } = textoParaCopiar();
    if (total === 0) return;

    const gravou = await window.blink.areaTransferencia.escrever(texto);
    avisarNaDica(gravou ? `Copiada${total === 1 ? '' : 's'}: ${total} anotaç${total === 1 ? 'ão' : 'ões'}` : 'Não foi possível copiar.');
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
    // Se o excluido era o principal (ou tinha o relogio ligado), o processo
    // principal ja tirou a marca.
    principal = estado.principal;
    historico = estado.historico;
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

  botaoCopiar.addEventListener('click', copiarNotas);

  botaoLimpar.addEventListener('click', () => {
    if (botaoLimpar.disabled) return;
    // No historico a pergunta cita o dia: "limpar tudo" ali limpa so ele.
    perguntaLimpar.textContent = ehHistorico()
      ? `Limpar as notas do dia ${formatarDataBR(dataSelecionada)}?`
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

  document.getElementById('btn-fechar').addEventListener('click', () => window.blink.janela.fechar());
  // Minimizar vai para a barra de tarefas; a janela volta pelo icone ou pela bind.
  document.getElementById('btn-minimizar').addEventListener('click', () => window.blink.janela.minimizar());

  // O olho: abre as configuracoes na aba do Fast Note e fecha esta janela.
  document.getElementById('btn-olho').addEventListener('click', () => window.blink.janela.abrirPrincipal('note'));

  window.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;

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
    historico = estado.historico;

    // Abre no arquivo da estrela. Sem estrela, no ultimo que estava aberto.
    // Sem nenhum dos dois, o de sempre.
    arquivo = principal || estado.ultima || primeiroArquivo(estado.arquivos);
    if (ehHistorico()) dataSelecionada = dataDeHoje();
    desenharSelect(estado.arquivos);
    await carregar();

    desenhar();
    if (arquivo === NOVO) campoNome.focus();
    else rascunho.focus();
  }

  iniciar();
})();
