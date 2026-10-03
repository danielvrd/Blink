/**
 * Canais de comunicacao entre o processo principal e as telas.
 *
 * As telas (src/renderer) nao tem acesso ao Node nem ao Electron. Quando
 * precisam ler a configuracao, minimizar a janela ou abrir o seletor de
 * pasta, elas chamam uma funcao do `window.blink` (veja src/preload), que
 * manda a mensagem para ca.
 *
 * Toda funcao aqui trata o que chega como entrada desconhecida e confere
 * antes de usar.
 */

const { ipcMain, dialog, BrowserWindow, app, clipboard } = require('electron');
const config = require('./config');
const atalhos = require('./atalhos');
const janelas = require('./janelas');
const ferramentaDiff = require('./ferramenta-diff');
const ferramentaNote = require('./ferramenta-note');
const ferramentaI18n = require('./ferramenta-i18n');
const notas = require('./notas');
const privadas = require('./notas-privadas');
const livres = require('./notas-livres');
const imagemFolha = require('./imagem-folha');
const links = require('./links');
const quadros = require('./notas-quadro');
const textos = require('./notas-texto');
const abas = require('./abas');
const aviso = require('./aviso');
const atualizacao = require('./atualizacao');

/**
 * Caminhos de configuracao que as janelas ja abertas precisam saber que mudaram
 * (a aparencia do texto do Fast Note e do Diff). Os outros sao lidos quando a
 * janela abre ou a aba e montada.
 */
const AVISAM_AS_JANELAS = /^(?:aparencia\.|diff\.tema$)/;

/** A janela que enviou a mensagem, ou null se ela ja tiver sido fechada. */
function janelaDoEvento(evento) {
  return BrowserWindow.fromWebContents(evento.sender);
}

function registrar() {
  // --- Configuracoes -------------------------------------------------------

  ipcMain.handle('config:ler', () => ({
    valores: config.obterTudo(),
    // A tela usa isto para marcar em vermelho as binds que nao conseguiram
    // se registrar porque outro programa ja usa a combinacao.
    situacaoBinds: atalhos.obterSituacao(),
    caminhoArquivo: config.caminhoArquivo(),
    // Fonte e tamanho do texto, ja com os padroes onde faltar (so a janela
    // que usa precisa saber o caminho de volta ate o valor).
    aparencia: { note: config.obterAparencia('note'), diff: config.obterAparencia('diff') },
    // O tema de cores do codigo no Diff.
    diffTema: config.obterTemaDiff(),
    // O que fazer ao concluir uma tarefa e em que arquivo fica a daily.
    tarefas: config.obterTarefas(),
  }));

  ipcMain.handle('config:gravar', (_evento, caminho, valor) => {
    if (typeof caminho !== 'string') return false;
    const gravou = config.definir(caminho, valor);

    // Fonte e tamanho valem na hora, nas janelas que ja estao abertas: elas
    // releem a configuracao quando recebem este aviso.
    if (gravou && AVISAM_AS_JANELAS.test(caminho)) {
      for (const janela of BrowserWindow.getAllWindows()) {
        if (!janela.isDestroyed()) janela.webContents.send('config:mudou', { caminho });
      }
    }
    return gravou;
  });

  // --- Janela --------------------------------------------------------------

  ipcMain.handle('janela:minimizar', (evento) => {
    janelaDoEvento(evento)?.minimize();
  });

  ipcMain.handle('janela:esconder', (evento) => {
    janelaDoEvento(evento)?.hide();
  });

  ipcMain.handle('janela:alternarMaximizar', (evento) => {
    const janela = janelaDoEvento(evento);
    if (!janela) return;
    if (janela.isMaximized()) janela.unmaximize();
    else janela.maximize();
  });

  // Fecha de verdade. E o X e o Esc das janelas das ferramentas, que sao
  // descartaveis - ao contrario da janela principal, que so esconde.
  ipcMain.handle('janela:fechar', (evento) => {
    janelaDoEvento(evento)?.close();
  });

  // O olho do cabecalho de uma ferramenta: abre as configuracoes na aba dela
  // e fecha a janela da ferramenta (ela fica sempre por cima, e a principal
  // apareceria escondida atras). Nome de aba desconhecido e recusado sem
  // fechar nada.
  ipcMain.handle('janela:abrirPrincipal', (evento, aba) => {
    if (typeof aba !== 'string' || !atalhos.FERRAMENTAS.includes(aba)) return false;
    janelas.mostrarPrincipal(aba);
    janelaDoEvento(evento)?.close();
    return true;
  });

  // --- Atualizacao ----------------------------------------------------------

  // O botao "Atualizacao disponivel" de cada janela pergunta o estado ao abrir;
  // depois disso o processo principal avisa sozinho (atualizacao:situacao).
  ipcMain.handle('atualizacao:situacao', () => atualizacao.situacao());

  // O clique no botao, ja confirmado na tela. So faz algo com a atualizacao
  // pronta: em qualquer outro estado a funcao nao faz nada.
  ipcMain.handle('atualizacao:instalar', () => atualizacao.instalarAgora(janelas.permitirEncerrar));

  // --- Comparacao de texto -------------------------------------------------

  // A janela do diff pede as linhas assim que carrega. Elas nao vao na URL
  // porque sao dois textos inteiros.
  ipcMain.handle('diff:linhas', () => janelas.obterLinhasDiff());

  // A demonstracao do Diff: qual exemplo esta aberto (null numa comparacao de verdade) e a troca de linguagem.
  ipcMain.handle('diff:exemplo', () => ({ atual: janelas.obterExemploDiff(), opcoes: ferramentaDiff.LINGUAGENS_DO_EXEMPLO }));
  ipcMain.handle('diff:abrirExemplo', (_evento, linguagem) => {
    if (!ferramentaDiff.LINGUAGENS_DO_EXEMPLO.includes(linguagem) || janelas.obterExemploDiff() === null) return false;
    ferramentaDiff.abrirExemplo(linguagem);
    return true;
  });

  // --- Fast Note -----------------------------------------------------------

  // Tudo que a janela de notas precisa para se montar, em uma leitura so.
  ipcMain.handle('notas:estado', async () => ({
    pasta: notas.pasta(),
    arquivos: await notas.listar(),
    // O nome do arquivo de tarefas vem daqui, para a tela e o disco nunca
    // discordarem sobre ele.
    arquivoTarefas: notas.ARQUIVO_TAREFAS,
    // O arquivo da estrela, que a janela abre primeiro.
    principal: await notas.principal(),
    // O ultimo arquivo aberto: sem estrela, e onde a janela abre.
    ultima: await notas.ultima(),
    // Os arquivos com o relogio (historico diario) ligado.
    historico: await notas.arquivosComHistorico(),
    // Os arquivos com cadeado (reconhecidos pelo cabecalho do arquivo, nao por uma lista).
    privados: await notas.listarPrivados(),
    // Os arquivos em folha livre.
    livres: await livres.arquivosLivres(),
    // Os arquivos em quadro branco (Excalidraw).
    quadros: await quadros.arquivosQuadro(),
    // Os arquivos em modo texto (o .md inteiro como um editor de texto).
    textos: await textos.arquivosTexto(),
  }));

  // --- Arquivos com cadeado ------------------------------------------------------------
  // Tudo passa pelo notas-privadas.js. A tela so recebe o conteudo de um arquivo ABERTO (com a
  // senha) e nunca o login/senha de uma credencial, a nao ser pelo olhinho (que pede a senha de novo).

  const ehTexto = (v) => typeof v === 'string';

  ipcMain.handle('privado:ativar', async (_evento, arquivo, senha) => {
    if (!ehTexto(arquivo) || !ehTexto(senha)) return { ok: false, motivo: 'entrada' };
    return privadas.ativar(arquivo, senha);
  });

  ipcMain.handle('privado:desativar', async (_evento, arquivo, senha) => {
    if (!ehTexto(arquivo) || !ehTexto(senha)) return { ok: false, motivo: 'entrada' };
    return privadas.desativar(arquivo, senha);
  });

  ipcMain.handle('privado:abrir', async (_evento, arquivo, senha) => {
    if (!ehTexto(arquivo) || !ehTexto(senha)) return { ok: false, motivo: 'entrada' };
    return privadas.abrir(arquivo, senha);
  });

  ipcMain.handle('privado:trancar', (_evento, arquivo) => (ehTexto(arquivo) ? privadas.trancar(arquivo) : false));

  ipcMain.handle('privado:salvar', async (_evento, arquivo, itens) => {
    if (!ehTexto(arquivo) || !Array.isArray(itens)) return { ok: false, motivo: 'entrada' };
    return privadas.salvar(arquivo, itens);
  });

  ipcMain.handle('privado:adicionarTexto', async (_evento, arquivo, conteudo) => {
    if (!ehTexto(arquivo) || !ehTexto(conteudo)) return { ok: false, motivo: 'entrada' };
    return privadas.adicionarTexto(arquivo, conteudo);
  });

  ipcMain.handle('privado:adicionarCredencial', async (_evento, arquivo, titulo, login, senha) => {
    if (!ehTexto(arquivo) || !ehTexto(titulo) || !ehTexto(login) || !ehTexto(senha)) return { ok: false, motivo: 'entrada' };
    return privadas.adicionarCredencial(arquivo, titulo, login, senha);
  });

  ipcMain.handle('privado:revelar', async (_evento, arquivo, id, senha) => {
    if (!ehTexto(arquivo) || !ehTexto(id) || !ehTexto(senha)) return { ok: false, motivo: 'entrada' };
    return privadas.revelar(arquivo, id, senha);
  });

  ipcMain.handle('privado:copiar', async (_evento, arquivo, id, campo) => {
    if (!ehTexto(arquivo) || !ehTexto(id) || !ehTexto(campo)) return { ok: false, motivo: 'entrada' };
    return privadas.copiar(arquivo, id, campo);
  });

  // Marca ou tira a estrela. '' = nenhum principal.
  ipcMain.handle('notas:definirPrincipal', async (_evento, nome) => {
    if (typeof nome !== 'string') return false;
    return notas.definirPrincipal(nome);
  });

  // Lembra o arquivo que ficou aberto, para a proxima abertura cair nele.
  ipcMain.handle('notas:definirUltima', async (_evento, nome) => {
    if (typeof nome !== 'string') return false;
    return notas.definirUltima(nome);
  });

  ipcMain.handle('notas:ler', async (_evento, arquivo) => {
    if (typeof arquivo !== 'string') return { topicos: [] };
    return notas.ler(arquivo);
  });

  // Acrescenta um topico. Serve tanto para arquivo existente quanto para
  // um novo: o notas.adicionar cria o arquivo se ele nao existir.
  ipcMain.handle('notas:adicionar', async (_evento, arquivo, texto) => {
    if (typeof arquivo !== 'string' || typeof texto !== 'string') return null;

    const limpo = texto.trim();
    if (limpo === '') return null;

    // Um arquivo em modo texto recebe a linha no fim do .md.
    if (textos.ehTexto(arquivo)) {
      const gravou = await textos.adicionarTexto(arquivo, limpo);
      return gravou ? notas.nomeDeArquivo(arquivo) : null;
    }

    // Um quadro branco nao recebe texto (o .md dele nunca muda e nao ha onde escrever).
    if (quadros.ehQuadro(arquivo)) return null;

    // Uma folha livre recebe o paragrafo na folha; o .md dela nunca muda.
    if (livres.ehLivre(arquivo)) {
      const gravou = await livres.adicionarTexto(arquivo, limpo);
      return gravou ? notas.nomeDeArquivo(arquivo) : null;
    }

    return notas.adicionar(arquivo, limpo);
  });

  // Regrava a lista inteira. Usado por apagar e por reordenar.
  ipcMain.handle('notas:salvar', async (_evento, arquivo, topicos) => {
    if (typeof arquivo !== 'string' || !Array.isArray(topicos)) return false;
    if (!topicos.every((t) => typeof t === 'string')) return false;
    return notas.salvarTopicos(arquivo, topicos);
  });

  ipcMain.handle('notas:limpar', async (_evento, arquivo) => {
    if (typeof arquivo !== 'string') return false;
    return notas.limpar(arquivo);
  });

  // --- Tarefas do /task ---

  ipcMain.handle('notas:lerTarefas', async () => notas.lerTarefas());

  ipcMain.handle('notas:adicionarTarefa', async (_evento, texto) => {
    if (typeof texto !== 'string' || texto.trim() === '') return false;
    return notas.adicionarTarefa(texto.trim());
  });

  ipcMain.handle('notas:salvarTarefas', async (_evento, tarefas) => {
    const lista = (v) => Array.isArray(v) && v.every((t) => typeof t === 'string');
    if (!tarefas || !lista(tarefas.pendentes) || !lista(tarefas.concluidas)) return false;
    return notas.salvarTarefas({ pendentes: tarefas.pendentes, concluidas: tarefas.concluidas });
  });

  // Concluir ou desmarcar uma tarefa, e mexer na daily junto, de uma vez so (veja
  // notas.alternarTarefa). O indice e o da lista DO ARQUIVO.
  ipcMain.handle('tarefas:alternar', async (_evento, grupo, indice, texto, confirmado) => {
    if (typeof grupo !== 'string' || !Number.isInteger(indice) || typeof texto !== 'string') {
      return { ok: false, motivo: 'entrada' };
    }
    return notas.alternarTarefa({ grupo, indice, texto, confirmado: confirmado === true });
  });

  // Manda o arquivo para a Lixeira: recuperavel se foi engano.
  ipcMain.handle('notas:excluir', async (_evento, arquivo) => {
    if (typeof arquivo !== 'string') return false;
    const eraLivre = livres.ehLivre(arquivo);
    const eraQuadro = quadros.ehQuadro(arquivo);
    const eraTexto = textos.ehTexto(arquivo);
    const excluiu = await notas.excluir(arquivo);
    // Em folha livre, a folha e as imagens que so ela usa vao para a Lixeira junto com o .md.
    if (excluiu && eraLivre) await livres.descartarFolha(arquivo);
    // O mesmo no quadro branco: o .excalidraw vai para a Lixeira junto.
    if (excluiu && eraQuadro) await quadros.descartarQuadro(arquivo);
    if (excluiu && eraTexto) textos.esquecer(arquivo);
    return excluiu;
  });

  // --- Links ------------------------------------------------------------------------------
  // Clicar num link das anotacoes: so http, https e mailto abrem (links.js recusa o resto).
  ipcMain.handle('link:abrir', (_evento, url) => links.abrir(url));

  // --- Folha livre ------------------------------------------------------------------------
  // O editor (Quill) e o desenho moram na tela; aqui so se le e grava o JSON da folha e as imagens.

  const ehString = (v) => typeof v === 'string';

  ipcMain.handle('livre:ativar', async (_evento, arquivo) => (ehString(arquivo) ? livres.ativar(arquivo) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('livre:desativar', async (_evento, arquivo) => (ehString(arquivo) ? livres.desativar(arquivo) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('livre:ler', async (_evento, arquivo) => (ehString(arquivo) && livres.ehLivre(arquivo) ? livres.lerFolha(arquivo) : null));

  ipcMain.handle('livre:salvar', async (_evento, arquivo, folha) => {
    if (!ehString(arquivo) || !folha || typeof folha !== 'object') return { ok: false, motivo: 'entrada' };
    return livres.salvar(arquivo, { conteudo: folha.conteudo, tinta: folha.tinta });
  });

  // Na hora de fechar a janela uma gravacao assincrona nao teria tempo de terminar: a tela pede esta, sincrona.
  ipcMain.on('livre:salvarSincrono', (evento, arquivo, folha) => {
    evento.returnValue = ehString(arquivo) && folha && typeof folha === 'object' ? livres.salvarSincrono(arquivo, { conteudo: folha.conteudo, tinta: folha.tinta }) : false;
  });

  // "Copiar como imagem": o print da folha inteira vai para a area de transferencia (a tela grava a folha antes).
  ipcMain.handle('livre:copiarImagem', async (_evento, arquivo) => (ehString(arquivo) ? imagemFolha.copiar(arquivo) : { ok: false, motivo: 'entrada' }));

  ipcMain.handle('livre:anexarImagem', async (_evento, arquivo, bytes) => {
    if (!ehString(arquivo)) return { ok: false, motivo: 'entrada' };
    return livres.anexarImagem(arquivo, bytes);
  });

  // --- Modo texto e abas ----------------------------------------------------------------------
  // O modo texto abre o .md inteiro num editor de texto simples; as abas guardam o que ficou aberto.
  ipcMain.handle('texto:ativar', async (_evento, arquivo) => (ehString(arquivo) ? textos.ativar(arquivo) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('texto:desativar', async (_evento, arquivo) => (ehString(arquivo) ? textos.desativar(arquivo) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('texto:ler', async (_evento, arquivo) => (ehString(arquivo) ? textos.ler(arquivo) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('texto:salvar', async (_evento, arquivo, texto) => (ehString(arquivo) ? textos.salvar(arquivo, texto) : { ok: false, motivo: 'entrada' }));
  ipcMain.on('texto:salvarSincrono', (evento, arquivo, texto) => {
    evento.returnValue = ehString(arquivo) ? textos.salvarSincrono(arquivo, texto) : false;
  });
  // Salvar uma aba rapida: cria o .md com o texto exato e o poe em modo texto.
  // "+ Criar nova nota": cria o .md vazio na hora (o tipo -- folha, quadro, texto, cadeado, relogio -- e aplicado depois
  // pelo proprio Fast Note, pelos IPCs de cada modo).
  ipcMain.handle('notas:criar', async (_evento, nome) => (ehString(nome) ? notas.criar(nome) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('texto:criar', async (_evento, nome, texto) => (ehString(nome) ? textos.criar(nome, texto) : { ok: false, motivo: 'entrada' }));

  ipcMain.handle('abas:ler', () => abas.lerEstado());
  ipcMain.handle('abas:salvar', (_evento, estado) => abas.salvarEstado(estado));
  ipcMain.on('abas:salvarSincrono', (evento, estado) => {
    evento.returnValue = abas.salvarEstado(estado);
  });

  // --- Quadro branco ------------------------------------------------------------------------
  // O Excalidraw mora numa pagina propria (renderer/quadro, dentro de um iframe); aqui so se le e grava o JSON.
  ipcMain.handle('quadro:ativar', async (_evento, arquivo) => (ehString(arquivo) ? quadros.ativar(arquivo) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('quadro:desativar', async (_evento, arquivo) => (ehString(arquivo) ? quadros.desativar(arquivo) : { ok: false, motivo: 'entrada' }));
  ipcMain.handle('quadro:ler', async (_evento, arquivo) => (ehString(arquivo) && quadros.ehQuadro(arquivo) ? quadros.lerQuadro(arquivo) : null));
  ipcMain.handle('quadro:salvar', async (_evento, arquivo, cena) => (ehString(arquivo) ? quadros.salvar(arquivo, cena) : { ok: false, motivo: 'entrada' }));
  ipcMain.on('quadro:salvarSincrono', (evento, arquivo, cena) => {
    evento.returnValue = ehString(arquivo) ? quadros.salvarSincrono(arquivo, cena) : false;
  });
  ipcMain.handle('quadro:copiarImagem', async (_evento, bytes) => quadros.copiarImagem(bytes));

  // A janela do Fast Note troca de tamanho conforme o arquivo aberto: a folha livre e o quadro tem o deles.
  // O modo e 'nota' | 'livre' | 'quadro' (true/false, de antes, valem como 'livre'/'nota').
  ipcMain.handle('janela:modoNota', (evento, modo) => {
    const janela = janelaDoEvento(evento);
    if (!janela) return false;
    janelas.definirModoNota(janela, modo === true ? 'livre' : modo === 'livre' || modo === 'quadro' ? modo : 'nota');
    return true;
  });

  // --- Historico diario (o relogio) -----------------------------------------

  const DATA_AAAAMMDD = /^\d{4}-\d{2}-\d{2}$/;

  // Liga ou desliga o relogio de um arquivo. task.md e sempre recusado.
  ipcMain.handle('notas:definirHistorico', async (_evento, nome, ligado) => {
    if (typeof nome !== 'string' || typeof ligado !== 'boolean') return false;
    return notas.definirHistorico(nome, ligado);
  });

  ipcMain.handle('notas:lerHistorico', async (_evento, arquivo) => {
    if (typeof arquivo !== 'string') return { dias: [] };
    return notas.lerHistorico(arquivo);
  });

  // Regrava os topicos de UM dia. Usado por apagar, reordenar e "limpar tudo".
  ipcMain.handle('notas:salvarDiaHistorico', async (_evento, arquivo, data, topicos) => {
    if (typeof arquivo !== 'string' || !DATA_AAAAMMDD.test(data) || !Array.isArray(topicos)) return false;
    if (!topicos.every((t) => typeof t === 'string')) return false;
    return notas.salvarDiaHistorico(arquivo, data, topicos);
  });

  ipcMain.handle('notas:adicionarHistorico', async (_evento, arquivo, data, texto) => {
    if (typeof arquivo !== 'string' || !DATA_AAAAMMDD.test(data) || typeof texto !== 'string') return false;
    const limpo = texto.trim();
    if (limpo === '') return false;
    return notas.adicionarHistorico(arquivo, data, limpo);
  });

  // --- Area de transferencia -----------------------------------------------

  // O navigator.clipboard do navegador nao e confiavel em paginas abertas
  // pelo protocolo file:, entao copiar passa por aqui.
  ipcMain.handle('areaTransferencia:escrever', async (_evento, texto) => {
    if (typeof texto !== 'string') return false;
    await clipboard.writeText(texto);
    return true;
  });

  // --- Atalhos -------------------------------------------------------------

  ipcMain.handle('atalhos:definir', (_evento, nome, acelerador) => {
    if (typeof nome !== 'string' || typeof acelerador !== 'string') {
      return { ok: false, motivo: 'vazio' };
    }
    return atalhos.definirBind(nome, acelerador);
  });

  // --- Pasta das notas -----------------------------------------------------

  ipcMain.handle('pasta:escolher', async (evento) => {
    const janela = janelaDoEvento(evento);
    const atual = config.obter('pastaNotas');

    const resultado = await dialog.showOpenDialog(janela, {
      title: 'Escolha a pasta das notas',
      // Abre na pasta ja configurada; se ainda nao houver, nos Documentos.
      defaultPath: atual || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Usar esta pasta',
    });

    if (resultado.canceled || resultado.filePaths.length === 0) return null;

    const escolhida = resultado.filePaths[0];
    config.definir('pastaNotas', escolhida);
    return escolhida;
  });

  // --- Demonstracao --------------------------------------------------------

  // O botao "Abrir demonstracao" de cada aba.
  ipcMain.handle('demonstracao:abrir', (_evento, nome) => {
    if (!atalhos.FERRAMENTAS.includes(nome)) return false;

    // O Diff Checker abre a mesma janela da bind, com dois textos de
    // exemplo, para dar para ver como fica sem capturar nada.
    if (nome === 'diff') {
      ferramentaDiff.abrirExemplo();
      return true;
    }

    // O Fast Note nao tem o que demonstrar: o botao abre o bloco de notas
    // de verdade, igual a bind.
    if (nome === 'note') {
      ferramentaNote.executar();
      return true;
    }

    // O I18n nao tem janela nem estado proprio: a demonstracao roda a
    // tabela numa frase fixa e mostra o antes/depois por notificacao.
    if (nome === 'i18n') {
      const EXEMPLO = 'Configuração & ‘aspas’ não têm acento.';
      aviso.mostrar(`${EXEMPLO}\n${ferramentaI18n.traduzir(EXEMPLO)}`, { titulo: 'Exemplo do I18n' });
      return true;
    }

    // TODO etapa 2b: a tela de pre-visualizacao do SQL Formatter.
    console.log(`[ipc] demonstracao de "${nome}" ainda nao implementada`);
    return true;
  });
}

module.exports = { registrar };
