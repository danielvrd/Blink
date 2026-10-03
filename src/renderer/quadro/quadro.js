/**
 * A pagina do quadro branco: o Excalidraw (a biblioteca oficial, versao 0.17.x com build UMD) dentro de um <iframe>
 * do Fast Note. O Fast Note (renderer/note/quadro.js) manda e recebe mensagens (postMessage); aqui nao ha preload nem
 * acesso ao disco: quem le e grava o arquivo e o processo principal (src/main/notas-quadro.js).
 *
 * Do Fast Note para ca ({ blink: 'quadro', tipo, ... }):
 *   abrir        { sessao, cena }       monta o Excalidraw com essa cena (o JSON do Excalidraw); recomeca o desfazer
 *   pedirImagem  { id }                 exporta o quadro como PNG e devolve (tipo 'imagem')
 *   limpar       {}                     apaga tudo
 *   focar        {}                     poe o foco no quadro
 * Daqui para o Fast Note:
 *   pronto       {}                     a pagina carregou
 *   mudou        { sessao, cena }       o quadro mudou (400 ms depois da ultima mudanca, e so se o conteudo mudou de verdade)
 *   imagem       { id, bytes | vazio }  a resposta do pedirImagem
 *
 * Sem JSX (nao ha bundler): React.createElement.
 */

(function () {
  const e = React.createElement;
  const ATRASO = 400;

  const raiz = ReactDOM.createRoot(document.getElementById('raiz'));
  let api = null;
  let sessao = 0;
  let chave = 0;
  let ultimoTexto = null; // o que foi avisado por ultimo (ou o que veio ao abrir)
  let relogio = null;

  const enviar = (mensagem) => window.parent.postMessage({ blink: 'quadro', ...mensagem }, '*');

  const serializar = () => ExcalidrawLib.serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), 'local');

  /** Avisa o Fast Note, mas so se o desenho mudou: mexer na tela (rolar, zoom, escolher) tambem dispara o onChange. */
  function avisar() {
    if (!api) return;
    const texto = serializar();
    if (texto === ultimoTexto) return;
    ultimoTexto = texto;
    enviar({ tipo: 'mudou', sessao, cena: JSON.parse(texto) });
  }

  function aoMudar() {
    // A primeira chamada vem logo depois de montar: o que foi aberto e a referencia, nao uma mudanca.
    if (ultimoTexto === null && api) {
      ultimoTexto = serializar();
      return;
    }
    clearTimeout(relogio);
    relogio = setTimeout(avisar, ATRASO);
  }

  function abrir(cena, novaSessao) {
    clearTimeout(relogio);
    sessao = novaSessao;
    api = null;
    ultimoTexto = null;
    chave += 1;
    raiz.render(
      e(ExcalidrawLib.Excalidraw, {
        key: chave,
        theme: 'dark',
        langCode: 'pt-BR',
        initialData: {
          elements: cena.elements || [],
          appState: { viewBackgroundColor: '#ffffff', ...(cena.appState || {}) },
          files: cena.files || {},
          scrollToContent: true,
        },
        excalidrawAPI: (instancia) => { api = instancia; },
        onChange: aoMudar,
        // O Blink grava sozinho: nada de abrir/salvar arquivo nem trocar o tema por aqui.
        UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false } },
      })
    );
  }

  async function exportar(id) {
    if (!api) return enviar({ tipo: 'imagem', id, vazio: true });
    const elementos = api.getSceneElements().filter((el) => !el.isDeleted);
    if (elementos.length === 0) return enviar({ tipo: 'imagem', id, vazio: true });
    const estado = api.getAppState();
    const blob = await ExcalidrawLib.exportToBlob({
      elements: elementos,
      appState: { ...estado, exportBackground: true, exportWithDarkMode: true },
      files: api.getFiles(),
      mimeType: 'image/png',
      exportPadding: 24,
    });
    return enviar({ tipo: 'imagem', id, bytes: await blob.arrayBuffer() });
  }

  window.addEventListener('message', (evento) => {
    // So o Fast Note (a pagina que contem este quadro) manda aqui.
    if (evento.source !== window.parent || !evento.data || evento.data.blink !== 'quadro') return;
    const m = evento.data;
    if (m.tipo === 'abrir' && m.cena && typeof m.cena === 'object') abrir(m.cena, m.sessao);
    else if (m.tipo === 'pedirImagem') exportar(m.id).catch(() => enviar({ tipo: 'imagem', id: m.id, erro: true }));
    else if (m.tipo === 'limpar' && api) api.resetScene();
    else if (m.tipo === 'focar') { window.focus(); const area = document.querySelector('.excalidraw'); if (area) area.focus(); }
  });

  // Fechar ou esconder a pagina com uma mudanca ainda esperando o atraso: avisa agora.
  window.addEventListener('pagehide', () => { clearTimeout(relogio); avisar(); });

  // So para os testes (a pagina nao tem acesso ao disco nem a rede): a API do Excalidraw montado.
  window.__quadro = { api: () => api };

  enviar({ tipo: 'pronto' });
})();
