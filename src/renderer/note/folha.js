/**
 * A folha livre do Fast Note: um editor tipo Notion (Quill 2) numa "folha de papel" de largura fixa, com um desenho
 * de caneta por cima (tinta.js).
 *
 *   texto        titulos, listas (comum, numerada, de tarefas), citacao, codigo, divisoria, imagem, negrito,
 *                italico, sublinhado, riscado, cor do texto e marca-texto, e o topico expansivel (um titulo
 *                com seta e, embaixo, o corpo num cartao; a seta esconde e mostra o corpo)
 *   barra        flutua sobre o texto selecionado (negrito, italico, sublinhado, riscado, cor, marca-texto)
 *   menu "/"     escolhe o bloco: digite / numa linha vazia
 *   atalhos      "# ", "## ", "### ", "- ", "1. ", "[] ", "> " e "---" + Enter, Ctrl+B / I / U e Ctrl+Z / Y
 *   imagens      colar ou arrastar: os bytes vao para o processo principal, que guarda em .blink/anexos e devolve
 *                blink-anexo://<uuid>.<ext> (o protocolo so serve esses nomes)
 *   caneta       ferramentas Texto / Caneta / Marca-texto / Borracha, 8 cores, 3 espessuras, desfazer e refazer
 *
 * A folha tem 794 px de largura (um A4) e da zoom para caber na largura da janela, sem passar de 100%. A tinta e o
 * texto moram na mesma folha, entao o zoom nao desalinha um do outro.
 *
 * Cores e marca-texto do TEXTO usam CLASSES (ql-color-<nome>, ql-bg-<nome>), nunca style="": o CSP da tela
 * bloqueia estilo inline. A lista de nomes fica aqui e as cores em note.css.
 *
 * O Quill nao conhece o disco: a tela manda e recebe o Delta como JSON (window.blink.livre.*). Nao se usa a
 * exportacao em HTML do Quill (getSemanticHTML), que tem um aviso de seguranca (GHSA-v3m3-f69x-jf25).
 */

window.Blink = window.Blink || {};

(function () {
  const { el, svg } = window.Blink.ui;

  /** A largura da folha, em px (um A4 a 96 dpi). */
  const LARGURA_DA_FOLHA = 794;
  const ALTURA_MINIMA_DA_FOLHA = 1123;

  /** Quanto tempo depois da ultima mudanca a folha e gravada. */
  const ATRASO_DE_GRAVACAO = 1000;

  /** As cores do texto (classes ql-color-<nome>) e do marca-texto (ql-bg-<nome>). */
  const CORES_DO_TEXTO = [
    { nome: 'branco', rotulo: 'Branco', hex: '#ffffff' },
    { nome: 'vermelho', rotulo: 'Vermelho', hex: '#ff6b6b' },
    { nome: 'laranja', rotulo: 'Laranja', hex: '#ffa94d' },
    { nome: 'amarelo', rotulo: 'Amarelo', hex: '#ffe066' },
    { nome: 'verde', rotulo: 'Verde', hex: '#69db7c' },
    { nome: 'azul', rotulo: 'Azul', hex: '#74c0fc' },
    { nome: 'roxo', rotulo: 'Roxo', hex: '#b197fc' },
    { nome: 'rosa', rotulo: 'Rosa', hex: '#faa2c1' },
  ];
  const CORES_DO_MARCA_TEXTO = [
    { nome: 'amarelo', rotulo: 'Amarelo', hex: '#ffe066' },
    { nome: 'verde', rotulo: 'Verde', hex: '#69db7c' },
    { nome: 'azul', rotulo: 'Azul', hex: '#74c0fc' },
    { nome: 'rosa', rotulo: 'Rosa', hex: '#faa2c1' },
    { nome: 'laranja', rotulo: 'Laranja', hex: '#ffa94d' },
    { nome: 'cinza', rotulo: 'Cinza', hex: '#adb5bd' },
  ];

  /** As cores da caneta e do marca-texto da tinta (o mesmo formato #rrggbb que o processo principal valida). */
  const CORES_DA_TINTA = ['#e0263b', '#ff8a3d', '#ffd84d', '#4cc26b', '#4aa3ff', '#a77bff', '#ff7eb6', '#f2f2f2'];

  /** Sem acento nem maiuscula, para filtrar o menu "/". */
  const normalizar = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Os formatos que a folha aceita (o resto, colado de fora, e descartado). */
  const FORMATOS = ['bold', 'italic', 'underline', 'strike', 'color', 'background', 'header', 'list', 'indent', 'blockquote', 'code-block', 'image', 'divider', 'toggle', 'link'];

  // --- Os formatos do Quill (registrados uma vez) -----------------------------------------------

  let registrado = false;
  function registrarFormatos() {
    if (registrado) return;
    registrado = true;

    const { ClassAttributor, Scope } = Quill.import('parchment');

    // Cor e marca-texto por CLASSE, com a lista de nomes fechada: nada de style="" (o CSP bloqueia) e nenhuma cor de fora.
    const Cor = new ClassAttributor('color', 'ql-color', { scope: Scope.INLINE, whitelist: CORES_DO_TEXTO.map((c) => c.nome) });
    const Fundo = new ClassAttributor('background', 'ql-bg', { scope: Scope.INLINE, whitelist: CORES_DO_MARCA_TEXTO.map((c) => c.nome) });
    Quill.register({ 'formats/color': Cor, 'formats/background': Fundo }, true);

    // O topico expansivel: uma ATRIBUTO de linha (classe ql-toggle-<valor>), nao um container: 'aberto' e 'fechado'
    // marcam a linha do TITULO e 'corpo' as linhas de dentro. Quem esconde o corpo de um titulo fechado e
    // atualizarTopicos() (uma classe a mais nas linhas, fora do modelo do Quill), porque o CSS sozinho nao sabe onde
    // o corpo termina.
    const Topico = new ClassAttributor('toggle', 'ql-toggle', { scope: Scope.BLOCK, whitelist: ['aberto', 'fechado', 'corpo'] });
    Quill.register({ 'formats/toggle': Topico }, true);

    // A divisoria: uma linha horizontal (um bloco que nao tem texto).
    const BlocoSemTexto = Quill.import('blots/block/embed');
    class Divisoria extends BlocoSemTexto {}
    Divisoria.blotName = 'divider';
    Divisoria.tagName = 'hr';
    Quill.register(Divisoria);

    // A imagem: o formato padrao do Quill so aceita http, https e data; as nossas vem de blink-anexo://<uuid>.<ext>.
    const Imagem = Quill.import('formats/image');
    class ImagemDaFolha extends Imagem {
      static sanitize(url) {
        return /^blink-anexo:\/\/[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$/.test(url) ? url : '//:0';
      }
    }
    Quill.register('formats/image', ImagemDaFolha, true);
  }

  // --- Os blocos do menu "/" ---------------------------------------------------------------------------

  const BLOCOS = [
    { id: 'titulo1', rotulo: 'Título 1', dica: '#', aplicar: (q, i) => q.formatLine(i, 1, 'header', 1, 'user') },
    { id: 'titulo2', rotulo: 'Título 2', dica: '##', aplicar: (q, i) => q.formatLine(i, 1, 'header', 2, 'user') },
    { id: 'titulo3', rotulo: 'Título 3', dica: '###', aplicar: (q, i) => q.formatLine(i, 1, 'header', 3, 'user') },
    { id: 'lista', rotulo: 'Lista', dica: '-', aplicar: (q, i) => q.formatLine(i, 1, 'list', 'bullet', 'user') },
    { id: 'numerada', rotulo: 'Lista numerada', dica: '1.', aplicar: (q, i) => q.formatLine(i, 1, 'list', 'ordered', 'user') },
    { id: 'tarefas', rotulo: 'Lista de tarefas', dica: '[]', aplicar: (q, i) => q.formatLine(i, 1, 'list', 'unchecked', 'user') },
    { id: 'citacao', rotulo: 'Citação', dica: '>', aplicar: (q, i) => q.formatLine(i, 1, 'blockquote', true, 'user') },
    { id: 'codigo', rotulo: 'Código', dica: '```', aplicar: (q, i) => q.formatLine(i, 1, 'code-block', true, 'user') },
    { id: 'topico', rotulo: 'Tópico expansível', dica: '>>', aplicar: (q, i) => q.formatLine(i, 1, 'toggle', 'aberto', 'user') },
    {
      id: 'divisoria',
      rotulo: 'Divisória',
      dica: '---',
      aplicar: (q, i) => {
        q.insertEmbed(i, 'divider', true, 'user');
        q.setSelection(i + 1, 0, 'user');
      },
    },
    { id: 'imagem', rotulo: 'Imagem', dica: '', aplicar: null },
  ];

  /** Esconde o corpo de cada topico expansivel FECHADO de um Quill (ver "Topico expansivel" em criar()). */
  function esconderCorposFechados(quill) {
    let fechado = false;
    for (const linha of quill.getLines()) {
      const no = linha.domNode;
      const valor = (no.className.match(/ql-toggle-(aberto|fechado|corpo)/) || [])[1];
      if (valor === 'aberto' || valor === 'fechado') fechado = valor === 'fechado';
      else if (valor !== 'corpo') fechado = false;
      no.classList.toggle('ql-toggle-oculto', valor === 'corpo' && fechado);
    }
  }

  /**
   * Monta a folha SO PARA LEITURA, na largura real (794 px, sem zoom), para tirar o print dela
   * (imagem-folha.js, na pagina impressao.html). Devolve (uma Promise) a altura usada, em px: o fim do texto ou do
   * desenho mais baixo, o que for maior, mais a margem de baixo (e nunca menos que 300).
   */
  async function montarImpressao(raiz, folha) {
    registrarFormatos();
    raiz.replaceChildren();

    const editor = el('div', { class: 'folha-editor' });
    const tintaSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tintaSvg.setAttribute('class', 'folha-tinta');
    tintaSvg.setAttribute('width', String(LARGURA_DA_FOLHA));
    raiz.appendChild(el('div', { class: 'folha-papel folha-impressa' }, [editor, tintaSvg]));

    const quill = new Quill(editor, { readOnly: true, modules: { toolbar: false }, formats: FORMATOS });
    quill.setContents(folha.conteudo, 'silent');
    esconderCorposFechados(quill);

    const tinta = window.Blink.tinta.criar(tintaSvg, { zoom: () => 1, aoMudar: () => {} });
    tinta.definir(folha.tinta || []);

    // As imagens carregam de forma assincrona: a altura so vale depois delas.
    await Promise.all([...editor.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((resolver) => { img.onload = resolver; img.onerror = resolver; }))));

    const margem = 56;
    let baixoDaTinta = 0;
    for (const traco of folha.tinta || []) for (const [, y] of traco.p) baixoDaTinta = Math.max(baixoDaTinta, y + traco.w / 2 + 12);
    const altura = Math.ceil(Math.max(300, editor.querySelector('.ql-editor').scrollHeight, baixoDaTinta + margem));

    tintaSvg.setAttribute('height', String(altura));
    tintaSvg.setAttribute('viewBox', `0 0 ${LARGURA_DA_FOLHA} ${altura}`);
    return altura;
  }

  /**
   * Cria a folha dentro de `raiz` (um <div> vazio).
   *
   *   aoMudar()       a folha mudou (texto ou desenho): a tela marca para gravar
   *   aoAviso(texto)  um recado para o usuario (imagem recusada, por exemplo)
   *   obterArquivo()  o arquivo aberto, para guardar as imagens dele
   */
  function criar(raiz, { aoMudar, aoAviso, obterArquivo }) {
    registrarFormatos();

    let arquivoAtual = '';
    let sujo = false;
    let relogio = null;
    let zoom = 1;

    // --- A estrutura ---------------------------------------------------------------------------------

    const editor = el('div', { class: 'folha-editor' });
    const tintaSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tintaSvg.setAttribute('class', 'folha-tinta');
    tintaSvg.setAttribute('width', String(LARGURA_DA_FOLHA));
    const papel = el('div', { class: 'folha-papel' }, [editor, tintaSvg]);
    const caixa = el('div', { class: 'folha-caixa' }, [papel]);

    const barraFlutuante = el('div', { class: 'folha-flutuante', hidden: true, role: 'toolbar', 'aria-label': 'Formatar o texto selecionado' });
    const menuDeBlocos = el('div', { class: 'folha-menu', hidden: true, role: 'listbox', 'aria-label': 'Blocos' });
    const area = el('div', { class: 'folha-area' }, [caixa, barraFlutuante, menuDeBlocos]);
    const barraDeFerramentas = el('div', { class: 'folha-ferramentas', role: 'toolbar', 'aria-label': 'Ferramentas da folha' });

    window.Blink.ui.anexar(raiz, [barraDeFerramentas, area]);

    // --- O editor ----------------------------------------------------------------------------------

    // Atalhos de Markdown. O Quill 2 ja converte "- ", "* ", "1. ", "[] " e "[x] " em listas; faltam os titulos, a
    // citacao, o codigo e a divisoria. Vao nas OPCOES do teclado, e nao em addBinding(): o Enter padrao do Quill e
    // acrescentado logo depois das opcoes e, se estes viessem depois dele, nunca seriam chamados.
    const tirarPrefixo = (trecho, contexto) => {
      const inicio = trecho.index - contexto.prefix.length;
      quill.deleteText(inicio, contexto.prefix.length, 'user');
      return inicio;
    };
    const atalhoDeEspaco = (prefixo, formatar) => ({
      key: ' ',
      collapsed: true,
      format: { 'code-block': false },
      prefix: prefixo,
      handler: (trecho, contexto) => formatar(tirarPrefixo(trecho, contexto)),
    });
    const atalhos = {
      'blink titulo 3': atalhoDeEspaco(/^###$/, (i) => quill.formatLine(i, 1, 'header', 3, 'user')),
      'blink titulo 2': atalhoDeEspaco(/^##$/, (i) => quill.formatLine(i, 1, 'header', 2, 'user')),
      'blink titulo 1': atalhoDeEspaco(/^#$/, (i) => quill.formatLine(i, 1, 'header', 1, 'user')),
      'blink citacao': atalhoDeEspaco(/^>$/, (i) => quill.formatLine(i, 1, 'blockquote', true, 'user')),
      // Uma URL digitada vira link ao dar espaco ("https://..." ou "www...."): o espaco entra FORA do link.
      'blink autolink': {
        key: ' ',
        collapsed: true,
        format: { 'code-block': false },
        prefix: /(?:https?:\/\/|www\.)\S+$/i,
        handler: (trecho, contexto) => {
          const achados = window.Blink.links.achar(contexto.prefix);
          const ultimo = achados[achados.length - 1];
          if (!ultimo || ultimo.fim !== contexto.prefix.length) return true;
          quill.formatText(trecho.index - ultimo.achado.length, ultimo.achado.length, 'link', ultimo.url, 'user');
          quill.insertText(trecho.index, ' ', { link: false }, 'user');
          quill.setSelection(trecho.index + 1, 0, 'user');
          return false;
        },
      },
      // ">> " numa linha vazia vira um topico expansivel.
      'blink topico': atalhoDeEspaco(/^>>$/, (i) => quill.formatLine(i, 1, 'toggle', 'aberto', 'user')),
      // Enter no TITULO: abre o topico e passa para a primeira linha do corpo. Enter numa linha VAZIA do corpo sai do
      // topico; numa linha com texto, o Enter padrao continua no corpo.
      'blink topico enter': {
        key: 'Enter',
        collapsed: true,
        format: { toggle: true },
        handler: (trecho, contexto) => {
          if (contexto.format.toggle === 'corpo') {
            if (!contexto.empty) return true;
            quill.formatLine(trecho.index, 1, 'toggle', false, 'user');
            return false;
          }
          quill.insertText(trecho.index, '\n', { toggle: 'aberto' }, 'user');
          quill.formatLine(trecho.index + 1, 1, 'toggle', 'corpo', 'user');
          quill.setSelection(trecho.index + 1, 0, 'user');
          return false;
        },
      },
      // Backspace no comeco de uma linha do topico: tira a linha do topico (vira paragrafo comum).
      'blink topico backspace': {
        key: 'Backspace',
        collapsed: true,
        offset: 0,
        format: { toggle: true },
        handler: (trecho) => {
          quill.formatLine(trecho.index, 1, 'toggle', false, 'user');
          return false;
        },
      },
      // "---" e Enter vira a divisoria; "```" e Enter vira bloco de codigo.
      'blink divisoria': {
        key: 'Enter',
        collapsed: true,
        prefix: /^---$/,
        handler: (trecho, contexto) => {
          const inicio = tirarPrefixo(trecho, contexto);
          quill.insertEmbed(inicio, 'divider', true, 'user');
          quill.setSelection(inicio + 1, 0, 'user');
        },
      },
      'blink codigo': {
        key: 'Enter',
        collapsed: true,
        prefix: /^```$/,
        handler: (trecho, contexto) => quill.formatLine(tirarPrefixo(trecho, contexto), 1, 'code-block', true, 'user'),
      },
    };

    const quill = new Quill(editor, {
      modules: { toolbar: false, history: { delay: 700, maxStack: 300, userOnly: true }, keyboard: { bindings: atalhos } },
      formats: FORMATOS,
      placeholder: 'Escreva aqui — digite / para ver os blocos',
    });
    quill.root.setAttribute('spellcheck', 'false');

    // HTML colado: imagem que nao e nossa (data:, http:) nao entra; so as de blink-anexo://.
    const Delta = Quill.import('delta');
    quill.clipboard.addMatcher('IMG', (no, delta) => (/^blink-anexo:\/\//.test(no.getAttribute('src') || '') ? delta : new Delta()));

    // --- A tinta ---------------------------------------------------------------------------------------

    const tinta = window.Blink.tinta.criar(tintaSvg, {
      zoom: () => zoom,
      aoMudar: () => {
        atualizarFerramentas();
        marcarComoMudada();
      },
    });

    // --- Zoom e tamanho -----------------------------------------------------------------------------------

    function alturaDaFolha() {
      return Math.max(ALTURA_MINIMA_DA_FOLHA, editor.scrollHeight);
    }

    /** Ajusta o zoom (cabe na largura, sem passar de 100%) e o tamanho da caixa que carrega a folha escalada. */
    function reencaixar() {
      const livre = area.clientWidth - 24; // 12px de respiro de cada lado
      zoom = livre > 0 ? Math.min(1, livre / LARGURA_DA_FOLHA) : 1;

      const altura = alturaDaFolha();
      // (a largura e a altura minima da folha sao do CSS: mudar o tamanho de quem se observa dentro do observador
      // faz o navegador reclamar de "ResizeObserver loop")
      papel.style.transform = `scale(${zoom})`;
      tintaSvg.setAttribute('height', String(altura));
      tintaSvg.setAttribute('viewBox', `0 0 ${LARGURA_DA_FOLHA} ${altura}`);
      // A caixa tem o tamanho JA ESCALADO: e ela que da a altura da rolagem.
      caixa.style.width = `${Math.round(LARGURA_DA_FOLHA * zoom)}px`;
      caixa.style.height = `${Math.round(papel.offsetHeight * zoom)}px`;
    }

    // No proximo quadro, e uma vez so por quadro: ajustar o tamanho na hora, de dentro do observador, e o que gera
    // o aviso "ResizeObserver loop completed with undelivered notifications".
    let quadroPedido = false;
    const observador = new ResizeObserver(() => {
      if (quadroPedido) return;
      quadroPedido = true;
      requestAnimationFrame(() => {
        quadroPedido = false;
        reencaixar();
      });
    });
    observador.observe(area);
    observador.observe(editor);

    // --- Gravar --------------------------------------------------------------------------------------------

    function marcarComoMudada() {
      sujo = true;
      clearTimeout(relogio);
      relogio = setTimeout(() => { if (aoMudar) aoMudar(); }, ATRASO_DE_GRAVACAO);
    }

    /** O que vai para o disco: o Delta do Quill e os tracos, em JSON puro. */
    function conteudoAtual() {
      return { conteudo: JSON.parse(JSON.stringify(quill.getContents())), tinta: tinta.obter() };
    }

    quill.on('text-change', (delta, anterior, origem) => {
      if (origem === 'silent') return;
      marcarComoMudada();
      aoMudarOTexto();
    });

    // --- A barra flutuante ---------------------------------------------------------------------------------------

    /** Os botoes de formato: negrito, italico, sublinhado, riscado, cor, marca-texto. */
    const botoesDeFormato = [];

    function botaoDeFormato(formato, rotulo, titulo, estilo) {
      const botao = el('button', { class: `folha-formato ${estilo || ''}`, type: 'button', title: titulo, 'aria-label': titulo, texto: rotulo });
      botao.addEventListener('mousedown', (evento) => evento.preventDefault()); // nao tira a selecao do texto
      botao.addEventListener('click', () => {
        const atual = quill.getFormat();
        quill.format(formato, !atual[formato], 'user');
        pintarFormatos();
      });
      botoesDeFormato.push({ botao, formato });
      return botao;
    }

    /** Um botao que abre uma fileira de cores: `formato` e 'color' ou 'background'. */
    function botaoDeCor(formato, rotulo, titulo, cores) {
      const fileira = el('div', { class: 'folha-cores', hidden: true });
      const sem = el('button', { class: 'folha-cor sem', type: 'button', title: 'Sem cor', 'aria-label': 'Sem cor', texto: '×' });
      sem.addEventListener('mousedown', (evento) => evento.preventDefault());
      sem.addEventListener('click', () => { quill.format(formato, false, 'user'); fileira.hidden = true; });
      window.Blink.ui.anexar(fileira, [sem]);

      for (const cor of cores) {
        const b = el('button', { class: 'folha-cor', type: 'button', title: cor.rotulo, 'aria-label': cor.rotulo, 'data-cor': cor.nome });
        b.style.background = cor.hex;
        b.addEventListener('mousedown', (evento) => evento.preventDefault());
        b.addEventListener('click', () => { quill.format(formato, cor.nome, 'user'); fileira.hidden = true; });
        fileira.appendChild(b);
      }

      const botao = el('button', { class: `folha-formato folha-formato-cor ${formato === 'color' ? 'cor-texto' : 'cor-fundo'}`, type: 'button', title: titulo, 'aria-label': titulo, texto: rotulo });
      botao.addEventListener('mousedown', (evento) => evento.preventDefault());
      botao.addEventListener('click', () => {
        const abrir = fileira.hidden;
        for (const f of barraFlutuante.querySelectorAll('.folha-cores')) f.hidden = true;
        fileira.hidden = !abrir;
      });
      return el('span', { class: 'folha-grupo-cor' }, [botao, fileira]);
    }

    window.Blink.ui.anexar(barraFlutuante, [
      botaoDeFormato('bold', 'N', 'Negrito (Ctrl+B)', 'negrito'),
      botaoDeFormato('italic', 'I', 'Itálico (Ctrl+I)', 'italico'),
      botaoDeFormato('underline', 'S', 'Sublinhado (Ctrl+U)', 'sublinhado'),
      botaoDeFormato('strike', 'T', 'Riscado', 'riscado'),
      botaoDeCor('color', 'A', 'Cor do texto', CORES_DO_TEXTO),
      botaoDeCor('background', 'M', 'Marca-texto', CORES_DO_MARCA_TEXTO),
    ]);

    function pintarFormatos() {
      const atual = quill.getFormat();
      for (const { botao, formato } of botoesDeFormato) botao.classList.toggle('ligado', !!atual[formato]);
    }

    /**
     * Coloca um elemento (a barra, o menu) perto de um retangulo da TELA (getBoundingClientRect, que ja vem com o
     * zoom da folha), em coordenadas da area que rola. Acima do retangulo ou abaixo dele, centrado nele ou
     * alinhado a esquerda dele.
     */
    function posicionarPerto(elemento, retangulo, { acima = false, centrar = true } = {}) {
      const a = area.getBoundingClientRect();
      const esquerda = retangulo.left - a.left - area.clientLeft + area.scrollLeft + (centrar ? retangulo.width / 2 : 0);
      const topo = retangulo.top - a.top - area.clientTop + area.scrollTop;
      const base = topo + retangulo.height;

      elemento.hidden = false;
      const larguraDoElemento = elemento.offsetWidth;
      const maximo = area.scrollLeft + area.clientWidth - larguraDoElemento - 6;
      const desejado = centrar ? esquerda - larguraDoElemento / 2 : esquerda;
      elemento.style.left = `${Math.max(area.scrollLeft + 6, Math.min(desejado, maximo))}px`;
      elemento.style.top = `${acima ? Math.max(area.scrollTop + 4, topo - elemento.offsetHeight - 8) : base + 6}px`;
    }

    /** O retangulo (na tela) do texto selecionado, ou null. */
    function retanguloDaSelecao() {
      const selecao = window.getSelection();
      if (!selecao || selecao.rangeCount === 0 || !editor.contains(selecao.anchorNode)) return null;
      const r = selecao.getRangeAt(0).getBoundingClientRect();
      return r.width === 0 && r.height === 0 ? null : r;
    }

    function mostrarOuEsconderABarra() {
      const trecho = quill.getSelection();
      const r = trecho && trecho.length > 0 && tinta.ferramenta === 'texto' && quill.hasFocus() ? retanguloDaSelecao() : null;
      if (!r) {
        barraFlutuante.hidden = true;
        for (const f of barraFlutuante.querySelectorAll('.folha-cores')) f.hidden = true;
        return;
      }
      posicionarPerto(barraFlutuante, r, { acima: true });
      pintarFormatos();
    }

    // --- O menu "/" -----------------------------------------------------------------------------------------------

    let menuAberto = false;
    let opcoesDoMenu = [];
    let destaque = 0;

    /** O texto da linha do cursor ate o cursor, e onde a linha comeca. */
    function linhaAteOCursor() {
      const trecho = quill.getSelection();
      if (!trecho || trecho.length !== 0) return null;
      const [linha, deslocamento] = quill.getLine(trecho.index);
      if (!linha) return null;
      const inicio = trecho.index - deslocamento;
      return { inicio, deslocamento, texto: quill.getText(inicio, deslocamento), formato: quill.getFormat(trecho.index) };
    }

    function fecharMenu() {
      menuAberto = false;
      menuDeBlocos.hidden = true;
    }

    function desenharMenu() {
      menuDeBlocos.replaceChildren();
      opcoesDoMenu.forEach((bloco, i) => {
        const item = el('div', { class: `folha-menu-item${i === destaque ? ' destacado' : ''}`, role: 'option', 'aria-selected': String(i === destaque) }, [
          el('span', { class: 'folha-menu-rotulo', texto: bloco.rotulo }),
          el('span', { class: 'folha-menu-dica', texto: bloco.dica }),
        ]);
        item.addEventListener('mousedown', (evento) => evento.preventDefault());
        item.addEventListener('click', () => escolherBloco(bloco));
        item.addEventListener('mousemove', () => {
          if (destaque !== i) {
            destaque = i;
            desenharMenu();
          }
        });
        menuDeBlocos.appendChild(item);
      });
    }

    /** Abre o menu se a linha do cursor e "/" e o que se digitou depois; senao fecha. */
    function atualizarMenu() {
      const linha = linhaAteOCursor();
      // So num paragrafo comum: no codigo, a barra e uma barra.
      if (!linha || !/^\/[^\s/]*$/.test(linha.texto) || linha.formato['code-block']) {
        fecharMenu();
        return;
      }

      const consulta = normalizar(linha.texto.slice(1));
      opcoesDoMenu = BLOCOS.filter((b) => consulta === '' || normalizar(b.rotulo).includes(consulta) || normalizar(b.id).includes(consulta));
      if (opcoesDoMenu.length === 0) {
        fecharMenu();
        return;
      }

      if (!menuAberto) destaque = 0;
      destaque = Math.min(destaque, opcoesDoMenu.length - 1);
      menuAberto = true;
      desenharMenu();

      // Logo abaixo da linha em que se digita, alinhado a esquerda dela.
      const [blocoDaLinha] = quill.getLine(linha.inicio);
      if (blocoDaLinha) posicionarPerto(menuDeBlocos, blocoDaLinha.domNode.getBoundingClientRect(), { centrar: false });
    }

    function escolherBloco(bloco) {
      const linha = linhaAteOCursor();
      fecharMenu();
      if (!linha) return;

      // Tira o "/texto" que foi digitado e aplica o bloco na linha.
      quill.deleteText(linha.inicio, linha.deslocamento, 'user');
      if (bloco.id === 'imagem') {
        escolherImagem();
        return;
      }
      bloco.aplicar(quill, linha.inicio);
    }

    // O teclado do menu: setas, Enter, Tab e Esc, antes do Quill ver a tecla.
    quill.root.addEventListener(
      'keydown',
      (evento) => {
        if (!menuAberto) return;
        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
          evento.preventDefault();
          evento.stopImmediatePropagation();
          destaque = (destaque + (evento.key === 'ArrowDown' ? 1 : -1) + opcoesDoMenu.length) % opcoesDoMenu.length;
          desenharMenu();
        } else if (evento.key === 'Enter' || evento.key === 'Tab') {
          evento.preventDefault();
          evento.stopImmediatePropagation();
          escolherBloco(opcoesDoMenu[destaque]);
        } else if (evento.key === 'Escape') {
          evento.preventDefault();
          evento.stopImmediatePropagation();
          fecharMenu();
        }
      },
      true
    );

    /** Depois de qualquer mudanca do texto ou do cursor: o menu e a barra se acertam. */
    /**
     * Esconde as linhas de corpo de um topico FECHADO (uma classe a mais no no da linha, que o Quill nao conhece e
     * nao mexe). Refeito a cada mudanca do texto e ao abrir uma folha: desfazer, refazer e setContents trocam os nos.
     */
    const atualizarTopicos = () => esconderCorposFechados(quill);

    // A seta do titulo e um ::before na margem esquerda dele; um clique ali abre ou fecha o topico.
    quill.root.addEventListener('mousedown', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element) || !/ql-toggle-(aberto|fechado)/.test(alvo.className) || evento.offsetX > 22) return;
      evento.preventDefault();
      const indice = quill.getIndex(Quill.find(alvo));
      quill.formatLine(indice, 1, 'toggle', /ql-toggle-aberto/.test(alvo.className) ? 'fechado' : 'aberto', 'user');
    });

    // Links da folha: um clique so poe o cursor; Ctrl+clique abre no navegador. Nunca navega dentro da janela.
    quill.root.addEventListener('click', (evento) => {
      const link = evento.target instanceof Element ? evento.target.closest('a[href]') : null;
      if (!link) return;
      evento.preventDefault();
      if (evento.ctrlKey || evento.metaKey) window.Blink.links.abrir(link.getAttribute('href'));
    });

    function aoMudarOTexto() {
      atualizarTopicos();
      // O cursor so e lido direito depois de o Quill acabar de atualizar a selecao: dentro do proprio evento
      // de mudanca ele ainda aponta para antes do que acabou de ser digitado (o "/" nao contaria).
      setTimeout(atualizarMenu, 0);
      // A altura da folha acompanha o texto.
      reencaixar();
    }

    quill.on('selection-change', (trecho) => {
      if (!trecho) {
        barraFlutuante.hidden = true;
        fecharMenu();
        return;
      }
      mostrarOuEsconderABarra();
      atualizarMenu();
    });

    // Clicar fora do menu ou da barra fecha os dois.
    document.addEventListener('mousedown', (evento) => {
      if (!menuDeBlocos.contains(evento.target)) fecharMenu();
      if (!barraFlutuante.contains(evento.target) && !editor.contains(evento.target)) barraFlutuante.hidden = true;
    });

    // --- Imagens: colar, arrastar e escolher -------------------------------------------------------------------------------

    /** Guarda os bytes de uma imagem no processo principal e poe a imagem na folha, no cursor. */
    async function inserirImagem(arquivoDeImagem) {
      const arquivo = obterArquivo();
      if (!arquivo) return;

      const bytes = new Uint8Array(await arquivoDeImagem.arrayBuffer());
      const r = await window.blink.livre.anexarImagem(arquivo, bytes);
      if (!r.ok) {
        const motivos = { grande: 'A imagem passa de 15 MB.', tipo: 'Só PNG, JPEG, GIF e WebP.', entrada: 'Não consegui ler a imagem.' };
        if (aoAviso) aoAviso(motivos[r.motivo] || 'Não foi possível guardar a imagem.');
        return;
      }

      const trecho = quill.getSelection(true);
      const indice = trecho ? trecho.index : Math.max(0, quill.getLength() - 1);
      quill.insertEmbed(indice, 'image', r.url, 'user');
      quill.setSelection(indice + 1, 0, 'user');
    }

    const tiposDeImagem = /^image\/(png|jpeg|gif|webp)$/;

    quill.root.addEventListener(
      'paste',
      (evento) => {
        const arquivos = [...((evento.clipboardData && evento.clipboardData.files) || [])].filter((f) => tiposDeImagem.test(f.type));
        if (arquivos.length === 0) return; // texto: o Quill cuida
        evento.preventDefault();
        evento.stopImmediatePropagation();
        for (const a of arquivos) inserirImagem(a);
      },
      true
    );

    quill.root.addEventListener('dragover', (evento) => {
      if ([...((evento.dataTransfer && evento.dataTransfer.items) || [])].some((i) => i.kind === 'file')) evento.preventDefault();
    });
    quill.root.addEventListener(
      'drop',
      (evento) => {
        const arquivos = [...((evento.dataTransfer && evento.dataTransfer.files) || [])].filter((f) => tiposDeImagem.test(f.type));
        if (arquivos.length === 0) return;
        evento.preventDefault();
        evento.stopImmediatePropagation();
        for (const a of arquivos) inserirImagem(a);
      },
      true
    );

    /** O "Imagem" do menu "/": abre o seletor de arquivo do Windows. */
    function escolherImagem() {
      const seletor = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
      seletor.addEventListener('change', () => {
        if (seletor.files && seletor.files[0]) inserirImagem(seletor.files[0]);
      });
      seletor.click();
    }

    // --- As ferramentas: texto, caneta, marca-texto, borracha ------------------------------------------------------------

    const botoesDeFerramenta = {};
    const botoesDeEspessura = [];
    const botoesDeCorDaTinta = [];
    let botaoDesfazer = null;
    let botaoRefazer = null;

    function icone(caminhos) {
      return svg(`<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${caminhos}</svg>`);
    }

    const ICONES = {
      texto: '<path d="M5 5h14M12 5v14M9 19h6"/>',
      caneta: '<path d="M4 20l1-5L16.5 3.5a2.1 2.1 0 013 3L8 18z"/><path d="M14 6l4 4"/>',
      marca: '<path d="M9 3l6 6-8 8H3v-4z"/><path d="M13 7l4 4M3 21h10"/>',
      borracha: '<path d="M16 3l5 5-9 9H7L3 13z"/><path d="M9 20h12"/><path d="M8 8l8 8"/>',
      retangulo: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
      elipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6"/>',
      linha: '<path d="M5 19L19 5"/>',
      seta: '<path d="M5 19L19 5"/><path d="M10 5h9v9"/>',
    };

    function botaoDeFerramenta(nome, titulo) {
      const botao = el('button', { class: 'folha-ferramenta', type: 'button', title: titulo, 'aria-label': titulo, 'aria-pressed': 'false' });
      botao.appendChild(icone(ICONES[nome]));
      botao.addEventListener('mousedown', (evento) => evento.preventDefault());
      botao.addEventListener('click', () => escolherFerramenta(nome));
      botoesDeFerramenta[nome] = botao;
      return botao;
    }

    const grupoDaTinta = el('div', { class: 'folha-grupo-tinta' });
    ['Fina', 'Média', 'Grossa'].forEach((rotulo, i) => {
      const botao = el('button', { class: 'folha-espessura', type: 'button', title: `Espessura ${rotulo.toLowerCase()}`, 'aria-label': `Espessura ${rotulo.toLowerCase()}`, 'data-espessura': String(i) });
      botao.appendChild(el('span', { class: `ponto ponto-${i}` }));
      botao.addEventListener('mousedown', (evento) => evento.preventDefault());
      botao.addEventListener('click', () => {
        tinta.espessura = i;
        atualizarFerramentas();
      });
      botoesDeEspessura.push(botao);
      grupoDaTinta.appendChild(botao);
    });
    for (const hex of CORES_DA_TINTA) {
      const botao = el('button', { class: 'folha-cor-tinta', type: 'button', title: 'Cor', 'aria-label': `Cor ${hex}`, 'data-cor': hex });
      botao.style.background = hex;
      botao.addEventListener('mousedown', (evento) => evento.preventDefault());
      botao.addEventListener('click', () => {
        tinta.cor = hex;
        atualizarFerramentas();
      });
      botoesDeCorDaTinta.push(botao);
      grupoDaTinta.appendChild(botao);
    }
    botaoDesfazer = el('button', { class: 'folha-acao', type: 'button', title: 'Desfazer o desenho (Ctrl+Z)', 'aria-label': 'Desfazer o desenho', texto: '↶' });
    botaoRefazer = el('button', { class: 'folha-acao', type: 'button', title: 'Refazer o desenho (Ctrl+Y)', 'aria-label': 'Refazer o desenho', texto: '↷' });
    for (const b of [botaoDesfazer, botaoRefazer]) b.addEventListener('mousedown', (evento) => evento.preventDefault());
    botaoDesfazer.addEventListener('click', () => tinta.desfazer());
    botaoRefazer.addEventListener('click', () => tinta.refazer());
    window.Blink.ui.anexar(grupoDaTinta, [botaoDesfazer, botaoRefazer]);

    window.Blink.ui.anexar(barraDeFerramentas, [
      botaoDeFerramenta('texto', 'Texto'),
      botaoDeFerramenta('caneta', 'Caneta'),
      botaoDeFerramenta('marca', 'Marca-texto (também serve para pintar)'),
      botaoDeFerramenta('borracha', 'Borracha: apaga o traço tocado'),
      el('span', { class: 'folha-separador', 'aria-hidden': 'true' }),
      botaoDeFerramenta('retangulo', 'Retângulo (Shift: quadrado)'),
      botaoDeFerramenta('elipse', 'Elipse (Shift: círculo)'),
      botaoDeFerramenta('linha', 'Linha (Shift: ângulos de 45°)'),
      botaoDeFerramenta('seta', 'Seta (Shift: ângulos de 45°)'),
      grupoDaTinta,
    ]);

    function escolherFerramenta(nome) {
      tinta.ferramenta = nome;
      barraFlutuante.hidden = nome !== 'texto' ? true : barraFlutuante.hidden;
      fecharMenu();
      atualizarFerramentas();
      if (nome === 'texto') quill.focus();
    }

    /** Pinta o estado das ferramentas: qual esta ligada, a espessura, a cor, desfazer e refazer. */
    function atualizarFerramentas() {
      for (const [nome, botao] of Object.entries(botoesDeFerramenta)) {
        const ligada = tinta.ferramenta === nome;
        botao.classList.toggle('ligada', ligada);
        botao.setAttribute('aria-pressed', String(ligada));
      }
      // Espessura e cor so fazem sentido para a caneta e o marca-texto.
      const desenha = tinta.ferramenta !== 'texto' && tinta.ferramenta !== 'borracha';
      grupoDaTinta.hidden = tinta.ferramenta === 'texto';
      for (const b of botoesDeEspessura) {
        b.hidden = !desenha;
        b.classList.toggle('ligada', Number(b.getAttribute('data-espessura')) === tinta.espessura);
      }
      for (const b of botoesDeCorDaTinta) {
        b.hidden = !desenha;
        b.classList.toggle('ligada', b.getAttribute('data-cor') === tinta.cor);
      }
      botaoDesfazer.disabled = !tinta.podeDesfazer();
      botaoRefazer.disabled = !tinta.podeRefazer();
      raiz.classList.toggle('desenhando', tinta.ferramenta !== 'texto');
    }

    /** Ctrl+Z e Ctrl+Y com uma ferramenta de desenho ligada valem para a tinta (o texto tem o proprio, no Quill). */
    window.addEventListener('keydown', (evento) => {
      if (raiz.hidden || tinta.ferramenta === 'texto') return;
      if (!(evento.ctrlKey || evento.metaKey) || evento.altKey) return;
      const tecla = evento.key.toLowerCase();
      if (tecla === 'z' && !evento.shiftKey) {
        evento.preventDefault();
        tinta.desfazer();
      } else if (tecla === 'y' || (tecla === 'z' && evento.shiftKey)) {
        evento.preventDefault();
        tinta.refazer();
      }
    });

    atualizarFerramentas();

    // --- Interface publica -----------------------------------------------------------------------------------------------------

    /** Abre a folha de um arquivo: o Delta no editor e os tracos na tinta. Nada disso vai para a gravacao (silencioso). */
    function abrir(arquivo, folha) {
      clearTimeout(relogio);
      arquivoAtual = arquivo;
      quill.setContents(folha.conteudo, 'silent');
      atualizarTopicos();
      tinta.definir(folha.tinta || []);
      quill.history.clear();
      sujo = false;
      escolherFerramenta('texto');
      area.scrollTop = 0;
      reencaixar();
    }

    /** Apaga a folha da memoria (ao sair do arquivo): nada do conteudo fica na tela. */
    function esvaziar() {
      clearTimeout(relogio);
      arquivoAtual = '';
      sujo = false;
      quill.setContents([{ insert: '\n' }], 'silent');
      quill.history.clear();
      tinta.definir([]);
      barraFlutuante.hidden = true;
      fecharMenu();
    }

    return {
      abrir,
      esvaziar,
      reencaixar,
      /** Grava agora, se algo mudou. Devolve a Promise da gravacao. */
      async salvarAgora() {
        clearTimeout(relogio);
        if (!sujo || !arquivoAtual) return;
        const arquivo = arquivoAtual;
        sujo = false;
        const r = await window.blink.livre.salvar(arquivo, conteudoAtual());
        // Recusada (grande demais, pasta sumiu): fica marcada como nao gravada e o usuario e avisado.
        if (!r || r.ok === false) {
          if (arquivoAtual === arquivo) sujo = true;
          if (aoAviso) aoAviso('Não consegui gravar a folha.');
        }
      },
      /** O mesmo, bloqueando ate gravar: para a hora de fechar a janela. */
      salvarSincrono() {
        clearTimeout(relogio);
        if (!sujo || !arquivoAtual) return;
        sujo = false;
        window.blink.livre.salvarSincrono(arquivoAtual, conteudoAtual());
      },
      /** O texto da folha (o botao C copia isto); as linhas de corpo de um topico expansivel saem recuadas. */
      texto: () => quill.getLines().map((linha) => {
        const indice = quill.getIndex(linha);
        const texto = quill.getText(indice, linha.length()).replace(/\n$/, '');
        return quill.getFormat(indice, 0).toggle === 'corpo' ? '  ' + texto : texto;
      }).join('\n').replace(/\n+$/, ''),
      /** A vassoura: apaga o texto e o desenho. */
      limpar() {
        quill.setContents([{ insert: '\n' }], 'user');
        tinta.limpar();
      },
      /** True se a folha esta vazia (sem texto e sem desenho). */
      vazia: () => quill.getText().trim() === '' && tinta.total() === 0 && quill.getLength() <= 1,
      focar: () => quill.focus(),
      ferramenta: () => tinta.ferramenta,
      /** O Esc: com uma ferramenta de desenho ligada, volta para o texto. Devolve se tratou. */
      voltarParaTexto() {
        if (tinta.ferramenta === 'texto') return false;
        escolherFerramenta('texto');
        return true;
      },
      menuAberto: () => menuAberto,
      aberta: () => arquivoAtual !== '',
      // Para os testes e para a tela
      quill,
      tinta,
      zoom: () => zoom,
    };
  }

  window.Blink.folha = { criar, montarImpressao, LARGURA_DA_FOLHA, CORES_DO_TEXTO, CORES_DO_MARCA_TEXTO, CORES_DA_TINTA };
})();
