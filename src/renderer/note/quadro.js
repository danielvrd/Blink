/**
 * O quadro branco dentro do Fast Note: um <iframe> com a pagina do Excalidraw (renderer/quadro) e a conversa com ela
 * por postMessage (as mensagens estao descritas em renderer/quadro/quadro.js).
 *
 * Aqui ficam o iframe (criado so quando o primeiro quadro abre: a pagina carrega o React e o Excalidraw, mais de 1 MB
 * de JavaScript que um Fast Note comum nunca precisa), a gravacao do que mudou e o "copiar como imagem". O disco e do
 * processo principal (window.blink.quadro.*).
 *
 * Cada vez que um quadro abre, a conversa ganha um numero de SESSAO: uma mudanca atrasada do quadro anterior, que
 * chegue depois da troca de arquivo, e ignorada em vez de gravada no arquivo errado.
 */

window.Blink = window.Blink || {};

(function () {
  const { el } = window.Blink.ui;

  /** Um quadro vazio, no formato do Excalidraw (quando o arquivo ainda nao tem o .excalidraw). */
  const CENA_VAZIA = () => ({ type: 'excalidraw', version: 2, source: 'blink', elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} });

  /**
   * Cria o quadro dentro de `raiz` (um <div> vazio).
   *   aoAviso(texto)  um recado para o usuario (falha ao gravar, por exemplo)
   */
  function criar(raiz, { aoAviso }) {
    let iframe = null;
    let pronto = false;
    let pendente = null; // o abrir que esperou a pagina ficar pronta
    let arquivoAtual = '';
    let ultimaCena = null;
    let sessao = 0;
    let sujo = false;
    let proximoId = 1;
    const esperandoImagem = new Map();

    const enviar = (mensagem) => {
      if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ blink: 'quadro', ...mensagem }, '*');
    };

    function receber(evento) {
      // So o iframe do quadro fala aqui.
      if (!iframe || evento.source !== iframe.contentWindow || !evento.data || evento.data.blink !== 'quadro') return;
      const m = evento.data;

      if (m.tipo === 'pronto') {
        pronto = true;
        if (pendente) {
          enviar(pendente);
          pendente = null;
        }
      } else if (m.tipo === 'mudou') {
        if (m.sessao !== sessao || !arquivoAtual) return;
        ultimaCena = m.cena;
        sujo = true;
        salvarAgora();
      } else if (m.tipo === 'imagem') {
        const resolver = esperandoImagem.get(m.id);
        if (resolver) {
          esperandoImagem.delete(m.id);
          resolver(m);
        }
      }
    }

    function garantirIframe() {
      if (iframe) return;
      iframe = el('iframe', { class: 'quadro-frame', src: '../quadro/index.html', title: 'Quadro branco' });
      raiz.appendChild(iframe);
      window.addEventListener('message', receber);
    }

    async function salvarAgora() {
      if (!sujo || !arquivoAtual || !ultimaCena) return;
      const arquivo = arquivoAtual;
      sujo = false;
      const r = await window.blink.quadro.salvar(arquivo, ultimaCena);
      if (!r || r.ok === false) {
        if (arquivoAtual === arquivo) sujo = true;
        if (aoAviso) aoAviso('Não consegui gravar o quadro.');
      }
    }

    return {
      /** Abre o quadro de um arquivo (a cena vem do disco; null = quadro vazio). */
      abrir(arquivo, cena) {
        garantirIframe();
        arquivoAtual = arquivo;
        ultimaCena = cena || CENA_VAZIA();
        sujo = false;
        sessao += 1;
        const mensagem = { blink: 'quadro', tipo: 'abrir', sessao, cena: ultimaCena };
        if (pronto) enviar(mensagem);
        else pendente = mensagem;
      },
      /** Sai do quadro (ao trocar de arquivo): nada mais e gravado por ele. */
      esvaziar() {
        arquivoAtual = '';
        ultimaCena = null;
        sujo = false;
        pendente = null;
        sessao += 1;
      },
      salvarAgora,
      /** Para a hora de fechar a janela: bloqueia ate gravar. */
      salvarSincrono() {
        if (!sujo || !arquivoAtual || !ultimaCena) return;
        sujo = false;
        window.blink.quadro.salvarSincrono(arquivoAtual, ultimaCena);
      },
      /** A vassoura: apaga o quadro todo (o Excalidraw avisa a mudanca e ela e gravada). */
      limpar() { enviar({ tipo: 'limpar' }); },
      focar() {
        if (iframe) iframe.focus();
        enviar({ tipo: 'focar' });
      },
      aberta: () => arquivoAtual !== '',
      /**
       * Copia o quadro como imagem PNG. Devolve { ok, largura, altura } ou { ok: false, motivo: 'vazio' | 'erro' }.
       * (O quadro exporta o PNG e o processo principal poe na area de transferencia.)
       */
      async copiarImagem() {
        if (!iframe || !pronto) return { ok: false, motivo: 'erro' };
        const id = proximoId++;
        const resposta = await new Promise((resolver) => {
          esperandoImagem.set(id, resolver);
          setTimeout(() => { if (esperandoImagem.delete(id)) resolver({ erro: true }); }, 20000);
          enviar({ tipo: 'pedirImagem', id });
        });
        if (resposta.vazio) return { ok: false, motivo: 'vazio' };
        if (resposta.erro || !resposta.bytes) return { ok: false, motivo: 'erro' };
        return window.blink.quadro.copiarImagem(resposta.bytes);
      },
      // Para os testes
      iframe: () => iframe,
      sessao: () => sessao,
      cena: () => ultimaCena,
    };
  }

  window.Blink.quadro = { criar, CENA_VAZIA };
})();
