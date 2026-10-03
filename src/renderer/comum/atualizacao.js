/**
 * O botao "Atualizacao disponivel", igual nas tres janelas.
 *
 * Fica no canto do cabecalho, a esquerda do minimizar, e so aparece quando ha
 * o que mostrar:
 *
 *   pronta       "Atualizacao disponivel" - clicavel; pede confirmacao e reinicia
 *   baixando     "Baixando atualizacao..." - desabilitado
 *   verificando  "Verificando..." - o clique esta olhando se saiu algo mais novo
 *   resto        escondido (e sempre escondido no npm start, sem instalador)
 *
 * Nas janelas estreitas o texto vira "Atualizar" (CSS, em base.css); o title
 * continua dizendo tudo.
 *
 * Carregue DEPOIS do ui.js. Procura sozinho o `.botoes-janela` do cabecalho:
 * as tres janelas tem um.
 */

(function () {
  const { el } = window.Blink.ui;

  const botoesJanela = document.querySelector('.botoes-janela');
  if (!botoesJanela || !window.blink || !window.blink.atualizacao) return;

  const textoLongo = el('span', { class: 'texto-longo' });
  const textoCurto = el('span', { class: 'texto-curto' });
  const botao = el('button', { class: 'botao-atualizacao', id: 'btn-atualizacao', type: 'button', hidden: true }, [textoLongo, textoCurto]);

  const pergunta = el('div', { class: 'pergunta-atualizacao' });
  const botaoSim = el('button', { class: 'botao-atualizacao-sim', id: 'btn-atualizacao-sim', type: 'button', texto: 'Reiniciar' });
  const botaoNao = el('button', { class: 'botao-atualizacao-nao', id: 'btn-atualizacao-nao', type: 'button', texto: 'Agora não' });
  const popover = el('div', { class: 'popover-atualizacao', id: 'popover-atualizacao', hidden: true }, [
    pergunta,
    el('div', { class: 'botoes-atualizacao' }, [botaoSim, botaoNao]),
  ]);

  /** O ultimo estado recebido do processo principal. */
  let atual = null;

  /** O clique no botao nao pode tirar o foco do campo que o usuario esta usando. */
  botao.addEventListener('mousedown', (evento) => evento.preventDefault());
  popover.addEventListener('mousedown', (evento) => evento.preventDefault());

  function fecharPopover() {
    popover.hidden = true;
  }

  function abrirPopover() {
    if (!atual || atual.estado !== 'pronta') return;

    pergunta.textContent = `Reiniciar agora para a versão ${atual.versao}? O que estiver aberto fecha.`;
    popover.hidden = false;

    // Ancora no botao. Pelo CSSOM (.style), que o CSP da tela permite - so o
    // atributo style="" e que ele bloqueia.
    const caixa = botao.getBoundingClientRect();
    popover.style.top = `${Math.round(caixa.bottom + 6)}px`;
    popover.style.right = `${Math.max(8, Math.round(window.innerWidth - caixa.right))}px`;
  }

  function desenhar(situacao) {
    atual = situacao;

    const mostrar = !!situacao && situacao.disponivel && (situacao.estado === 'pronta' || situacao.estado === 'baixando');
    botao.hidden = !mostrar;
    if (!mostrar) {
      fecharPopover();
      return;
    }

    let longo;
    let curto;
    let dica;
    if (situacao.instalando && situacao.estado === 'pronta') {
      longo = 'Verificando…';
      curto = 'Verificando…';
      dica = 'Verificando se saiu uma versão mais nova…';
    } else if (situacao.estado === 'baixando') {
      longo = 'Baixando atualização…';
      curto = 'Baixando…';
      dica = `Baixando a versão ${situacao.versao}…`;
    } else {
      longo = 'Atualização disponível';
      curto = 'Atualizar';
      dica = `Atualização disponível: versão ${situacao.versao}. Clique para reiniciar e instalar.`;
    }

    textoLongo.textContent = longo;
    textoCurto.textContent = curto;
    botao.title = dica;
    botao.setAttribute('aria-label', dica);

    const ocupado = situacao.estado !== 'pronta' || situacao.instalando;
    botao.disabled = ocupado;
    if (ocupado) fecharPopover();
  }

  botao.addEventListener('click', () => {
    if (popover.hidden) abrirPopover();
    else fecharPopover();
  });

  botaoSim.addEventListener('click', () => {
    fecharPopover();
    window.blink.atualizacao.instalar();
  });

  botaoNao.addEventListener('click', fecharPopover);

  // Esc fecha so a pergunta: na captura, antes de qualquer outro tratador da
  // janela (o Esc do Fast Note e do Diff minimiza a janela).
  window.addEventListener(
    'keydown',
    (evento) => {
      if (evento.key !== 'Escape' || popover.hidden) return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      fecharPopover();
    },
    true
  );

  // Clicar fora tambem fecha.
  document.addEventListener('mousedown', (evento) => {
    if (popover.hidden) return;
    if (popover.contains(evento.target) || botao.contains(evento.target)) return;
    fecharPopover();
  });

  botoesJanela.insertBefore(botao, botoesJanela.firstChild);
  document.body.appendChild(popover);

  window.blink.atualizacao.aoMudar(desenhar);
  window.blink.atualizacao.situacao().then(desenhar);
})();
