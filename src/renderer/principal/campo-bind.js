/**
 * Campo de atalho ("bind"), usado igual nas tres abas.
 *
 * Mostra o atalho atual e, ao clicar em "Alterar", espera o usuario apertar a
 * combinacao nova. Quem grava e registra de verdade e o processo principal
 * (src/main/atalhos.js); aqui so capturamos as teclas e mostramos o resultado.
 */

window.Blink = window.Blink || {};

(function () {
  const { el } = window.Blink.ui;

  /**
   * Teclas que so existem para modificar outra. Sozinhas nao formam atalho,
   * entao enquanto o usuario segura Ctrl a gente fica esperando a proxima.
   */
  const MODIFICADORAS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);

  /**
   * Nomes que o Electron usa e que nao batem com os do navegador.
   * O que nao esta aqui vai como veio, em maiusculas.
   */
  const NOMES_ELECTRON = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    ' ': 'Space',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Tab: 'Tab',
    '+': 'Plus',
  };

  /**
   * Monta o acelerador no formato do Electron a partir do evento de tecla.
   * Devolve null se o que foi apertado ainda nao forma um atalho valido.
   *
   * Exigimos Ctrl, Alt ou a tecla Windows: um atalho global sem modificador
   * roubaria a tecla do sistema inteiro. So Shift + letra tambem nao serve,
   * porque isso e apenas digitar a letra maiuscula.
   */
  function montarAcelerador(evento) {
    if (MODIFICADORAS.has(evento.key)) return null;

    const partes = [];
    if (evento.ctrlKey) partes.push('Ctrl');
    if (evento.altKey) partes.push('Alt');
    if (evento.shiftKey) partes.push('Shift');
    if (evento.metaKey) partes.push('Super');

    const temModificadorForte = evento.ctrlKey || evento.altKey || evento.metaKey;
    if (!temModificadorForte) return null;

    // `code` em vez de `key` para as letras e numeros: com Ctrl+Alt o Windows
    // pode devolver um caractere estranho em `key`, mas `code` continua sendo
    // a tecla fisica (KeyD, Digit4).
    let tecla;
    if (/^Key[A-Z]$/.test(evento.code)) {
      tecla = evento.code.slice(3);
    } else if (/^Digit[0-9]$/.test(evento.code)) {
      tecla = evento.code.slice(5);
    } else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(evento.key)) {
      tecla = evento.key;
    } else if (NOMES_ELECTRON[evento.key]) {
      tecla = NOMES_ELECTRON[evento.key];
    } else if (evento.key.length === 1) {
      tecla = evento.key.toUpperCase();
    } else {
      return null;
    }

    partes.push(tecla);
    return partes.join('+');
  }

  /** 'Ctrl+Alt+D' vira 'Ctrl + Alt + D', como aparece no design. */
  function paraTexto(acelerador) {
    return acelerador.split('+').join(' + ');
  }

  /** Mensagem para cada motivo de recusa devolvido pelo processo principal. */
  function mensagemDeErro(resultado) {
    switch (resultado.motivo) {
      case 'duplicado': {
        const nomes = { diff: 'Diff Checker', note: 'Fast Note', sql: 'Formatter', i18n: 'I18n' };
        return `Este atalho já é o do ${nomes[resultado.ferramenta] || 'outro recurso'}.`;
      }
      case 'em-uso':
        return 'Outro programa já usa este atalho. O anterior foi mantido.';
      case 'vazio':
      case 'ferramenta':
      default:
        return 'Não foi possível usar este atalho.';
    }
  }

  /**
   * Monta o campo.
   *
   * Parametros:
   *   ferramenta  'diff' | 'note' | 'sql' | 'i18n'
   *   rotulo      texto do rotulo da secao
   *   acelerador  atalho atual, ex.: 'Ctrl+Alt+D'
   *   registrado  false quando outro programa ja tomou este atalho
   *
   * Devolve o elemento da secao inteira (rotulo + campo + botao + aviso).
   */
  function montar({ ferramenta, rotulo, acelerador, registrado }) {
    let gravando = false;
    let atual = acelerador;

    const campo = el('div', { class: 'campo-bind', texto: paraTexto(atual) });
    const botao = el('button', { class: 'botao-fantasma', texto: 'Alterar' });
    const aviso = el('div', { class: 'aviso-conflito' });

    /** Redesenha campo, botao e aviso a partir do estado atual. */
    function desenhar(mensagem) {
      campo.textContent = gravando ? 'Pressione as teclas…' : paraTexto(atual);
      botao.textContent = gravando ? 'Gravando…' : 'Alterar';
      botao.classList.toggle('gravando', gravando);

      const emConflito = !gravando && (!!mensagem || registrado === false);
      campo.classList.toggle('conflito', emConflito);

      if (mensagem) {
        aviso.textContent = mensagem;
      } else if (!gravando && registrado === false) {
        aviso.textContent = 'Outro programa já usa este atalho.';
      } else {
        aviso.textContent = '';
      }
    }

    function pararDeGravar(mensagem) {
      gravando = false;
      window.removeEventListener('keydown', aoPressionar, true);
      desenhar(mensagem);
    }

    async function aoPressionar(evento) {
      evento.preventDefault();
      evento.stopPropagation();

      // Esc desiste e mantem o atalho que ja estava valendo.
      if (evento.key === 'Escape') return pararDeGravar('');

      const novo = montarAcelerador(evento);
      if (!novo) return; // ainda so modificadores: continua esperando

      const resultado = await window.blink.atalhos.definir(ferramenta, novo);

      if (resultado.ok) {
        atual = novo;
        registrado = true;
        pararDeGravar('');
      } else {
        pararDeGravar(mensagemDeErro(resultado));
      }
    }

    botao.addEventListener('click', () => {
      if (gravando) return pararDeGravar('');
      gravando = true;
      desenhar('');
      // `true` = captura: pega a tecla antes de qualquer outro tratador, para
      // que Tab, Enter e companhia nao mexam na tela enquanto gravamos.
      window.addEventListener('keydown', aoPressionar, true);
    });

    desenhar('');

    return el('div', { class: 'secao' }, [
      el('div', { class: 'rotulo', texto: rotulo }),
      el('div', { class: 'linha-campo' }, [campo, botao]),
      aviso,
    ]);
  }

  window.Blink.campoBind = { montar, montarAcelerador, paraTexto };
})();
