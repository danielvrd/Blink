# Blink

App para Windows que fica na bandeja do sistema e oferece quatro ferramentas acionadas por atalhos
de teclado, de dentro de qualquer programa:

1. **Diff Checker** — compara dois textos selecionados e mostra as diferenças lado a lado.
2. **Fast Note** — um bloco de notas rápido que grava tópicos em arquivos `.md` numa pasta sua.
3. **Formatter** — identifica e formata SQL (inclusive procedures), XML, JSON, linhas de log e listas de valores (`IN ('A', 'B')`), tudo com a mesma tecla.
4. **I18n** — troca acentos e alguns outros caracteres por sequências de escape do JavaScript.

Tudo roda na sua máquina. Não há servidor, conta nem envio de dados para fora.

## Instalar

**[Baixar a versão mais recente](https://github.com/danielvrd/Blink/releases/latest)**

Na página, em **Assets**, baixe o arquivo `Blink-Setup-<versão>.exe` (cerca de 108 MB) e execute.
Os outros arquivos da lista são para o próprio app se atualizar — você não precisa deles.

A instalação é por usuário, então **não pede senha de administrador**.

### O aviso azul do Windows

Na primeira execução o SmartScreen vai dizer que o app é de um "editor desconhecido" e esconder o
botão de instalar. Isso é esperado: o instalador não tem assinatura digital, que exige um
certificado pago.

Clique em **"Mais informações"** e depois em **"Executar assim mesmo"**.

### Depois de instalar

O Blink abre escondido na bandeja do sistema, ao lado do relógio. Clique no olho para abrir as
configurações.

Vale marcar **"Iniciar com o Windows"** no menu do botão direito — sem isso você precisa abrir o
app na mão toda vez que ligar o computador.

As atualizações chegam sozinhas: o app avisa por notificação quando há uma versão nova e se
atualiza quando você fechar. Se você deixa o Blink aberto por dias, ele continua procurando e
sempre instala a versão **mais nova** que existir, não a primeira que baixou.

Quando há uma atualização, aparece um botão no canto de cada janela (ao lado do minimizar):
**"Baixando atualização…"** enquanto baixa e **"Atualização disponível"** quando está pronta. Nas
janelas estreitas ele vira "Atualizar". Clicar nele pergunta se pode reiniciar o Blink agora; se
você confirmar, ele confere uma última vez se saiu algo ainda mais novo antes de instalar.

Dentro do Fast Note e do Diff Checker, o **olho** do cabeçalho é um botão: clicar nele abre as
configurações do Blink já na aba daquela ferramenta e fecha a janela dela.

## Como usar

### Formatter — `Ctrl + Alt + F`

Uma tecla só: o Blink olha o que foi selecionado, **identifica sozinho** e formata. Sem menu, sem
escolher nada. Ele reconhece, nesta ordem:

| O que você seleciona | O que sai |
|---|---|
| **XML** (normal, escapado, escapado duas vezes, ou vários elementos lado a lado) | XML indentado |
| **JSON** (objeto ou lista, inclusive o que vem escapado de um log ou entre aspas) | JSON indentado, com números e texto exatamente como estavam |
| `IN ('A', 'B')` | uma linha por valor (`A` e `B`) |
| uma **coluna de valores**, uma por linha (do Excel, do banco), ou uma linha só de números/textos separados por vírgula | `IN ('A', 'B')`, com aspas simples em todos os valores |
| uma **linha de log** (`2026-09-28 10:00:01 INFO select ...`) | o começo do log fica como está, numa linha, e o resto é formatado |
| qualquer outra coisa (**SQL**) | SQL formatada — inclusive procedures, triggers e funções do SQL Server |

A coluna de valores só é reconhecida quando não tem cara de SQL: um trecho como `a.id = 1` e
`and b.x = 2` continua sendo formatado como SQL, e uma lista de colunas com vírgula
(`a.id,` / `b.nome,`) também. Uma palavra sozinha segue como SQL — a lista precisa de dois valores ou
mais. Vírgulas que sobram no fim de cada linha da coluna são tiradas. JSON cortado ou inválido não é
formatado: uma notificação avisa e a área de transferência fica como estava.

Sobre XML: XML escapado, com `&lt;` e `&gt;` no lugar de `<` e `>` (comum dentro de SOAP), sai como
XML legível — mesmo quando veio escapado duas vezes. Vários elementos no topo (`<a/><b/>`) são
formatados um a um. XML cortado ou quebrado não é formatado: uma notificação avisa e a área de
transferência fica como estava. Para XML vale só a opção de indentação da aba. Documentos grandes
(mais de 200 KB) são formatados em uma fração de segundo.

Sobre SQL:

- **Procedures, triggers e funções do SQL Server** saem organizados: parâmetros um por linha, `AS`,
  `BEGIN` e `END` cada um na sua linha, e o conteúdo indentado a cada nível (`IF`, `ELSE`, `WHILE`,
  `TRY`/`CATCH`). Se o Blink não tiver certeza de que entendeu o texto, deixa a formatação simples de
  sempre.
- Os parâmetros de log e de código (`?`, `@P0`, `:nome`, `:1`, `$1`, `${id}`, `#{id}`, `{0}`, `%s`)
  ficam exatamente como estavam. Um pedaço estranho, como um GUID sem aspas, não impede mais a
  formatação do resto.
- Scripts com **`DECLARE`** saem com cada declaração numa linha (as variáveis de uma lista entram
  um nível, e `DECLARE @T TABLE (...)` fica numa linha só), e um `IF`, `WHILE` ou `EXEC` que vem
  logo depois de um `DECLARE` ou de um `SET @variável` sem `;` vai para a linha de baixo.
- Colunas com nome de palavra reservada (`user`, `type`, `role`…) ficam indentadas como as demais.
- Funções (`GETDATE`, `ISNULL`…) e tipos (`VARCHAR`, `INT`…) seguem a caixa escolhida para as
  palavras-chave.

O texto formatado vai para a área de transferência com as quebras de linha do Windows, então cola
direito no Bloco de Notas e em qualquer programa.

1. Selecione o texto em qualquer programa.
2. Pressione `Ctrl + Alt + F`.
3. Cole onde quiser com `Ctrl + V`.

O texto de origem **não é alterado**: a versão formatada vai para a área de transferência, e uma
notificação confirma. O dialeto, a caixa das palavras-chave e a indentação são escolhidos na aba
Formatter das configurações; a indentação vale também para XML e JSON.

O **estilo** também é escolhido lá, ao lado do dialeto:

- **Alinhado** (padrão): o `FROM` fica na mesma linha da primeira tabela, os `AND`/`OR` de um
  `JOIN ... ON` ficam alinhados embaixo do `ON` (e o `ON ( ... )` mantém os parênteses, com o `)`
  no fim da última condição), o `END` de um `CASE` fica na coluna dos `WHEN`, os CTEs de um `WITH`
  começam na linha do próprio `WITH` (`WITH Nome AS (`), e vários `DECLARE` seguidos ficam sem linha em
  branco entre eles.
- **Clássico**: o jeito de antes, sem esses ajustes.

Nada do que você escreveu muda no estilo Alinhado — só espaços e quebras de linha.

**SQL cortada no fim** (por exemplo, um `WITH x AS (` copiado sem o `)` e sem o `SELECT` final) agora
também é formatada, em vez de recusada: o Blink formata como se os parênteses que faltam existissem e
tira esses mesmos parênteses do resultado. A notificação avisa ("estava incompleta: faltava fechar 1
parêntese"). Vale para até 5 parênteses faltando; mais que isso, ou parênteses fechando a mais, continua
sendo recusado.

#### Copiando de uma Área de Trabalho Remota

Em tela cheia, a Área de Trabalho Remota do Windows fica com todas as combinações de teclas para
o servidor, e o atalho nunca chega ao Blink. Para esse caso existe o **modo automático**, que vem
ligado: dê `Ctrl + C` normal dentro do servidor e, se o texto começar com `SELECT`, `INSERT`,
`UPDATE`, `DELETE`, `WITH` ou `DECLARE` — ou for um XML ou um JSON —, ele chega aqui já formatado.
Comentários (`-- busca`, `/* ... */`) e um `;` na frente (o `;WITH` do SQL Server) não atrapalham.
Uma notificação avisa.

Só vale para cópias vindas da Área de Trabalho Remota do Windows — cópias feitas na sua própria
máquina nunca são formatadas sozinhas. Dá para desligar na aba Formatter, com **dois
interruptores**: um para SQL e XML e outro só para JSON (útil se você copia JSON minificado para
colar numa requisição e não quer que ele chegue indentado). JSON muito curto (como `[1]`) e a lista
de valores nunca são formatados sozinhos.

### I18n — `Ctrl + Alt + I`

Troca letras acentuadas (e alguns outros caracteres, como `&`) pela sequência de escape `\uXXXX`
do JavaScript — útil para colar texto em português dentro de strings de código sem quebrar a
codificação. A tabela completa está em `src/main/ferramenta-i18n.js`.

1. Selecione um texto em qualquer programa.
2. Pressione `Ctrl + Alt + I`.
3. Cole onde quiser com `Ctrl + V`.

O texto de origem **não é alterado**, e uma notificação confirma a conversão. Texto sem nenhum
caractere da tabela é copiado sem mudanças, e a notificação avisa disso.

### Diff Checker — `Ctrl + Alt + D`

O atalho funciona em **dois tempos**:

1. Selecione o primeiro texto e pressione `Ctrl + Alt + D` — uma notificação confirma que ele foi
   guardado.
2. Selecione o segundo texto (em qualquer programa) e pressione `Ctrl + Alt + D` de novo — a
   janela de comparação abre.

A **fonte e o tamanho** do texto da comparação são escolhidos na aba Diff Checker das configurações
(10 a 20 px; padrão JetBrains Mono 13) e valem na hora, até na janela que já está aberta.

Quando os textos são **código**, o Diff Checker pinta a sintaxe: JavaScript, TypeScript, HTML/XML,
CSS/SCSS, JSON, SQL, Python, Java, C#, PHP, Bash, YAML e Markdown. A linguagem é descoberta sozinha
(uma só para a comparação inteira) e, quando o texto não tem cara de código — uma prosa, um log, uma
lista —, fica sem cor nenhuma. O pedaço que mudou dentro da linha continua em destaque e mantém a cor
do código. O **tema das cores** é escolhido na aba Diff Checker (Dark+ do VS Code, que é o padrão,
Monokai, One Dark, Dracula, GitHub Dark ou "Sem cores") e também vale na hora, com a janela aberta.
Comparações muito grandes (mais de 300 KB) abrem sem cores.

Na janela, as linhas diferentes aparecem em laranja, e **dentro de cada uma o pedaço que mudou
fica mais forte** (uma palavra trocada, um espaço a mais) — se a linha mudou quase inteira, nada é
destacado. A barra de rolagem à direita mostra onde cada diferença está no texto inteiro — clique
numa marca para ir direto até ela.

Cada linha diferente tem **duas setas** no meio: `→` leva a linha da esquerda para a direita e `←`
leva da direita para a esquerda. O lado que recebe a linha fica verde. Clicar num dos lados da
linha acende a seta do sentido (clicou na esquerda, acende a `→`; na direita, a `←`). Quando a
linha existe só de um lado, `→`/`←` a **cria** ou a **remove** do outro lado, para deixar os dois
iguais. Clicar no **✓** de uma linha aplicada **desfaz**: ela volta a ser uma diferença.

**"Copiar esquerda"** e **"Copiar direita"** copiam o texto inteiro de cada lado, já com as linhas
aplicadas. `Esc` **minimiza** a janela (a comparação continua lá); para fechar e descartar, use o
`×`.

O primeiro texto guardado vale por **2 minutos**. Depois disso o próximo atalho volta a ser o
primeiro, para você não comparar com algo que capturou e esqueceu.

### Fast Note — `Ctrl + Alt + N`

1. Pressione `Ctrl + Alt + N`. Na primeira vez o Windows pergunta em que pasta guardar as notas.
2. Escreva e pressione `Enter`. `Shift + Enter` quebra a linha dentro do mesmo tópico.
3. Escolha outro arquivo no seletor, ou **"+ Criar nova nota"** para começar um.

A **fonte e o tamanho** do texto (tópicos, edição e campo de escrita) são escolhidos na aba Fast Note
das configurações: JetBrains Mono, Cascadia Mono, Consolas, Courier New, Lucida Console, Segoe UI,
Arial, Calibri, Verdana ou Tahoma, de 10 a 20 px (padrão JetBrains Mono 12). Valem na hora, com a
janela aberta, e o `×` e a bolinha das tarefas continuam alinhados com a primeira linha em qualquer
tamanho.

Para **editar** um tópico, clique no texto dele: o cursor entra no ponto em que você clicou, e a
tela não se mexe enquanto você digita, por maior que seja o arquivo. `Enter` ou clicar fora salva,
`Esc` desiste. Apagar (`×`), arrastar para reordenar e a vassoura (limpar tudo) gravam na hora. O `×`
de apagar fica sempre ao lado da **primeira linha** do tópico. A lixeira ao lado da vassoura exclui o
arquivo inteiro — ele vai para a Lixeira do Windows, então dá para recuperar.

`Tab` **indenta** (no campo de escrita e na edição de um tópico): com várias linhas selecionadas,
indenta todas; `Shift + Tab` desfaz. `Esc` **minimiza** a janela para a barra de tarefas — para
fechar de verdade, use o `×`.

O botão **C**, à esquerda da vassoura, **copia as anotações** de uma vez: uma linha `- tópico` para
cada uma, na ordem em que foram escritas (a mais antiga primeiro), com as quebras de linha do
Windows. Com o histórico diário ligado, copia só as anotações do dia que está na tela; no `task.md`,
copia as tarefas como caixinhas (`- [ ]` e `- [x]`). Uma mensagem no rodapé diz quantas foram
copiadas, e o botão fica apagado quando não há nada para copiar.

O botão **—**, ao lado do `×` (no Fast Note e também na janela do Diff Checker), **minimiza** a
janela para a barra de tarefas, como o `Esc`. Ao apertar o atalho de novo, ela volta como estava — o
que você estava escrevendo continua no campo, e o cursor já está nele para você digitar, igual a
quando a janela abre do zero.

#### Arquivo principal

Abra o seletor de arquivos: cada um tem uma estrela à direita. Clique na estrela para torná-lo o
**principal** — ela fica amarela, e o `Ctrl + Alt + N` passa a abrir sempre nele. Só um arquivo
pode ser o principal; marcar outro troca a estrela de lugar, e clicar na amarela desmarca. Com a
lista fechada, a estrela aparece ao lado do nome quando o arquivo aberto é o principal.

#### Último arquivo

Sem estrela, o `Ctrl + Alt + N` abre no **último arquivo em que você esteve**: fechou o Fast Note
no `daily`, ele volta no `daily`; fechou no `avaliação`, volta no `avaliação` (o `task.md` também
vale). Com uma estrela marcada, ela sempre vence e abre no arquivo dela. Se o último arquivo foi
apagado, abre no primeiro da lista.

#### Tarefas com `/task`

De qualquer arquivo, escreva `/task` seguido da tarefa e pressione `Enter`:

```
/task fazer 9.1 luis
```

O Fast Note troca para o arquivo `task.md` com a tarefa nova em vermelho, na seção **A fazer**.
Clique na bolinha ao lado dela para concluir — ela desce para **Concluídas**, riscada. Clicar de
novo na bolinha volta a tarefa para A fazer. Ao lado de "Concluídas" há uma **vassoura cinza** que
limpa só as tarefas concluídas (com a mesma confirmação da vassoura de cima); as que ainda estão a
fazer ficam.

Com o `task.md` aberto, basta escrever e dar `Enter`, sem o `/task`. Só `/task`, sem texto, abre as
tarefas. O `task.md` aparece sempre primeiro no seletor e usa o formato de checklist do Markdown,
então dá para abri-lo no VS Code ou no GitHub e ver as caixinhas.

**Tarefas concluídas vão para a daily.** Na aba Fast Note das configurações, escolha o que acontece
ao concluir uma tarefa — **Não registrar**, **Na daily** (padrão) ou **Daily com tópico** — e qual
arquivo é a sua daily (só aparecem os arquivos com o relógio ligado; sem escolher nenhum, nada é
registrado). Ao concluir, a tarefa vira um tópico no **dia de hoje** da daily: dez tarefas
concluídas são dez tópicos. No modo **Daily com tópico** cada tarefa vira um tópico **recolhível**:
uma seta ▸ ao lado do título abre e fecha uma caixa de anotações, que grava sozinha (fechado por
padrão; a seta fica em destaque quando há anotações). Desmarcar a tarefa tira o tópico da daily — do
**dia em que ela foi concluída**, não do de hoje (o Blink guarda esse dia, escondido, no `task.md`).
Se o texto foi mudado na daily, o Blink não acha, nada é removido de lá e um aviso diz isso; se o
tópico recolhível tem anotações suas, ele pergunta antes de remover. Limpar as concluídas ou apagar
uma tarefa **não** mexe na daily. O botão **C** copia o tópico recolhível como `- título` com as
anotações por baixo.

#### Histórico diário

Abra o seletor de arquivos: ao lado da estrela, cada arquivo também tem um relógio. Clique nele
para ligar o **histórico diário** — o arquivo passa a guardar um registro por dia, e um campo de
calendário aparece ao lado do seletor para escolher qual dia ver. Pode haver vários arquivos com o
relógio ligado ao mesmo tempo, cada um funcionando como um diário próprio.

Escolher um dia no calendário mostra os tópicos daquele dia — editar, apagar e adicionar funcionam
normalmente em qualquer dia, não só em hoje. Dias com anotação aparecem com uma bolinha na grade;
dias futuros não são clicáveis. **"Limpar tudo"**, nesse modo, limpa só o dia escolhido — para
apagar o arquivo inteiro, use a lixeira.

Desligar o relógio não apaga nada: o arquivo volta a se comportar como uma nota comum, e ligar de
novo (mesmo depois de um tempo) traz o histórico de volta, com um buraco nas datas do período em
que ficou desligado. O `task.md` não tem relógio — já tem o próprio formato de tarefas.

#### Mandar para outra nota com `/`

De qualquer arquivo, digite `/` no campo de escrita: abre uma lista com todas as suas notas.
Continue digitando para filtrar (sem se preocupar com acento ou maiúscula), use as setas e `Enter`
ou `Tab` para completar o nome. `Esc` fecha a lista e você continua escrevendo normalmente.

```
/daily revisar o deploy
```

Com `Enter`, o tópico vai para o `daily.md` e a janela troca para ele. Só `/daily`, sem texto, apenas
troca de arquivo. Se não existir nota com aquele nome, nada é gravado: o texto fica no campo e um
aviso aparece embaixo, para você corrigir. O `/task` funciona do mesmo jeito.

#### Arquivos com cadeado

Abra o seletor de arquivos: ao lado do relógio, cada arquivo tem um **cadeado**. Clicar nele pede uma
**senha** (duas vezes, com o aviso de que **sem a senha não há como recuperar o conteúdo** — nem o
Blink consegue) e o arquivo inteiro vira um arquivo **criptografado** (AES-256, com a senha
transformada em chave pelo scrypt). No disco não fica nada legível: nem os tópicos, nem o título, nem
as linhas fora da lista. Cada arquivo tem a **sua** senha, mas nada impede de usar a mesma em vários.
O `task.md` e os arquivos com o relógio (histórico diário) não podem ter cadeado, e um arquivo
com cadeado não aparece na lista do `/`.

Ao escolher um arquivo com cadeado, a lista dá lugar a uma tela de **senha**. Senha errada diz "Senha
incorreta." e espera 1 segundo antes de aceitar outra tentativa. Aberto, o arquivo funciona como
qualquer nota (escrever, editar, apagar, arrastar) e **fica aberto só até você trocar de arquivo,
minimizar ou fechar a janela** — aí o Blink esquece a chave, apaga o conteúdo da tela e pede a senha
de novo. Também tranca ao recarregar a janela (apertar o atalho com ela já aberta).

Dentro de um arquivo com cadeado há o botão **+ credencial** (título, login e senha). Na lista, o
título aparece e o login e a senha ficam como `••••••`:

- **Copiar** (um botão para o login e outro para a senha) copia sem mostrar o valor. A senha
  copiada **sai da área de transferência sozinha depois de 30 segundos** (se você não tiver copiado
  outra coisa nesse meio tempo) e é marcada para **não entrar no histórico do Windows (Win+V)** nem
  na sincronização com a nuvem.
- **O olhinho** mostra o login e a senha, mas pede a **senha do arquivo de novo**. Fica mostrando até
  o arquivo ser trancado.

Para **tirar o cadeado**, clique nele de novo: o Blink pede a senha, avisa que as senhas das
credenciais passarão a ficar visíveis no arquivo e volta o `.md` comum (uma credencial vira o tópico
`Título — login: x — senha: y`).

#### Folha livre

Abra o seletor de arquivos: à esquerda do cadeado, cada arquivo tem uma **folha**. Clicar nela liga a
**folha livre**: no lugar da lista de tópicos, o arquivo vira uma página em branco, do tamanho de uma
folha A4 (ela encolhe para caber na janela), onde você escreve como num editor de documentos — e pode
**desenhar por cima**. A janela do Fast Note ganha um tamanho próprio para a folha, maior que o da
nota comum; você pode redimensioná-la, e cada modo lembra o tamanho que você deixou.

- **Escrever.** Títulos, listas (comum, numerada e de tarefas, com caixinhas), citação, bloco de
  código, divisória, imagem, negrito, itálico, sublinhado, riscado, cor do texto e marca-texto.
  Selecione um trecho e uma **barra** aparece em cima dele (N, I, S, T, A para a cor e M para o
  marca-texto). Digite `/` numa linha para escolher um bloco (setas e `Enter`; `Esc` fecha). Atalhos
  de Markdown também valem: `# `, `## `, `### `, `- `, `1. `, `[] `, `> `, `---` e `Enter`, e três
  crases e `Enter` para código. `Ctrl + B`, `Ctrl + I`, `Ctrl + U` e `Ctrl + Z` / `Ctrl + Y` funcionam
  como de costume.
- **Imagens.** Cole (`Ctrl + V`) ou arraste uma imagem PNG, JPEG, GIF ou WebP, de até 15 MB. Elas
  ficam guardadas numa pasta escondida `.blink`, dentro da sua pasta de notas.
- **Caneta.** Na barra acima da folha: **Texto**, **Caneta**, **Marca-texto** (largo e translúcido —
  também serve para pintar) e **Borracha** (apaga o traço inteiro que ela tocar). Há três espessuras e
  oito cores, e as setas ↶ ↷ desfazem e refazem o desenho. Com uma ferramenta de desenho ligada, o
  `Esc` volta para o texto (outro `Esc` minimiza). O desenho fica preso à folha, como caneta no papel,
  e continua no mesmo ponto quando você muda o tamanho da janela.
- **Ligar e desligar.** Ao ligar, a folha começa com os tópicos do arquivo como uma lista. O arquivo
  `.md` **não é alterado** enquanto a folha está ligada. Desligar volta para os tópicos, e a folha
  fica guardada: ligar de novo traz tudo de volta, texto, imagens e desenho.
- **O resto da janela.** O botão **C** copia o texto da folha; a **vassoura** limpa texto e desenho
  (com confirmação); a **lixeira** manda para a Lixeira do Windows o arquivo, a folha e as imagens que
  só ela usa; e um `/nome texto` escrito em outra nota acrescenta um parágrafo no fim da folha. A
  folha grava sozinha, pouco depois de você parar, e também ao trocar de arquivo, minimizar ou fechar.

A folha não combina com o **cadeado** nem com o **histórico diário** (o ícone fica apagado e a dica
diz o que desligar antes), e o `task.md` não tem folha. A folha **não é criptografada**: se o conteúdo
é sigiloso, use o cadeado.

#### Seus arquivos

O Blink só mexe nas linhas que começam com `- ` dos seus arquivos. Título, parágrafo ou qualquer
outra coisa que você escrever no arquivo por fora fica onde está — dá para usar uma pasta de notas
que você já tem.

```markdown
# Trabalho              <- o Blink não toca

Anotações da sprint.    <- o Blink não toca

- Rever PR #142         <- mais antigo
- Call com cliente      <- mais novo (aparece em cima na janela)
```

## Tamanho das janelas

Todas as janelas do Blink podem ser redimensionadas puxando qualquer borda ou canto, como qualquer
janela do Windows. O tamanho que você deixar volta na próxima vez que ela abrir. A janela de
configurações também maximiza, pelo botão ou com dois cliques na barra de título. O Fast Note tem
dois tamanhos: um para as notas comuns e outro para os arquivos em folha livre — a janela troca de um
para o outro conforme o arquivo aberto.

## Menu do ícone na bandeja

Clique com o botão direito no olho, ao lado do relógio:

| Item | O que faz |
|---|---|
| Abrir Blink | mostra a janela de configurações |
| Diff Checker | abre uma comparação de exemplo |
| Fast Note | abre o bloco de notas |
| Formatter | lembra qual é o atalho |
| I18n | lembra qual é o atalho |
| Procurar atualizações | consulta na hora se há versão nova (com uma já baixada vira "Reiniciar para atualizar") |
| Iniciar com o Windows | liga ou desliga a inicialização automática |
| Sair | encerra o Blink |

Pelo menu, o Diff Checker, o Formatter e o I18n não capturam texto: clicar num item de menu
tira o foco do programa onde a seleção estava. Para eles, use os atalhos.

## Atalhos

| Ferramenta | Atalho padrão |
|---|---|
| Diff Checker | `Ctrl + Alt + D` |
| Fast Note | `Ctrl + Alt + N` |
| Formatter | `Ctrl + Alt + F` |
| I18n | `Ctrl + Alt + I` |

Todos podem ser trocados na janela de configurações, em **"Alterar"**. Se o campo ficar vermelho,
outro programa já usa aquela combinação — escolha outra.

Depois de usar o atalho (`Ctrl + Alt + F`, por exemplo), você pode **soltar só o `Alt` e o `F` e
manter o `Ctrl` apertado** para já emendar um `Ctrl + V`: o `Ctrl` continua valendo. Soltar tudo e
apertar `Ctrl + V` depois também funciona, claro.

## Onde ficam seus dados

- **Configurações:** `%APPDATA%\Blink\config.json`
- **Notas:** na pasta que você escolheu no Fast Note (as folhas livres e as imagens delas ficam numa
  subpasta escondida chamada `.blink`, dentro dela)

Desinstalar o Blink não apaga nenhum dos dois.

## Problemas comuns

**O atalho não faz nada.** Abra a janela do Blink: se o campo do atalho estiver vermelho, outro
programa já usa essa combinação. Troque por outra.

**Funciona em quase tudo, menos num programa específico.** Se esse programa roda como
administrador, o Windows impede que o Blink converse com ele. Rode os dois no mesmo nível.

**O Formatter ou o Diff Checker não pegam o texto dentro de uma Área de Trabalho Remota.** O
Blink espera mais quando reconhece a janela remota, mas numa conexão lenta a cópia ainda pode se
perder. Se acontecer, mande o arquivo `%APPDATA%\Blink\blink.log` junto com o relato: ele registra
quanto tempo cada cópia levou e de que janela veio — nunca o texto copiado.

**Abri o Blink e nada apareceu.** Ele abre escondido na bandeja — procure o olho ao lado do
relógio (às vezes dentro da setinha `^`).

## Contribuindo

O código é aberto para consulta. Contribuições entram por **fork e pull request** e só são
incorporadas depois de revisadas e aprovadas pelo mantenedor. Para rodar o projeto localmente, veja
o [guia de manutenção](MANUTENCAO.md).
