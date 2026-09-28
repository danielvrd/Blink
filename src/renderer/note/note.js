/**
 * Bloco de notas do Fast Note.
 *
 * Escreve topicos em arquivos .md de uma pasta escolhida. Quem mexe em
 * disco e o processo principal (src/main/notas.js); aqui e so a tela.
 *
 * Uma inversao importante: no arquivo os topicos ficam em ordem
 * cronologica, com o mais novo no fim, para o .md se ler como um diario.
 * Na tela o mais novo aparece em cima, que e onde o olho vai primeiro.
 * Entao a lista daqui e sempre o inverso da lista do arquivo, e a conversao
 * acontece em dois lugares so: ao carregar e ao gravar.
 */

(function () {
  const { el, limpar } = window.Blink.ui;

  /** Valor da opcao "+ Criar nova nota" do select. */
  const NOVO = '__novo__';

  const selectArquivo = document.getElementById('select-arquivo');
  const campoNome = document.getElementById('campo-nome');
  const lista = document.getElementById('lista');
  const rascunho = document.getElementById('rascunho');
  const dica = document.getElementById('dica');
  const botaoLimpar = document.getElementById('btn-limpar');
  const popover = document.getElementById('popover-limpar');

  /** Pasta configurada, so para mostrar na dica. */
  let pasta = '';

  /** Arquivo escolhido agora, ou NOVO. */
  let arquivo = NOVO;

  /** Topicos na ordem da TELA: o mais novo primeiro. */
  let topicos = [];

  /** Indice do topico recem-criado, para ele piscar. */
  let recemCriado = null;

  /** Arrastar para reordenar. */
  let arrastando = null;
  let alvo = null;

  // --- Gravacao -------------------------------------------------------------

  /** Manda a lista para o disco, de volta na ordem do arquivo. */
  async function gravarLista() {
    if (arquivo === NOVO) return;
    await window.blink.notas.salvar(arquivo, [...topicos].reverse());
  }

  // --- Desenho --------------------------------------------------------------

  function desenharSelect(arquivos) {
    limpar(selectArquivo);

    for (const nome of arquivos) {
      selectArquivo.appendChild(el('option', { value: nome, texto: nome }));
    }
    selectArquivo.appendChild(el('option', { value: NOVO, texto: '+ Criar nova nota' }));

    selectArquivo.value = arquivo;
  }

  function desenharLista() {
    limpar(lista);

    if (arquivo === NOVO || topicos.length === 0) {
      lista.appendChild(
        el('div', { class: 'vazio', texto: 'Nenhum tópico ainda — escreva abaixo.' })
      );
      return;
    }

    topicos.forEach((texto, indice) => {
      const item = el('div', {
        class: 'topico' + (indice === recemCriado ? ' novo' : ''),
        draggable: 'true',
      }, [
        el('span', { class: 'alca', texto: '⋮⋮' }),
        el('div', { class: 'corpo-topico' }, [
          el('span', { class: 'traco', texto: '–' }),
          el('span', { class: 'texto', texto }),
        ]),
        el('button', {
          class: 'botao-apagar',
          texto: '×',
          title: 'Apagar tópico',
          onclick: () => apagar(indice),
        }),
      ]);

      ligarArrasto(item, indice);
      lista.appendChild(item);
    });
  }

  function desenharDica() {
    dica.textContent = pasta
      ? `Enter adiciona um tópico · Pasta: ${pasta}`
      : 'Enter adiciona um tópico';
    dica.title = dica.textContent;
  }

  function desenhar() {
    campoNome.hidden = arquivo !== NOVO;
    botaoLimpar.disabled = arquivo === NOVO || topicos.length === 0;
    if (botaoLimpar.disabled) fecharPopover();

    desenharLista();
    desenharDica();
  }

  // --- Acoes ----------------------------------------------------------------

  /** Troca o arquivo mostrado e carrega os topicos dele. */
  async function escolherArquivo(valor) {
    arquivo = valor;
    fecharPopover();
    recemCriado = null;

    if (arquivo === NOVO) {
      topicos = [];
      campoNome.value = '';
      desenhar();
      campoNome.focus();
      return;
    }

    const { topicos: doArquivo } = await window.blink.notas.ler(arquivo);
    topicos = doArquivo.reverse();
    desenhar();
    rascunho.focus();
  }

  /** Grava o que esta no rascunho como um topico novo. */
  async function adicionar() {
    const texto = rascunho.value.trim();
    if (texto === '') return;

    const destino = arquivo === NOVO ? campoNome.value : arquivo;
    const gravado = await window.blink.notas.adicionar(destino, texto);

    if (!gravado) {
      campoNome.focus();
      return;
    }

    rascunho.value = '';

    // Pode ter nascido um arquivo novo: recarrega a lista do select.
    const estado = await window.blink.notas.estado();
    pasta = estado.pasta;
    arquivo = gravado;
    desenharSelect(estado.arquivos);

    const { topicos: doArquivo } = await window.blink.notas.ler(arquivo);
    topicos = doArquivo.reverse();

    // O mais novo e sempre o primeiro da tela.
    recemCriado = 0;
    desenhar();
    rascunho.focus();

    setTimeout(() => {
      recemCriado = null;
      desenharLista();
    }, 1600);
  }

  async function apagar(indice) {
    topicos.splice(indice, 1);
    recemCriado = null;
    desenhar();
    await gravarLista();
  }

  async function limparTudo() {
    fecharPopover();
    topicos = [];
    recemCriado = null;
    desenhar();
    await window.blink.notas.limpar(arquivo);
  }

  // --- Confirmacao do limpar ------------------------------------------------

  function fecharPopover() {
    popover.hidden = true;
  }

  // --- Arrastar para reordenar ----------------------------------------------

  /** Tira as linhas-guia de todos os itens. */
  function limparGuias() {
    for (const item of lista.querySelectorAll('.topico')) {
      item.classList.remove('solta-acima', 'solta-abaixo', 'arrastando');
    }
  }

  function ligarArrasto(item, indice) {
    item.addEventListener('dragstart', (evento) => {
      arrastando = indice;
      evento.dataTransfer.effectAllowed = 'move';
      // O Firefox e alguns navegadores so comecam o arrasto se houver dado.
      evento.dataTransfer.setData('text/plain', String(indice));
      item.classList.add('arrastando');
    });

    item.addEventListener('dragover', (evento) => {
      evento.preventDefault();
      if (arrastando === null || arrastando === indice) return;
      if (alvo === indice) return;

      alvo = indice;
      limparGuias();
      lista.children[arrastando]?.classList.add('arrastando');

      // Descendo, a guia fica embaixo do item; subindo, em cima. E onde o
      // item vai parar.
      item.classList.add(arrastando < indice ? 'solta-abaixo' : 'solta-acima');
    });

    item.addEventListener('drop', async (evento) => {
      evento.preventDefault();
      const origem = arrastando;
      arrastando = null;
      alvo = null;

      if (origem === null || origem === indice) {
        limparGuias();
        return;
      }

      const [movido] = topicos.splice(origem, 1);
      topicos.splice(indice, 0, movido);

      recemCriado = null;
      desenhar();
      await gravarLista();
    });

    item.addEventListener('dragend', () => {
      arrastando = null;
      alvo = null;
      limparGuias();
    });
  }

  // --- Ligacoes -------------------------------------------------------------

  selectArquivo.addEventListener('change', (evento) => escolherArquivo(evento.target.value));

  rascunho.addEventListener('keydown', (evento) => {
    // Enter grava; Shift+Enter quebra linha dentro do topico.
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
    popover.hidden = !popover.hidden;
  });

  document.getElementById('btn-limpar-sim').addEventListener('click', limparTudo);
  document.getElementById('btn-limpar-nao').addEventListener('click', fecharPopover);

  document.getElementById('btn-fechar').addEventListener('click', () => window.blink.janela.fechar());

  window.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;

    // Esc com a confirmacao aberta so fecha ela.
    if (!popover.hidden) {
      fecharPopover();
      return;
    }
    window.blink.janela.fechar();
  });

  // --- Inicio ---------------------------------------------------------------

  async function iniciar() {
    const estado = await window.blink.notas.estado();
    pasta = estado.pasta;

    // Abre no primeiro arquivo; se a pasta estiver vazia, ja em "criar nova".
    arquivo = estado.arquivos.length > 0 ? estado.arquivos[0] : NOVO;
    desenharSelect(estado.arquivos);

    if (arquivo !== NOVO) {
      const { topicos: doArquivo } = await window.blink.notas.ler(arquivo);
      topicos = doArquivo.reverse();
    }

    desenhar();
    if (arquivo === NOVO) campoNome.focus();
    else rascunho.focus();
  }

  iniciar();
})();
