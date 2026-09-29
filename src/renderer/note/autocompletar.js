/**
 * Autocomplete de notas no rascunho do Fast Note.
 *
 * Digitar "/" no comeco do rascunho abre uma lista com todas as notas, logo
 * acima do campo. Continuar digitando filtra. Escolher completa o texto
 * para "/daily " - e ai e so escrever o topico e dar Enter, que ele vai
 * para o daily.md (quem grava e o note.js).
 *
 * Com a lista aberta:
 *   setas        andam pela lista
 *   Enter / Tab  completam com a nota destacada
 *   Esc          fecham a lista e deixam continuar escrevendo - ela nao
 *                volta a abrir no mesmo trecho
 *   clique       completa com a nota clicada
 */

window.Blink = window.Blink || {};

(function () {
  const { el, limpar } = window.Blink.ui;

  /** O trecho que conta como comando: "/" e o que vier sem espaco, ate o cursor. */
  const TRECHO = /^\/(\S*)$/;

  /** Sem diferenciar maiuscula nem acento: "anotacoes" acha "Anotações". */
  function normalizar(texto) {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** Primeiro as notas que comecam com o digitado, depois as que contem. */
  function filtrar(nomes, digitado) {
    const busca = normalizar(digitado);
    const comecam = nomes.filter((n) => normalizar(n).startsWith(busca));
    const contem = nomes.filter((n) => !normalizar(n).startsWith(busca) && normalizar(n).includes(busca));
    return [...comecam, ...contem];
  }

  /**
   * Liga o autocomplete a um campo de texto.
   *
   *   campo       o textarea do rascunho
   *   popup       o elemento onde a lista e desenhada
   *   obterNomes  funcao que devolve os nomes das notas, sem ".md"
   *
   * Tem que ser ligado ANTES de qualquer outro tratador de teclas do campo:
   * com a lista aberta, o Enter completa - e nao pode chegar no tratador que
   * grava o topico.
   */
  function ligar(campo, popup, { obterNomes }) {
    let aberto = false;
    let itens = [];
    let destaque = 0;

    /**
     * O usuario apertou Esc: nao reabrir enquanto ele continuar no mesmo
     * comando. So volta quando o rascunho deixar de comecar com "/".
     */
    let dispensado = false;

    /** O que foi digitado depois da barra, ou null se o cursor nao esta num comando. */
    function trecho() {
      const antes = campo.value.slice(0, campo.selectionStart);
      const achado = antes.match(TRECHO);
      return achado ? achado[1] : null;
    }

    function desenhar(digitado) {
      limpar(popup);

      if (itens.length === 0) {
        popup.appendChild(el('div', { class: 'popup-vazio', texto: `Nenhuma nota com "${digitado}"` }));
        return;
      }

      itens.forEach((nome, indice) => {
        popup.appendChild(
          el('div', {
            class: indice === destaque ? 'popup-item destacado' : 'popup-item',
            role: 'option',
            // Mantem o foco no rascunho: o clique nao pode tirar o cursor dele.
            onmousedown: (evento) => evento.preventDefault(),
            onclick: () => completar(nome),
          }, [
            el('span', { class: 'popup-barra', texto: '/' }),
            el('span', { texto: nome }),
          ])
        );
      });

      popup.children[destaque]?.scrollIntoView({ block: 'nearest' });
    }

    function abrir(digitado) {
      const anteriores = itens.join('|');
      itens = filtrar(obterNomes(), digitado);
      // A lista mudou por causa da digitacao: o destaque volta para o topo.
      if (itens.join('|') !== anteriores || destaque >= itens.length) destaque = 0;
      aberto = true;
      popup.hidden = false;
      desenhar(digitado);
    }

    function fechar() {
      aberto = false;
      popup.hidden = true;
    }

    /** Troca o comando digitado pela nota escolhida, com um espaco depois. */
    function completar(nome) {
      const fimDoTrecho = campo.value.slice(1).search(/\s|$/) + 1;
      const resto = campo.value.slice(fimDoTrecho).replace(/^\s*/, '');
      const comando = `/${nome} `;
      campo.value = comando + resto;
      campo.setSelectionRange(comando.length, comando.length);
      fechar();
      campo.focus();
    }

    /** Abre, filtra ou fecha conforme o que esta no campo agora. */
    function atualizar() {
      if (!campo.value.startsWith('/')) dispensado = false;

      const digitado = trecho();
      if (digitado === null || dispensado) {
        fechar();
        return;
      }
      abrir(digitado);
    }

    campo.addEventListener('input', atualizar);
    campo.addEventListener('click', atualizar);
    campo.addEventListener('blur', fechar);

    campo.addEventListener(
      'keydown',
      (evento) => {
        if (!aberto) return;

        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
          if (itens.length === 0) return;
          evento.preventDefault();
          const passo = evento.key === 'ArrowDown' ? 1 : -1;
          destaque = (destaque + passo + itens.length) % itens.length;
          desenhar(trecho() || '');
        } else if ((evento.key === 'Enter' || evento.key === 'Tab') && !evento.shiftKey) {
          // Sem nota para completar, o Enter segue normal e quem grava avisa
          // que a nota nao existe.
          if (itens.length === 0) {
            fechar();
            return;
          }
          evento.preventDefault();
          evento.stopImmediatePropagation();
          completar(itens[destaque]);
        } else if (evento.key === 'Escape') {
          // Sem o stopPropagation o Esc chegaria na janela e fecharia o
          // Fast Note inteiro, em vez de so fechar a lista.
          evento.preventDefault();
          evento.stopPropagation();
          dispensado = true;
          fechar();
        }
      },
      // Captura: roda antes do tratador que grava o topico, mesmo que ele
      // tenha sido ligado primeiro.
      true
    );

    // Setas esquerda/direita, Home e End movem o cursor sem mudar o texto.
    campo.addEventListener('keyup', (evento) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) atualizar();
    });

    return { estaAberto: () => aberto, fechar };
  }

  window.Blink.autocompletar = { ligar, normalizar };
})();
