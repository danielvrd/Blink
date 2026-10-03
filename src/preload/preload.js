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

    /** O processo principal avisa quando um campo que as janelas abertas usam muda ({ caminho }): fonte e tamanho. */
    aoMudar: (callback) => ipcRenderer.on('config:mudou', (_evento, mudanca) => callback(mudanca)),
  },

  janela: {
    minimizar: () => ipcRenderer.invoke('janela:minimizar'),
    /** O X da janela principal: esconde na bandeja, nao encerra o app. */
    esconder: () => ipcRenderer.invoke('janela:esconder'),
    /** O Fast Note troca de tamanho conforme o arquivo: true = folha livre (tamanho proprio), false = nota comum. */
    modoNota: (livre) => ipcRenderer.invoke('janela:modoNota', livre),
    /** Maximiza, ou restaura se ja estiver maximizada. */
    alternarMaximizar: () => ipcRenderer.invoke('janela:alternarMaximizar'),
    /** O X e o Esc das janelas das ferramentas: fecham de verdade. */
    fechar: () => ipcRenderer.invoke('janela:fechar'),
    /** O olho do cabecalho de uma ferramenta: abre as configuracoes na aba dela e fecha esta janela. */
    abrirPrincipal: (aba) => ipcRenderer.invoke('janela:abrirPrincipal', aba),
  },

  atualizacao: {
    /** { estado, versao, disponivel, instalando } - o botao "Atualizacao disponivel" le isto ao abrir. */
    situacao: () => ipcRenderer.invoke('atualizacao:situacao'),
    /** O processo principal avisa a cada mudanca de estado. */
    aoMudar: (callback) => ipcRenderer.on('atualizacao:situacao', (_evento, situacao) => callback(situacao)),
    /** Reinicia e instala (depois da confirmacao na tela). */
    instalar: () => ipcRenderer.invoke('atualizacao:instalar'),
  },

  principal: {
    /** So a janela principal usa: o processo principal pede para trocar de aba. */
    aoTrocarAba: (callback) => ipcRenderer.on('principal:aba', (_evento, id) => callback(id)),
  },

  diff: {
    /** As linhas da comparacao, pedidas assim que a janela carrega. */
    linhas: () => ipcRenderer.invoke('diff:linhas'),
  },

  notas: {
    /** O processo principal pede para focar o campo de escrita (a janela voltou da barra de tarefas). */
    aoFocar: (callback) => ipcRenderer.on('nota:focar', () => callback()),
    /** Pasta configurada e lista dos arquivos .md. */
    estado: () => ipcRenderer.invoke('notas:estado'),
    /** Topicos de um arquivo, na ordem do arquivo (mais novo por ultimo). */
    ler: (arquivo) => ipcRenderer.invoke('notas:ler', arquivo),
    /** Acrescenta um topico no fim. Devolve o nome do arquivo gravado. */
    adicionar: (arquivo, texto) => ipcRenderer.invoke('notas:adicionar', arquivo, texto),
    /** Regrava a lista inteira: usado por apagar e reordenar. */
    salvar: (arquivo, topicos) => ipcRenderer.invoke('notas:salvar', arquivo, topicos),
    limpar: (arquivo) => ipcRenderer.invoke('notas:limpar', arquivo),
    /** Marca o arquivo principal (a estrela). '' tira a marca. */
    definirPrincipal: (nome) => ipcRenderer.invoke('notas:definirPrincipal', nome),
    /** Lembra o arquivo aberto agora: sem estrela, a proxima abertura cai nele. */
    definirUltima: (nome) => ipcRenderer.invoke('notas:definirUltima', nome),
    /** Manda o arquivo para a Lixeira do Windows. */
    excluir: (arquivo) => ipcRenderer.invoke('notas:excluir', arquivo),

    /** Tarefas do task.md: { pendentes, concluidas }, na ordem do arquivo. */
    lerTarefas: () => ipcRenderer.invoke('notas:lerTarefas'),
    adicionarTarefa: (texto) => ipcRenderer.invoke('notas:adicionarTarefa', texto),
    /**
     * Conclui ou desmarca uma tarefa e mexe na daily junto. `indice` e o da lista do ARQUIVO; `texto` e
     * o da tarefa como a tela o tem (com o comentario da data). Devolve { ok, tarefas, daily } ou
     * { ok: false, motivo | precisaConfirmar, tarefas }.
     */
    alternarTarefa: (grupo, indice, texto, confirmado) => ipcRenderer.invoke('tarefas:alternar', grupo, indice, texto, confirmado),
    salvarTarefas: (tarefas) => ipcRenderer.invoke('notas:salvarTarefas', tarefas),

    /** Liga ou desliga o relogio (historico diario) de um arquivo. */
    definirHistorico: (nome, ligado) => ipcRenderer.invoke('notas:definirHistorico', nome, ligado),
    /** Dias com topico de um arquivo de historico: { dias: [{data, topicos}] }. */
    lerHistorico: (arquivo) => ipcRenderer.invoke('notas:lerHistorico', arquivo),
    /** Regrava os topicos de UM dia (AAAA-MM-DD), preservando os outros. */
    salvarDiaHistorico: (arquivo, data, topicos) => ipcRenderer.invoke('notas:salvarDiaHistorico', arquivo, data, topicos),
    /** Acrescenta um topico no dia indicado. */
    adicionarHistorico: (arquivo, data, texto) => ipcRenderer.invoke('notas:adicionarHistorico', arquivo, data, texto),
  },

  /**
   * Folha livre: um editor tipo Notion (Quill) com desenho por cima, guardado em .blink/livre/<nome>.json ao lado
   * do .md (que nunca muda). A tela manda e recebe o Delta e os tracos como JSON.
   */
  livre: {
    /** Liga a folha num arquivo. Devolve { ok, folha: { conteudo, tinta } } (os topicos do .md em lista, ou a folha guardada). */
    ativar: (arquivo) => ipcRenderer.invoke('livre:ativar', arquivo),
    /** Desliga (a folha e as imagens ficam no disco para quando ligar de novo). */
    desativar: (arquivo) => ipcRenderer.invoke('livre:desativar', arquivo),
    /** A folha guardada: { conteudo, tinta, atualizado } ou null. */
    ler: (arquivo) => ipcRenderer.invoke('livre:ler', arquivo),
    salvar: (arquivo, folha) => ipcRenderer.invoke('livre:salvar', arquivo, folha),
    /** Para a hora de fechar a janela: bloqueia ate gravar, porque uma gravacao assincrona nao teria tempo. */
    salvarSincrono: (arquivo, folha) => ipcRenderer.sendSync('livre:salvarSincrono', arquivo, folha),
    /** Guarda uma imagem colada ou arrastada (bytes). Devolve { ok, url } com o endereco blink-anexo://... */
    anexarImagem: (arquivo, bytes) => ipcRenderer.invoke('livre:anexarImagem', arquivo, bytes),
  },

  /**
   * Arquivos com cadeado. Todas devolvem { ok, ... } ou { ok: false, motivo }; so o que esta ABERTO
   * (com a senha) volta para a tela, e login/senha de uma credencial so pelo olhinho (revelar).
   */
  privado: {
    /** Poe o cadeado num arquivo comum (senha nova). Em caso de sucesso o arquivo fica aberto: { ok, itens }. */
    ativar: (arquivo, senha) => ipcRenderer.invoke('privado:ativar', arquivo, senha),
    /** Tira o cadeado (pede a senha) e deixa o .md comum, com as credenciais como texto. */
    desativar: (arquivo, senha) => ipcRenderer.invoke('privado:desativar', arquivo, senha),
    /** Abre com a senha: { ok, itens } (texto e credenciais SEM login/senha), ou { ok: false, motivo: 'senha' | 'espere' }. */
    abrir: (arquivo, senha) => ipcRenderer.invoke('privado:abrir', arquivo, senha),
    /** Tranca ja (ao trocar de arquivo). */
    trancar: (arquivo) => ipcRenderer.invoke('privado:trancar', arquivo),
    /** Regrava a lista inteira (apagar, reordenar, editar), na ordem do arquivo. */
    salvar: (arquivo, itens) => ipcRenderer.invoke('privado:salvar', arquivo, itens),
    adicionarTexto: (arquivo, texto) => ipcRenderer.invoke('privado:adicionarTexto', arquivo, texto),
    adicionarCredencial: (arquivo, titulo, login, senha) => ipcRenderer.invoke('privado:adicionarCredencial', arquivo, titulo, login, senha),
    /** O olhinho: pede a senha do arquivo de novo e devolve { login, senha } da credencial. */
    revelar: (arquivo, id, senha) => ipcRenderer.invoke('privado:revelar', arquivo, id, senha),
    /** Copia o login ou a senha ('login' | 'senha') sem a tela ver o valor; limpa a area de transferencia depois de 30 s. */
    copiar: (arquivo, id, campo) => ipcRenderer.invoke('privado:copiar', arquivo, id, campo),
    /** O processo principal trancou tudo (a janela foi minimizada): a tela apaga o conteudo da memoria. */
    aoTrancar: (callback) => ipcRenderer.on('privado:trancou', () => callback()),
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
