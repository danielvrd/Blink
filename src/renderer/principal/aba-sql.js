/**
 * Aba "Formatter" da janela principal (o antigo "SQL Formatter").
 *
 * Aqui ficam as opcoes que vao para a biblioteca sql-formatter - dialeto,
 * caixa das palavras-chave e indentacao (a indentacao vale tambem para XML e
 * JSON) - e os interruptores do modo automatico da Area de Trabalho Remota.
 */

window.Blink = window.Blink || {};

(function () {
  const { el } = window.Blink.ui;

  /**
   * Dialetos. O valor e exatamente o que a sql-formatter espera em
   * `language`; o rotulo e o nome que o usuario conhece.
   */
  const DIALETOS = [
    { valor: 'transactsql', rotulo: 'SQL Server (T-SQL)' },
    { valor: 'postgresql', rotulo: 'PostgreSQL' },
    { valor: 'mysql', rotulo: 'MySQL' },
    { valor: 'plsql', rotulo: 'Oracle (PL/SQL)' },
    { valor: 'sql', rotulo: 'SQL padrão' },
  ];

  /** Vira `keywordCase` na sql-formatter. */
  const PALAVRAS_CHAVE = [
    { valor: 'upper', rotulo: 'UPPER' },
    { valor: 'lower', rotulo: 'lower' },
    { valor: 'preserve', rotulo: 'Manter' },
  ];

  /**
   * O estilo da saida. "Alinhado" (padrao): FROM na mesma linha da tabela, AND
   * do ON alinhados sob o ON, END do CASE na coluna dos WHEN, CTEs do WITH mais
   * para a esquerda. "Clássico": a saida da biblioteca, sem esses ajustes.
   */
  const ESTILOS = [
    { valor: 'alinhado', rotulo: 'Alinhado' },
    { valor: 'classico', rotulo: 'Clássico' },
  ];

  /**
   * Vira `tabWidth` (2 ou 4) ou `useTabs: true`. Guardamos como texto para
   * que 'tab' caiba no mesmo campo dos numeros.
   */
  const INDENTACAO = [
    { valor: '2', rotulo: '2 esp.' },
    { valor: '4', rotulo: '4 esp.' },
    { valor: 'tab', rotulo: 'Tab' },
  ];

  function montar(estado) {
    const sql = estado.valores.sql;

    const select = el('select', {
      class: 'campo-select',
      onchange: (evento) => window.blink.config.gravar('sql.dialeto', evento.target.value),
    });

    for (const dialeto of DIALETOS) {
      select.appendChild(
        el('option', { value: dialeto.valor, texto: dialeto.rotulo, selected: dialeto.valor === sql.dialeto })
      );
    }

    return el('div', { class: 'painel-aba' }, [
      window.Blink.campoBind.montar({
        ferramenta: 'sql',
        rotulo: 'Atalho para formatar seleção',
        acelerador: estado.valores.binds.sql,
        registrado: estado.situacaoBinds.sql,
      }),

      el('div', { class: 'secao grade-2' }, [
        el('div', {}, [
          el('div', { class: 'rotulo', texto: 'Dialeto' }),
          select,
        ]),
        el('div', {}, [
          el('div', { class: 'rotulo', texto: 'Estilo' }),
          window.Blink.pecas.segmentado({
            opcoes: ESTILOS,
            // Configuracao antiga nao tem o campo: vale o padrao, Alinhado.
            valor: sql.estilo === 'classico' ? 'classico' : 'alinhado',
            aoTrocar: (valor) => window.blink.config.gravar('sql.estilo', valor),
          }),
        ]),
      ]),

      el('div', { class: 'secao grade-2' }, [
        el('div', {}, [
          el('div', { class: 'rotulo', texto: 'Palavras-chave' }),
          window.Blink.pecas.segmentado({
            opcoes: PALAVRAS_CHAVE,
            valor: sql.palavrasChave,
            mono: true,
            aoTrocar: (valor) => window.blink.config.gravar('sql.palavrasChave', valor),
          }),
        ]),
        el('div', {}, [
          el('div', { class: 'rotulo', texto: 'Indentação' }),
          window.Blink.pecas.segmentado({
            opcoes: INDENTACAO,
            valor: sql.indentacao,
            aoTrocar: (valor) => window.blink.config.gravar('sql.indentacao', valor),
          }),
        ]),
      ]),

      el('div', { class: 'secao' }, [
        window.Blink.pecas.interruptor({
          rotulo: 'Formatar sozinho SQL e XML copiados da Área de Trabalho Remota',
          // Configuracao antiga nao tem o campo: vale o padrao, ligado.
          ligado: sql.autoRemoto !== false,
          aoTrocar: (valor) => window.blink.config.gravar('sql.autoRemoto', valor),
        }),
        window.Blink.pecas.interruptor({
          rotulo: 'Formatar sozinho JSON copiado da Área de Trabalho Remota',
          ligado: sql.autoRemotoJson !== false,
          aoTrocar: (valor) => window.blink.config.gravar('sql.autoRemotoJson', valor),
        }),
      ]),

      window.Blink.pecas.rodape({
        ferramenta: 'sql',
        legenda: 'Selecione um texto em qualquer lugar e use a bind: SQL, XML, JSON e listas de valores são identificados sozinhos.',
      }),
    ]);
  }

  window.Blink.abaSql = { montar, DIALETOS };
})();
