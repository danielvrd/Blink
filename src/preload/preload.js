/**
 * Ponte entre as telas e o processo principal.
 *
 * As telas rodam sem acesso ao Node: elas nao conseguem ler arquivos, abrir
 * janelas nem chamar o Electron. Este arquivo roda antes da tela carregar e
 * coloca em `window.blink` a lista curta de coisas que ela pode fazer. Nada
 * fora desta lista fica disponivel.
 *
 * Todas as funcoes devolvem uma Promise, porque quem responde e o processo
 * principal, do outro lado da mensagem.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blink', {
  config: {
    /**
     * Le tudo de uma vez. Devolve:
     *   { valores, situacaoBinds, caminhoArquivo }
     */
    ler: () => ipcRenderer.invoke('config:ler'),

    /** Grava um campo, ex.: gravar('sql.dialeto', 'postgresql'). */
    gravar: (caminho, valor) => ipcRenderer.invoke('config:gravar', caminho, valor),
  },

  janela: {
    minimizar: () => ipcRenderer.invoke('janela:minimizar'),
    /** O X da janela principal: esconde na bandeja, nao encerra o app. */
    esconder: () => ipcRenderer.invoke('janela:esconder'),
    /** Maximiza, ou restaura se ja estiver maximizada. */
    alternarMaximizar: () => ipcRenderer.invoke('janela:alternarMaximizar'),
    /** O X e o Esc das janelas das ferramentas: fecham de verdade. */
    fechar: () => ipcRenderer.invoke('janela:fechar'),
  },

  diff: {
    /** As linhas da comparacao, pedidas assim que a janela carrega. */
    linhas: () => ipcRenderer.invoke('diff:linhas'),
  },

  notas: {
    /** Pasta configurada e lista dos arquivos .md. */
    estado: () => ipcRenderer.invoke('notas:estado'),
    /** Topicos de um arquivo, na ordem do arquivo (mais novo por ultimo). */
    ler: (arquivo) => ipcRenderer.invoke('notas:ler', arquivo),
    /** Acrescenta um topico no fim. Devolve o nome do arquivo gravado. */
    adicionar: (arquivo, texto) => ipcRenderer.invoke('notas:adicionar', arquivo, texto),
    /** Regrava a lista inteira: usado por apagar e reordenar. */
    salvar: (arquivo, topicos) => ipcRenderer.invoke('notas:salvar', arquivo, topicos),
    limpar: (arquivo) => ipcRenderer.invoke('notas:limpar', arquivo),
    /** Manda o arquivo para a Lixeira do Windows. */
    excluir: (arquivo) => ipcRenderer.invoke('notas:excluir', arquivo),

    /** Tarefas do task.md: { pendentes, concluidas }, na ordem do arquivo. */
    lerTarefas: () => ipcRenderer.invoke('notas:lerTarefas'),
    adicionarTarefa: (texto) => ipcRenderer.invoke('notas:adicionarTarefa', texto),
    salvarTarefas: (tarefas) => ipcRenderer.invoke('notas:salvarTarefas', tarefas),
  },

  areaTransferencia: {
    escrever: (texto) => ipcRenderer.invoke('areaTransferencia:escrever', texto),
  },

  atalhos: {
    /**
     * Troca a bind de uma ferramenta ('diff', 'note' ou 'sql').
     * Devolve { ok, motivo } - veja os motivos em src/main/atalhos.js.
     */
    definir: (nome, acelerador) => ipcRenderer.invoke('atalhos:definir', nome, acelerador),
  },

  pasta: {
    /** Abre o seletor de pasta do Windows. Devolve o caminho ou null. */
    escolher: () => ipcRenderer.invoke('pasta:escolher'),
  },

  demonstracao: {
    /** O botao "Abrir demonstracao" de cada aba. */
    abrir: (nome) => ipcRenderer.invoke('demonstracao:abrir', nome),
  },
});
