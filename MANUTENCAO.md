# Manutenção do Blink

Guia para quem mantém o projeto: rodar em desenvolvimento, gerar o instalador, publicar uma
atualização e entender onde fica cada coisa no código. Quem só quer usar o app deve ler o
[README](README.md).

## Rodar durante o desenvolvimento

```
npm install
npm start
```

O app sobe **escondido**: o ícone do olho aparece na bandeja, ao lado do relógio. Clique nele para
abrir a janela de configurações.

**Só roda uma cópia do Blink por vez.** Duas brigariam pelos mesmos atalhos globais e a segunda
ficaria muda. Se você abrir o app instalado enquanto um `npm start` estiver rodando, o novo apenas
mostra a janela do que já está no ar e encerra — o que parece um travamento, mas é a trava
funcionando. Para testar o app instalado, feche o de desenvolvimento antes pelo "Sair" da bandeja.

## Gerar o instalador

```
npm run empacotar
```

O resultado sai em `dist/Blink-Setup-<versão>.exe`. Para conferir o app empacotado sem gerar o
instalador (bem mais rápido), use `npm run empacotar-pasta`: ele deixa o executável pronto em
`dist/win-unpacked/`.

## Publicar uma atualização

O app **não** lê o código do repositório. Ele lê um arquivo `latest.yml` publicado numa
**Release** do GitHub, compara a versão de lá com a que está rodando e baixa o instalador novo se
houver novidade.

Quer dizer: fazer `git push` não atualiza ninguém. O que atualiza é publicar uma Release.

### Uma vez só: o token

O `electron-builder` precisa de permissão para criar a Release. Gere um token em
**GitHub → Settings → Developer settings → Personal access tokens → Fine-grained**, com acesso ao
repositório `Blink` e permissão de escrita em **Contents**.

Guarde na sua conta do Windows (uma vez só, vale para sempre):

```powershell
[Environment]::SetEnvironmentVariable('GH_TOKEN', 'seu_token_aqui', 'User')
```

Feche e reabra o terminal depois disso. **Nunca cole o token em chat, issue ou commit.**

### A cada versão

1. Suba o número da versão no `package.json` (`0.1.0` → `0.1.1`).
2. Faça o commit e o push normalmente.
3. Rode:

```
npm run publicar
```

O comando cria a tag da versão, envia para o GitHub, limpa o `dist/`, empacota e publica a Release
com o instalador e o `latest.yml`.

Três detalhes que ele resolve, cada um por causa de um erro que já aconteceu:

- **A tag precisa existir.** O GitHub recusa criar uma Release publicada sem uma tag no repositório
  (`Published releases must have a valid tag`). Sem ela, o empacotamento inteiro roda e só falha no
  fim.
- **O `dist/` precisa estar limpo.** Ele guarda o `latest.yml` do empacotamento anterior. Se a
  publicação falhar no meio, sobra o arquivo velho apontando para a versão passada — e o app lê
  "já está atualizado" para sempre.
- **Nada pode estar pendente de commit.** A tag aponta para o commit atual; com mudanças soltas, a
  tag e o instalador não batem com o repositório.
- **O `electron-builder` perde arquivos — e às vezes cria Releases duplicadas — em silêncio.** Ele
  envia os arquivos em paralelo, e quando a Release ainda não existe cada envio tenta criá-la. Às vezes
  um arquivo some; às vezes nascem **duas Releases para a mesma tag**, cada uma com parte dos arquivos,
  e o GitHub mostra a incompleta como a mais recente. O comando termina com sucesso nos dois casos.
  Por isso o último passo lista **todas** as Releases da tag, apaga as duplicadas, completa a que
  fica e baixa o `latest.yml` pelo mesmo endereço público que o app instalado usa. Consultar "a
  Release da tag" pela API não basta: ela devolve só uma das duplicadas e esconde a outra.

Se uma Release já publicada estiver incompleta, dá para conferir e completar sem empacotar de novo
(o `dist/` precisa ser o daquela versão):

```
node scripts/publicar.js --so-conferir
```

A Release sai publicada, não como rascunho — o app não enxerga rascunho.

### Como a atualização chega

- Procura ao iniciar e a cada 6 horas.
- Achou: baixa em segundo plano e avisa por notificação.
- Baixou: avisa de novo, o menu da bandeja passa a mostrar **"Reiniciar para atualizar"** e todas as
  janelas (principal, Fast Note e Diff) mostram o botão **"Atualização disponível"**.
- Se o usuário não clicar, a atualização se aplica sozinha na próxima vez que o Blink fechar.

Nada disso funciona pelo `npm start`: sem instalador não há o que trocar, o menu mostra o item
desabilitado e o botão das janelas fica escondido.

**A regra que não pode voltar atrás: "pronta" não encerra a busca.** Até a 0.6.1 o `procurar()` do
`src/main/atualizacao.js` não procurava nada com a atualização baixada. Quem deixava o Blink aberto
instalava a 0.5.0 mesmo com a 0.6.0 já publicada (o usuário subiu 0.4.0 → 0.5.0 → 0.6.0 um degrau
por vez). O `electron-updater` sempre pega a última Release; o bloqueio era nosso. Hoje:

- `procurar()` só deixa de procurar enquanto está **baixando**. Com uma versão pronta ele procura de
  novo, e o estado continua `'pronta'` durante a checagem (`versaoBaixada` guarda o instalador que
  já está no disco; sem isso o botão sumiria a cada checagem de 6 horas). A mesma versão achada de
  novo não muda nada nem avisa de novo.
- `instalarAgora()` (botão ou menu) faz uma última olhada (`checkForUpdates()`, limite de 10 s).
  Saiu algo mais novo que o baixado → baixa e só instala no `update-downloaded` ("Saiu a versão X; o
  Blink reinicia quando terminar de baixar"). Sem internet, travado ou erro → instala o que já está
  baixado. O `quitAndInstall` nunca roda duas vezes (`reiniciando`).
- Cada mudança de estado vai para todas as janelas (`atualizacao:situacao`, `BrowserWindow
  .getAllWindows()`) e o clique volta por `atualizacao:instalar`. O botão é um componente comum,
  `src/renderer/comum/atualizacao.js` (carregado depois do `ui.js`), que se encaixa no
  `.botoes-janela` de cada cabeçalho; o texto curto ("Atualizar") vale abaixo de 380 px
  (`base.css`) e, no Diff, abaixo de 700 px (`diff.css`: o cabeçalho dele já é apertado, e no
  tamanho mínimo o título cede com reticências em vez de os botões quebrarem).
- Teste: `.verif/teste-atualizacao.js` (electron-updater falso por `require.cache`; `app.isPackaged`
  forçado a `true`). Contra a versão antiga do módulo ele falha no caso "0.5.0 pronta, procurar() não
  procura".

## Organização do código

```
src/
├─ main/       processo principal do Electron (Node.js) — janelas, bandeja, atalhos, config
├─ preload/    ponte segura entre o main e as telas
├─ renderer/   as telas em HTML/CSS/JS puro, uma pasta por tela
└─ assets/     fontes, ícones
```

É JavaScript puro: **sem TypeScript, sem React, sem bundler**. O código do `src/renderer/` roda
direto no navegador do Electron, sem passo de build. As bibliotecas do npm ficam todas no processo
`main` e são acessadas pelas telas através do `preload` — **com uma exceção: o Quill**, o editor da folha
livre, que a tela do Fast Note carrega direto de `node_modules` (ver "Folha livre"). Os comentários estão em português.

### Por que as janelas não são transparentes

O design pede cantos de 16px (principal), 14px (diff) e 20px (Fast Note). A única forma de ter
cantos próprios numa janela sem moldura é deixá-la transparente — e o Electron não permite
redimensionar janela transparente (*"Transparent windows are not resizable"*, na documentação).

Como redimensionar pesou mais, as janelas são opacas e o Windows 11 cuida do canto (~8px), da borda
e da sombra. Por isso as caixas externas no CSS (`.janela`, `.modal`) não têm `border-radius` nem
`border`: se tivessem, apareceriam quinas escuras dentro do canto do sistema.

O tamanho de cada janela fica em `janelas` no `config.json`, gravado no evento `resized` (fim do
arrasto). Os mínimos estão em `TAMANHOS`, no `src/main/janelas.js`.

**Monitores com escalas diferentes.** Com um monitor em 100% e outro em 125%, o Electron cria a
janela numa escala e converte para a outra, e o arredondamento a faz nascer maior que o pedido
(465×523 para um pedido de 460×516). O `acertarTamanho()` reaplica o tamanho depois de posicionar e
reduz o erro para 1–3px — que não se acumula: o `resized` nunca dispara sozinho, só quando alguém
arrasta a borda. A altura mínima da janela principal tem alguns pixels de folga por causa disso.

Para medir se uma aba cabe, não compare o fim do rodapé com o fim da área: o rodapé tem
`margin-top: auto` e sempre termina rente à borda. Meça o espaço entre a última seção e o rodapé.

### A captura da seleção

O Windows não permite perguntar a outro programa o que está selecionado. O Blink simula `Ctrl + C`,
lê a área de transferência e devolve ela como estava (`src/main/selecao.js`). As esperas estão em
constantes no começo do arquivo, com o porquê de cada número.

**Área de Trabalho Remota.** Numa sessão remota o `Ctrl + C` acontece no servidor e a cópia
atravessa a rede antes de chegar aqui — pode passar de um segundo. Por isso:

- quando o título da janela da frente é de acesso remoto, as esperas são maiores;
- depois do limite, uma **espera tardia** ainda aceita a cópia atrasada — cobre clientes que o
  título não entrega (Citrix, VMware);
- depois de gravar a SQL formatada, uma **guarda** vigia por 3s e regrava a formatada se a cópia
  crua chegar atrasada e sobrescrever.

O `libnut` lê o título da janela **estragando os acentos** (`Produção` chega como `Produ??o`). Por
isso o padrão que reconhece o mstsc em português é `Trabalho Remota`, sem acento.

Cada captura grava uma linha em `%APPDATA%\Blink\blink.log`: janela, se era remota, quanto tempo
levou, quantos caracteres. Nunca o conteúdo copiado. É o que permite investigar um problema
relatado por alguém numa rede que não dá para reproduzir.

**Modo automático** (`src/main/monitor-sql.js`). Em tela cheia a Área de Trabalho Remota captura
todas as combinações de teclas, então nenhum atalho global chega — nem o do Blink, nem os do
AutoHotkey ou do PowerToys. O monitor resolve sem atalho: olha a área de transferência a cada 400ms
**só enquanto a janela da frente é remota** (e por 5s depois de sair dela), e formata sozinho o que
chegar começando com `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `WITH` ou `DECLARE` (`PARECE_SQL`; o
`DECLARE` entrou porque muito script começa declarando variáveis). Fora da janela remota ele
nem lê a área de transferência.

Ele pergunta `selecao.emUso()` antes de agir: durante a captura de um atalho (e 1,5s depois) a área
de transferência é mexida pelo próprio Blink, e reagir a isso quebraria a captura.

**XML** (`src/main/formatador-xml.js`). O Formatter desvia para o XML quando o texto começa com
`<?xml`, `<!--` ou `<` + letra (ou o mesmo escapado, `&lt;`). Uma SQL nunca começa com `<`, então o
caminho do SQL fica intacto. A biblioteca `xml-formatter` roda em **modo estrito**: sem ele, um XML
quebrado ou cortado no meio — o comum em log — era "consertado" em silêncio, com a estrutura
inventada. Ao desescapar, o `&amp;` é trocado por último: `&amp;lt;` no original é o texto `&lt;`.

### Histórico diário (o relógio)

Igual ao `task.md`, é um recurso especial com parser e canais IPC próprios (`separarHistorico`/
`montarHistorico` em `src/main/notas.js`), que não mexem em `separar()`/`montar()` genéricos.

O arquivo guarda um registro por dia:

```
Cabeçalho livre

## 2026-09-15

  - entrada antiga

## 2026-09-29

  - tópico de hoje
```

O detalhe que sustenta tudo: o tópico de um dia vem **indentado** (`  - texto`), nunca `-` na
coluna 0. A `LINHA_TOPICO` do modo comum exige o traço na coluna 0, então uma seção de dia inteira
cai dentro do cabeçalho ou do rodapé do modo comum — preservada ao pé da letra. É por isso que
**desligar o relógio não apaga nada**: o arquivo nem muda, só a lista `notasHistorico` no
`config.json` deixa de citar o nome.

Um tópico solto (coluna 0), em qualquer parte do arquivo, é sempre "ainda sem dia" — nunca uma
posição no arquivo decide isso, só a indentação. Isso importa porque o modo comum sempre grava um
tópico novo **depois** do que já existia (o rodapé entra depois dos tópicos, em `montar()`); um
critério por posição leria esse tópico novo como pertencente ao último dia visto, e uma edição
feita com o relógio desligado ganharia uma data que não devia. Ao religar (`definirHistorico`),
qualquer tópico solto — de uma primeira ativação ou de um período inteiro desligado — vira **hoje**
(`dobrarHoje`), nunca uma data antiga. É o que cria o "buraco" nas datas do período desligado.

O calendário (`src/renderer/note/calendario.js`) é um componente próprio, no mesmo espírito do
`seletor.js`: o `<input type="date">` do Chromium tem um popup nativo que não é estilizável no
tema escuro do app.

### Formatter: como a bind decide o que fazer

A mesma tecla formata XML, JSON, lista de valores e SQL, sem perguntar nada. `executar()` (em
`src/main/ferramenta-sql.js`) captura a seleção, chama `decidir()` — que devolve `{ texto, mensagem }`
ou `{ recusa }` — e só então grava, protege e avisa. Separar `decidir()` deixa testar a decisão sem
teclado nem área de transferência. A **ordem** é o que sustenta tudo:

0. **Prefixo de log** (`prefixo-log.js`), só na bind: data e hora e/ou nível (`INFO`, `ERRO`…) no começo,
   seguidos de SQL, XML ou JSON válido. O prefixo fica intacto numa linha e o resto segue a decisão
   normal. A regra é estreita de propósito: texto livre com data (`2026-09-28 ERRO ao executar select…`)
   não é tocado. O modo automático não usa isto.
1. XML (`pareceXml`, exclusivo).
2. JSON: um `{` no começo é sempre JSON (quebrado, só avisa) — exceto os escapes do JDBC/ODBC
   (`{call proc(?)}`, `{ts '…'}`), que são SQL; um `[` só é JSON se for válido, porque o SQL Server usa
   colchetes para nomes (`[dbo].[tabela]`). JSON **escapado de log** (`{\"a\":1}`) ou entre aspas
   (`"{\"a\":1}"`) é desfeito e formatado (`formatarJsonEscapado`), mas só depois de descartar o JSON
   direto e só na bind: o automático não pode tirar contrabarras de uma cópia sem ninguém pedir.
3. `IN (...)` → uma linha por valor (`paraLinhas`, aceita `N'…'`).
4. Coluna de valores → `IN (...)` (`paraIn`), só se não tiver cara de SQL.
5. SQL, o último recurso.

A SQL vem por último porque o `sql-formatter` **aceita qualquer texto**: uma lista de palavras ele
achata numa linha só, um JSON simples ele devolve igual e ainda diz que "a SQL já estava formatada".
Ele só falha em acidentes de sintaxe, então não dá para usá-lo para descobrir se algo é SQL. A heurística
da lista (`formatador-lista.js`) rejeita o que parece fragmento de SQL: começo de instrução (`SELECT`,
`CREATE`, `DECLARE`… ou comentário), `= < > ;`, linha com mais de 120 caracteres, várias colunas
(tabulação numa seleção de várias linhas), linha de duas palavras ou mais que **começa** com palavra de SQL
(`and ativo`, `ELSE 0`) ou tem palavra de estrutura no meio (`like`, `is`, `where`…), `x IN (...)` e
definição de coluna (`ID INT NOT NULL`). Palavras fracas no meio (`Black or White`, `Paid in full`) são
valores; uma palavra sozinha (`ON`, `OR`) também. Limitação conhecida: `In Progress` e `On Hold`
começam com palavra de SQL e seguem como SQL. Vírgula no fim (ou no começo) de todas as linhas é
tirada; se todos os valores parecem nome de coluna (`a.id,`), é lista de colunas e fica com a SQL. Uma
linha só com vírgulas vira `IN` apenas se forem só números ou só textos entre aspas.

**Quebras de linha: LF por dentro, CRLF na área de transferência.** Todas as funções de formatação
devolvem LF; `paraWindows()` converte na hora de gravar (bind e automático). Toda **comparação** ("já
estava formatado?", "a cópia crua voltou?") passa por `normalizar()`, senão um texto já certo, só que
com CRLF, seria dado como formatado de novo. A guarda contra sobrescrita e o `ultimoVisto` do monitor
usam o texto **gravado** (com CRLF) — verificado que `writeText` de CRLF volta idêntico no `readText`.

**O JSON não usa `JSON.stringify(JSON.parse(...))`** (`formatador-json.js`): isso mudaria o conteúdo
— inteiro grande perde precisão, `1.0` vira `1`, chaves numéricas sobem para o início, chaves
repetidas somem. O JSON é validado com `JSON.parse` mas reindentado percorrendo o texto, então strings
e números saem exatamente como entraram.

**Modo automático (`monitor-sql.js`)**: tem dois interruptores, `sql.autoRemoto` (SQL e XML) e
`sql.autoRemotoJson`, ambos "ligado" quando o campo não existe (config antigo). A lista de valores
**nunca** entra no automático: qualquer cópia de várias linhas com uma palavra por linha viraria alvo.
JSON só é formatado sozinho se tiver 20 caracteres ou mais (não mexer em `[1]`). O diagnóstico do
JSON é `json-auto` (o `teste-auto.js` conta as linhas `sql-auto`, então os rótulos não se misturam).

O nome visível é "Formatter", mas os identificadores continuam `sql` (`binds.sql`, `config.sql.*`,
`abaAtiva`, `ferramenta-sql.js`, `monitor-sql.js`, `aba-sql.js`): renomeá-los quebraria o
`config.json` de quem já usa. A aba do Formatter é a mais alta da janela principal, e a altura mínima
(530px, `janelas.js`) foi medida com os dois interruptores.

#### XML grande: o motor linear (`motor-xml.js`)

O `xml-formatter` (por dentro, o `xml-parser-xo`) é **quadrático**: a cada atributo ele procura `?>` e
`/>` no resto do documento inteiro. 300 KB levam 0,3 s, 1,2 MB levam ~20 s, e o app fica parado (o modo
automático também, roda no mesmo processo). Acima de `LIMITE_CAPACIDADE` (200 KB) o `formatarXml` tenta
primeiro o motor, que reproduz **byte a byte** a saída da biblioteca com as opções do Blink, em uma
passada. Ele devolve `string` (formatado), `false` (inválido com certeza: cortado, tag trocada, texto
solto) ou `null` ("não sei": DOCTYPE, instrução de processamento, atributo sem aspas/duplicado, raiz
dupla…), e `null` cai na biblioteca como sempre foi. Até 200 KB nada muda.

A regra de manutenção é **equivalência**: se mexer no motor (ou trocar a versão do `xml-formatter`),
rode `node .verif/teste-motor-xml.js` — ele compara o motor com a biblioteca em dezenas de milhares de
documentos gerados (fuzz determinístico, cortes, mutações) e em XMLs realistas, e exige: motor devolveu
texto ⇒ **idêntico**; motor devolveu `false` ⇒ a biblioteca também recusa. `--grande` inclui 1,7 MB pelo
caminho lento da biblioteca. Vários elementos no topo (`<a/><b/>`) e XML escapado duas vezes
(`&amp;lt;`) ficam em `formatador-xml.js` (`dividirIrmaos`, cada pedaço passa pelo mesmo caminho).

#### SQL: nomes neutros e layout de procedure

Dois módulos entram por cima do `sql-formatter` dentro de `formatar()`, e os dois têm **trava**: se o
resultado não bater com o que entrou, valem a saída e o comportamento de antes.

- `nome-neutro.js`: troca um pedaço por um identificador comum (`BLINKX0X`), formata e devolve o pedaço
  no lugar. Serve a placeholders que a biblioteca estraga ou recusa (`:nome`, `#{id}`, `${id}`, `{0}`,
  `%s`, `$1`; `$10.00` é dinheiro, não placeholder), a colunas com nome reservado do T-SQL (`user`,
  `type`, `role`, `language`, `schema`, `table`, `index`, `rule`, `option`, só em comandos DML e depois
  de `,` `(` `SELECT` `WHERE`…) e, como rede de segurança, a **um** pedaço estranho que faz a biblioteca
  recusar tudo (lê `Unexpected "X" at line L column C`, troca, tenta de novo, até 10 vezes; nunca troca
  texto entre aspas — string aberta continua recusada). A trava: sem espaços e sem diferenciar caixa o
  resultado é igual à entrada, e cada nome neutro volta exatamente uma vez. Usa o `lexer-sql.js`.
- `layout-tsql.js` (só T-SQL): a biblioteca não entende `BEGIN`/`END`/`IF`/`ELSE`/`WHILE`. Este arquivo
  pega a saída dela e arruma só onde quebrar a linha e quanto indentar (cabeçalho de PROC/FUNCTION/
  TRIGGER, blocos, `IF`/`ELSE`/`WHILE` com corpo simples, `TRY`/`CATCH`, `GO`, `SET NOCOUNT ON;`).
  `DECLARE` também: todo `DECLARE` abre uma linha (sem `;` a biblioteca deixa vários juntos), as
  variáveis de uma lista entram um nível, `DECLARE @T` + `TABLE (...)` voltam a uma linha, e um `IF`,
  `WHILE`, `PRINT`, `EXEC`… que venha depois de um `DECLARE` ou de um `SET @variável` sem `;` (flag
  `semFim`) abre outro comando. Só age
  com um **marcador** (CREATE/ALTER de PROC/FUNCTION/TRIGGER, `BEGIN` de bloco, `IF`/`WHILE` de comando,
  `DECLARE`); sem ele devolve `null` sem nem tokenizar. A trava compara a lista de tokens da entrada e da saída
  (`lexer-sql.js`): qualquer diferença, ou qualquer coisa que o algoritmo não entenda (comando sem `;`
  ambíguo dentro de um corpo simples, `END` sem `BEGIN`…), devolve `null`. No fuzz, ~5% dos programas
  desistem; todos os outros saem idempotentes.

`functionCase` e `dataTypeCase` da `sql-formatter` recebem a mesma opção das palavras-chave
(`opcoes()`); o risco aceito é uma coluna com nome de tipo (`date`, `text`) mudar só de caixa.

#### SQL: o estilo "Alinhado" (`estilo-sql.js`) e a SQL incompleta

`arrumar()` em `ferramenta-sql.js` aplica, nesta ordem, o layout de procedure (`layout-tsql.js`, só T-SQL)
e o estilo. `sql.estilo` é `'alinhado'` (padrão) ou `'classico'`; **configuração antiga não tem o campo e
vale 'alinhado'**, então quem lê usa `!== 'classico'` (o campo não é `required` no schema). O estilo vale
para todos os dialetos. `'classico'` é exatamente a saída de antes (o golden prova, byte a byte).

`estilo-sql.js` trabalha por **linhas** sobre a saída da biblioteca, com seis regras (cada uma re-tokeniza o
texto, via `linhasDe()`): `regraWith` (`WITH` sozinho + CTEs → `WITH Nome AS (`, e a seção dos CTEs um nível
para a esquerda), `regraPontoEVirgulaWith` (`;` que abre o comando + `WITH` → `;WITH`; o `;` que fecha o
comando anterior não é tocado), `regraFrom` (`FROM` sozinho + 1ª tabela na linha de baixo; não junta se a
linha seguinte começa com `(` ou comentário), `regraOn` (AND/OR do `ON` alinhados na coluna do `ON`; e o bloco
`ON (` … `)` vira `ON (cond1` / AND sob o ON / `)` colado na última condição) e `regraCase` (END do CASE na
coluna dos WHEN, com pilha de CASE) e `regraDeclare` (sem linha em branco entre DECLAREs).
A unidade de indentação é a da aba: com Tab, o **nível** é Tab e o **alinhamento** (a distância até o `ON`)
são espaços.

Cautelas (cada uma tem teste): linha que começa **dentro** de um texto de várias linhas ou de um
comentário de bloco é "opaca" e nunca é tocada; bloco do `ON` com algo aninhado em várias linhas, com
comentário de linha na última condição (o `)` cairia dentro do comentário) ou com `saldo` de parênteses ≠ 0
numa linha fica como está; qualquer exceção ou dúvida devolve `null` e vale o texto de antes. **A TRAVA**
(igual à do `layout-tsql.js`): `assinatura()` (em `lexer-sql.js`) da saída tem que ser idêntica à da
entrada, e sem espaços o texto também — só espaços e quebras mudam. É idempotente, e o texto já alinhado,
formatado de novo, volta igual (`teste-estilo-sql.js` confere os dois no corpus e num fuzz).

**SQL incompleta** (`formatar()`): se a biblioteca recusa e `lexer.parentesesAbertos(texto)` dá de 1 a 5
(fora de texto e comentário; `null` com aspas abertas ou ")" a mais), formata `texto + \n + ")".repeat(k)` (a quebra de linha antes: se o texto termina em `-- comentário`, o `)` não pode cair dentro dele), passa o
layout e o estilo **com o texto equilibrado** e só no fim `tirarFechamentos()` remove os `k` últimos `)`
(por token; se o fim não for esse, recusa como antes). O resultado traz `faltavam: k`, que a bind e o
modo automático usam no aviso ("estava incompleta: faltava fechar k parêntese(s)").

`PARECE_SQL` (modo automático) aceita comentários (`--` de linha, `/* */`), espaços e `;` antes da primeira
palavra: `;WITH` e `-- busca` + `SELECT`. Um texto de log com `select` no **meio** continua não contando.

#### O teste de referência ("golden") do Formatter

Como o Formatter mexe em texto de produção, toda mudança nele é conferida contra o **comportamento
anterior**, e não só contra testes escritos à mão. Em `.verif/` (fora do git):

- `corpus-formatter.js`: ~365 entradas determinísticas (SQL, procedures, XML, JSON, listas, logs). As do
  estilo Alinhado (os 5 exemplos do arquivo do Daniel, `;WITH`, comentário + WITH, WITH incompleto, formas de
  JOIN/CASE/CTE) ficam em `corpus-estilo.js`.
- `golden.js`: roda o `executar()` **e** o `monitor.verificar()` reais sobre o corpus, em três
  configurações (T-SQL maiúsculas/4, T-SQL minúsculas/tab, PostgreSQL/2) **em estilo `classico`** — têm que
  bater byte a byte com o baseline —, e em mais três `...-alinhado`, que não têm baseline: cada resultado é
  comparado com o da gêmea clássica da mesma entrada e só pode diferir em espaços e quebras de linha (no
  automático, uma SQL que já estava no layout clássico passa a ser re-estilizada, com aviso).
  `gerar` grava `golden-antes.json` (só com `src/` igual ao commit de referência); `atual` roda e
  compara; `comparar` reavalia as regras sobre o último resultado, sem recoletar.
- `golden-regras.js`: as **mudanças intencionais**, uma regra por etapa, cada uma com a saída esperada
  calculada de forma independente (a própria biblioteca, sem o nosso código por cima). Toda diferença
  fora das regras é regressão. Ao final, `golden-relatorio.md` lista o antes/depois de cada mudança.

O baseline do pack de 0.6.0 foi gerado no commit `6c8b367` (v0.5.0); o do pack seguinte (`DECLARE`, botões
do Fast Note), no `45fc94d` (v0.6.0). O do pack 0.7 (estilo Alinhado, SQL incompleta, `PARECE_SQL`) foi gerado no `0877cb5` (v0.6.1; a
árvore de trabalho tinha só mudanças das fases 1 a 3, que não tocam no Formatter — conferido com `git diff`
nos arquivos dele — e por isso foi gerado com `--forcar`). As regras desse pack, em `golden-regras.js`:
`sql-incompleta` e `parece-sql-comentario-e-ponto-e-virgula`. Para cada rodada de mudanças no Formatter, gere um baseline novo do
commit atual (`electron .verif/golden.js gerar --forcar`, com `src/` limpo), esvazie as regras e acrescente
ao corpus as entradas do que vai mudar.

### Diff Checker: cores do código (`realce.js`) e temas

**Onde roda:** no processo principal, como as outras bibliotecas. `ferramenta-diff.js`
(`compararComRealce()`, usado na bind e no `abrirExemplo`) chama `comparador.comparar()` e depois
`realce.anexar(linhas)`, que põe `tokensEsquerda`/`tokensDireita` em cada linha: uma lista de pedaços
`[classe, texto]` (`classe` = escopo do highlight.js sem o `hljs-`, ou `null`). Os pedaços de uma linha,
juntos, são a linha — o realce confere (`pedacosPorLinha`) e, se não bater, não anexa nada. Qualquer
exceção do realce é engolida: a comparação abre sem cor. Textos com mais de 300 KB (soma dos dois
lados) não são realçados; 300 KB levam ~200 ms.

**Descobrir a linguagem (a parte delicada).** O `highlightAuto` sozinho **não serve**: a relevância dele
cresce com o número de linhas e não separa código de texto comum (um log de 20 linhas pontuou mais que
5 linhas de JavaScript; uma prosa saiu "css"; JSON de uma linha saiu "css"; Java saiu "typescript").
Por isso são duas etapas: (1) **marcadores** por linguagem (`MARCADORES` em `realce.js`: `const x =`,
`def f():`, `SELECT ... FROM`, tag fechada, JSON válido…) dizem quais linguagens são candidatas — sem
nenhuma, **sem cor** (melhor sem cor que cor aleatória num log ou numa lista); (2) com mais de uma
candidata (JavaScript/TypeScript, CSS/SCSS), o `highlightAuto` desempata **só entre elas**. Cuidados:
Java e C# compartilham `public class` (`COMPARTILHADOS`: só vale se nenhum dos dois tem marcador
exclusivo); marcadores "fracos" (YAML, PHP) exigem 3 linhas; YAML só conta linha **aninhada** (`Nome: Ana`
solto é formulário/e-mail); Markdown só com título **e** outro sinal (`#` também é comentário de
bash/python); SQL em prosa inglesa ("select the item from the menu") não conta — SELECT...FROM em
maiúsculas, ou minúsculas com `*`/lista com vírgula. `teste-realce.js` tem as 24 amostras de código
(e a linguagem esperada) e 20 textos que **não podem** ganhar cor: acrescente ali o caso novo antes de
mexer nos marcadores. Só 14 linguagens são registradas (`highlight.js/lib/core` + cada módulo): carregar
as 190 custaria memória e tempo de abertura.

**Na tela** (`diff.js`, `escrever()`): as cores e os pedaços "mudou" do comparador dividem a linha em
lugares diferentes; `corridas()` junta os dois por posição de caractere, e cada corrida vira um
`<span class="hl-<escopo> mudou">` — sempre por `textContent`, nunca `innerHTML`. Dados de realce que não
somam a linha são ignorados (texto puro). As cores **seguem o texto**: uma linha aplicada para a direita
mostra o texto da esquerda com as cores da esquerda (`tokensEsquerda()`/`tokensDireita()`).

**Temas** (`diff.tema`: `darkplus` (padrão), `monokai`, `onedark`, `dracula`, `githubdark`, `semcores`; lista
em `config.js` `TEMAS_DIFF` e em `aparencia.js` `TEMAS` — o teste confere). Em `diff.css`, cada escopo do
highlight.js aponta para uma **variável** (`--hl-keyword`, `--hl-string`…) e cada tema (classe
`tema-<nome>` no `<html>`, posta por `aparencia.js`) só define as variáveis; `semcores` não define
nenhuma e o `var(--hl-x, inherit)` cai na cor da célula (uma regra reafirma o texto mais claro do
`.mudou`). Escopos aninhados levam as duas classes (`hl-meta hl-string`): vale a regra que vem **por
último** no CSS, então a ordem das regras vai do mais geral ao mais específico. `diff.tema` também dispara
o `config:mudou` (`AVISAM_AS_JANELAS`), e a troca vale na hora na janela aberta. Para um tema novo:
acrescente em `TEMAS_DIFF`, em `TEMAS` (rótulo) e as variáveis em `diff.css`.

Testes: `teste-realce.js` (Node) e `teste-diff-temas.js` (Electron: spans `hl-*`, o "mudou" com a cor de
string, cada tema trocado pela aba com o Diff aberto, "Sem cores", linha aplicada, reabrir, texto comum).

### Diff Checker: destaque dentro da linha

Para cada par de linhas alteradas (`emparelhar` em `comparador.js`) o comparador calcula o que mudou
com `diffWordsWithSpace` e acrescenta dois campos **opcionais**, `partesEsquerda`/`partesDireita`. A
escolha: o `diffChars` vira confete em SQL, e o `diffWords` ignora espaço (uma linha que só ganhou
espaço ficaria sem nada destacado). Os campos **não existem** quando o `diff` estoura o `timeout`
(60ms por par, 500ms no total — sem limite, linhas de 20 mil caracteres muito diferentes levam
dezenas de segundos e a comparação roda no processo principal), quando um dos lados está vazio, ou
quando a linha mudou mais de 60%. A tela só destaca enquanto a linha está pendente (depois de
aplicada os dois lados são iguais), monta `<span class="mudou">` com `textContent` (nunca
`innerHTML`: SQL tem `<` e `&`) e trata os campos como opcionais, então linhas montadas à mão nos
testes continuam valendo.

### Diff Checker: aplicar nos dois sentidos

`linhas` (o que vem do `comparador.js`) nunca muda; o que a tela mostra é derivado dele e do estado
`aplicadas`, um `Map` de índice para o sentido (`'dir'`: a direita passou a ser igual à esquerda;
`'esq'`: o contrário). `textoDireita(i)` e `textoEsquerda(i)` calculam o texto de cada lado, e o
"Copiar" de cada lado usa a mesma função — por isso não existe cópia do estado a manter em
sincronia. Linha só de um lado cai na mesma regra por simetria: aplicar para o lado que não tem a
linha a **cria**, para o lado que tem a **remove** (célula vazia e `ausente`, fora do texto
copiado). O ✓ é um botão que faz `aplicadas.delete(i)` e redesenha.

A calha do meio tem 60px (`grid-template-columns: 1fr 60px 1fr`) para caber as duas setas; as
"páginas" cinza atrás de cada lado usam `calc(50% - 30px)` e precisam acompanhar essa largura se ela
mudar de novo.

### Arquivos com cadeado (`privado.js`, `notas-privadas.js`, `area-segura.js`)

**Formato no disco.** O `.md` inteiro vira `BLINK-PRIVADO 1` + quebra de linha + uma linha de JSON
`{"kdf":{"nome":"scrypt","salt","N":32768,"r":8,"p":1},"iv","tag","dados"}` (base64). Cifra **AES-256-GCM**, chave
do **scrypt** (N=2^15, r=8, p=1, sal de 16 bytes, ~100 ms, 32 MiB — o `maxmem` sobe para 128 MiB porque o
limite padrão do Node é exatamente o que ele usa), iv de 12 bytes **sorteado a cada gravação**, tag de 16 bytes, e o
cabeçalho como dado autenticado (AAD). A senha é normalizada em **NFC** (o mesmo "ç" composto ou decomposto abre
igual). Senha errada e arquivo adulterado dão o **mesmo** erro (`SenhaIncorretaOuAdulterado`); cabeçalho/JSON
estragado é `FormatoInvalido`, e parâmetros do scrypt absurdos (N de 2^30…) são recusados **antes** de gastar
memória. Conteúdo cifrado: `{ v: 1, cabecalho, rodape, topicos: [{tipo:'texto',texto} | {tipo:'credencial',titulo,login,senha}] }`.
O arquivo é reconhecido **pelo cabeçalho** (`notas.ehArquivoPrivado`, lê 24 bytes), nunca por uma lista no config.

**O que nunca pode ir para disco em claro:** o `.md`, o `config.json`, o `blink.log` (`teste-privado.js` varre os
três atrás de textos conhecidos) e arquivo temporário (a gravação escreve o texto **já cifrado** em
`.nome.md.<hex>.tmp` ao lado e renomeia por cima; uma queda deixa o original inteiro). **Trava no resto do Blink:**
`salvarTopicos`/`adicionar`/`limpar`/`salvarDiaHistorico`/`migrarParaHistorico` recusam um arquivo privado (gravar texto
puro por cima destruiria o cifrado), o relógio não liga nele, `ler()` devolve `{ privado: true }` sem tópicos, e
`arquivoDaily()` ignora privados.

**Sessão (`notas-privadas.js`).** Abrir com a senha deixa, **só na memória do processo principal**, a chave derivada e o
conteúdo decifrado; gravar de novo usa a mesma chave com outro iv (sem repetir o scrypt). A tela recebe os itens
`{tipo:'texto'}` e `{tipo:'credencial', id, titulo}` — **login e senha nunca vão para a tela**, só pelo olhinho
(`revelar`, que deriva a chave de novo e compara em tempo constante), e o `id` é sorteado a cada abertura. Copiar
(`copiar`) acontece no principal. Senha errada: atraso de 1 s por arquivo no **principal** (e a tela também para o botão).
**Trancar** (`trancar`/`trancarTudo`, que zera a chave com `fill(0)`): ao trocar de arquivo (a tela chama
`privado:trancar`), ao **minimizar** e ao **fechar** a janela (`janelas.js`; o `minimize` também manda
`privado:trancou` para a tela apagar o conteúdo) e ao **recarregar** (`did-start-loading`). A tela apaga o DOM —
até o texto do modal "Ver credencial", que cita o título (o teste confere que **nada** do conteúdo sobra no
`outerHTML` depois de trocar de arquivo ou minimizar). Strings em JavaScript não se zeram; é o limite da proteção
em memória.

**Copiar sem histórico (`area-segura.js`).** O Windows guarda o histórico (Win+V) e sincroniza com a nuvem; os formatos
`ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory` (DWORD 0) e `CanUploadToCloudClipboard`
(DWORD 0) pedem para ficar de fora. A API de clipboard do Electron não junta texto e formato próprio (cada
`writeBuffer` apaga o anterior), então é feito pelo Win32 via **koffi**: `OpenClipboard(hwnd de uma BrowserWindow)` (com
HWND nulo o `SetClipboardData` falha), `EmptyClipboard`, texto em `CF_UNICODETEXT` e os três formatos, tudo numa operação.
**NUNCA escreva em memória nativa pelo JavaScript aqui:** `koffi.view()` (um `ArrayBuffer` sobre memória de fora)
**derruba o processo inteiro** no Electron (`napi_get_last_error_info`, sem exceção para capturar) — foi descoberto na
sonda, não no uso. O bloco vem de `GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT)` (zerado: os DWORD 0 já estão prontos) e o
texto entra por `lstrcpyW` (o koffi passa a string do JS). Qualquer falha cai no `clipboard.writeText` e `escrever()`
devolve `false` — a tela avisa "pode aparecer no histórico do Windows". O teste confere os três formatos com
`IsClipboardFormatAvailable`; **que o Win+V de fato deixa de mostrar** só dá para ver na mão. Limpeza: `setTimeout` de
30 s que só limpa se o clipboard ainda tiver a senha (e `before-quit` limpa também); `definirTempoDeLimpeza` e
`definirAtrasoAposErro` existem para os testes.

**Tela (`note.js`, `seletor.js`).** O cadeado entra antes do relógio no seletor (apagado nos arquivos com relógio, e o
relógio apagado nos privados; o `task.md` não tem nenhum dos dois). A lista de um arquivo privado mistura strings e
`{ credencial: true, id, titulo }`. `trancarAoSair()` é chamado em **todo** lugar que troca `arquivo` (escolher,
"/outra nota", tarefas). O `.lista[hidden]` precisa de `display: none` explícito: o `display` do `.lista` vence o atributo,
e a tela da senha aparecia embaixo de uma lista "escondida" (o teste olha o **estilo calculado**, não a propriedade).
Decisão: o título da credencial fica visível (login e senha mascarados) — um gerenciador de senhas precisa mostrar qual
é qual; muda em `montarCredencial` se preferir mascarar.

Testes: `teste-privado.js` (parte A: criptografia, sessão, trava, cópia com limpeza e formatos; parte B: a tela, o
seletor, a senha, as credenciais, o olhinho, trancar ao trocar/minimizar/recarregar/fechar, o `/`, Esc, tirar o cadeado).

### Folha livre (`notas-livres.js`, `folha.js`, `tinta.js`)

**Formato no disco.** O `.md` **nunca** muda neste modo. A folha mora em `<pasta de notas>/.blink/livre/<nome>.json`:
`{ versao: 1, conteudo: <Delta do Quill>, tinta: [{ t: 'caneta'|'marca', c: '#rrggbb', w, p: [[x, y], ...] }], atualizado }`,
e as imagens em `<pasta>/.blink/anexos/<uuid>.<ext>`. Quem está em folha livre é a lista `notasLivres` do config (só o
processo principal grava, como o relógio). `salvar` valida tudo antes de escrever (Delta só de `{ insert, attributes? }`;
traço com tipo caneta/marca, cor `#rrggbb`, espessura ≤ 80, ≤ 20 mil traços e ≤ 400 mil pontos; JSON ≤ 25 MB) e grava
pelo arquivo temporário + `rename`. O tipo de uma imagem sai dos **bytes** (PNG/JPEG/GIF/WebP), nunca da extensão; ≤ 15 MB.

**Ligar e desligar.** `ativar` recusa o `task.md`, arquivo com relógio e arquivo com cadeado; copia os tópicos do `.md`
como lista (`deltaDosTopicos`: cada tópico uma linha de lista, as linhas a mais do tópico recuadas) ou, se já existe um
`.json` (ligado antes), devolve a folha como estava. `desativar` só tira o arquivo de `notasLivres`: a folha e as imagens
ficam. A exclusividade tem trava dos **dois lados** (`definirHistorico`, `salvarTopicos`, `salvarDiaHistorico`,
`privadas.ativar` recusam um arquivo livre) e o resto do Blink escreve nele pelo caminho certo: `notas:adicionar`
(o `/nome texto`) vira `livres.adicionarTexto`. Excluir manda para a Lixeira o `.json` e as imagens que **nenhuma outra
folha** cita (`descartarFolha`) e limpa o config. Imagens que ficaram sem uso porque o usuário apagou a imagem da folha
**não** são limpas (não há coleta de órfãs).

**O protocolo `blink-anexo://<uuid>.<ext>`.** `registerSchemesAsPrivileged` (standard, secure, fetch) tem que rodar
**antes** do `ready` (`main.js` chama `registrarEsquema()` logo depois dos `require`; o teste também) e o `protocol.handle`
depois (`atenderProtocolo`, no `whenReady`, antes do `ipc.registrar()`). Só serve o nome que casa com `NOME_DE_ANEXO`
(`^[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$`) dentro da pasta de anexos; o resto é recusado. O parser de URL normaliza
(`BLINK-ANEXO://UUID.PNG` e `blink-anexo:///uuid.png` caem no **mesmo** arquivo permitido, nunca em outro; `%2e%2e` dá erro
de rede) — quem decide é sempre o nome exato. CSP da tela do Fast Note: `img-src 'self' data: blink-anexo:`.

**O Quill (`folha.js`).** `quill@2.0.3`, versão exata, carregado por `<script>` direto de `node_modules/quill/dist/quill.js`
(+ `quill.core.css`) no `note/index.html`: o `electron-builder` leva a dependência para o `app.asar`. É a única biblioteca
do npm usada na tela. O `npm audit` aponta um aviso **baixo** do Quill (GHSA-v3m3-f69x-jf25) sobre a exportação para HTML:
o Blink só usa o **Delta em JSON** — nunca `getSemanticHTML()`; não passe a usá-lo, nem `dangerouslyPasteHTML` com conteúdo
de fora (o matcher `IMG` descarta qualquer imagem que não seja `blink-anexo://`).
- **Cores por classe.** O CSP bloqueia `style=""`, e o `formats/color` e o `formats/background` padrão do Quill 2 escrevem
  estilo inline. Foram trocados por `ClassAttributor` com **lista fechada** de nomes (`ql-color-<nome>`, `ql-bg-<nome>`);
  os nomes estão em `folha.js` (`CORES_DO_TEXTO`, `CORES_DO_MARCA_TEXTO`) e as cores em `note.css`. O teste confere que o
  editor não tem nenhum `[style]`.
- **Blots próprios.** `divider` (`BlockEmbed` com `<hr>`) e a imagem, cujo `sanitize` só aceita `blink-anexo://<uuid>.<ext>`
  (o padrão do Quill aceitaria http, https e data).
- **Atalhos de Markdown** entram pelas **opções** `modules.keyboard.bindings`, não por `addBinding()`: o Enter padrão do
  Quill é registrado logo depois das opções e, se os nossos viessem depois dele, nunca seriam chamados. O Quill 2 já faz
  `- `, `* `, `1. ` e `[] `. O formato de bloco de código volta como `'code-block': 'plain'`.
- **Menu `/`.** `getSelection()` dentro do `text-change` ainda devolve a posição de **antes** do que foi digitado, então
  o menu é atualizado com `setTimeout(0)`. O teclado dele (setas, Enter, Tab, Esc) é um `keydown` em captura no
  `.ql-editor` com `stopImmediatePropagation`, e o Esc fechar só o menu depende disso (senão chega no `note.js` e minimiza).
- **Posição da barra e do menu** usa `getBoundingClientRect` (que já vem com o zoom), não `quill.getBounds`.

**Zoom.** A folha tem 794 px de largura (um A4) e `min-height: 1123px`, fixos no CSS (`.folha-papel`);
`transform: scale(zoom)` com `zoom = min(1, (largura da área − 24) / 794)`. A `.folha-caixa` tem o tamanho **já
escalado** (é ela que dá a altura da rolagem). O `ResizeObserver` reencaixa dentro de um `requestAnimationFrame` (ajustar
tamanho de dentro do observador dá "ResizeObserver loop completed…" no console — o teste vigia isso), e a área usa
`scrollbar-gutter: stable` para a barra de rolagem não mudar a largura e, com ela, o zoom.

**A tinta (`tinta.js`).** Um `<svg>` do tamanho da folha por cima do editor. Cada traço guarda pontos em **coordenadas
da folha** (`(clientX − svg.left) / zoom`, 1 casa decimal), então o zoom não desalinha o desenho. O SVG só pega o mouse
com uma ferramenta de desenho ligada (`svg.style.pointerEvents`, pelo CSSOM por causa do CSP); com "texto", o clique cai no
editor. A borracha apaga o **traço inteiro** tocado (raio 7). Desfazer/refazer são só da tinta (o texto usa os do Quill);
com uma ferramenta de desenho ligada o Ctrl+Z/Y da janela valem para a tinta.

**Gravar.** `folha.js` junta as mudanças e avisa a tela 1 s depois da última; `note.js` chama `salvarAgora()` (assíncrono).
Minimizar (`visibilitychange`) grava; fechar/recarregar (`beforeunload`) usa `salvarSincrono` (`ipcRenderer.sendSync` → o
principal escreve de forma síncrona: uma gravação assíncrona não termina antes de a janela morrer); trocar de arquivo e
desligar a folha gravam **antes**. Excluir chama `folha.esvaziar()` antes, para uma gravação pendente não recriar o `.json`
(e `salvar` recusa quem não está mais em `notasLivres`). Gravação recusada deixa a folha "suja" e avisa na dica.
Uma folha com JSON estragado no disco abre **vazia** e é sobrescrita na próxima gravação.

**Janela.** `janelas.notaLivre` (padrão 760×600, mínimo 480×420) é lembrado **separado** de `nota`. A tela avisa o modo
com `janela:modoNota` quando `desenhar()` vê o modo mudar (e sempre na primeira vez, para um recarregar acertar o estado
do principal) → `janelas.definirModoNota`: troca o tamanho e o tamanho **mínimo**, limita à área útil do monitor e traz a
janela para dentro da tela. `lembrarTamanho` aceita uma função para gravar no nome certo. O `note.js` também impede o
`drop` de arquivo fora do editor (senão o Electron abre a imagem no lugar do Fast Note).

Testes: `teste-folha.js` (parte A: armazenamento, validação, imagens, protocolo, Lixeira; parte B: a tela — seletor,
atalhos, menu `/`, barra, gravar/fechar/abrir, colar imagem, caneta/marca-texto/borracha/desfazer, zoom em dois tamanhos de
janela, tamanhos por modo, desligar/ligar, C, vassoura, `/nome texto`, excluir, console sem erros). As capturas ficam em
`.verif/folha-*.png`.

### Tarefas concluídas → daily (`notas.alternarTarefa`)

**Formato no `task.md`:** a data da conclusão fica **escondida** no fim da tarefa, num comentário que nenhum
editor mostra: `- [x] texto <!-- feita 2026-10-01 -->` (tarefa de várias linhas: no fim da última). Os
arrays do renderer continuam sendo **strings** — o comentário é parte do texto (`separarTarefas`/
`montarTarefas` não mudaram). A tela nunca o mostra: `semData()` na lista, na edição e no botão C, e
`comDataDe()` o devolve ao salvar uma edição. Sem data (feita antes desta função) volta para "A fazer" sem
mexer na daily.

**Config:** `tarefas: { aoConcluir: 'nada'|'daily'|'dailyTopico' (padrão 'daily'), arquivoDaily: '' }`
(`config.obterTarefas()`; campo faltando vale o padrão). Padrão `''` = nada é registrado. Quem valida o arquivo é
`notas.arquivoDaily()`, **na hora de usar**: tem que existir na pasta, ter o relógio ligado e não ser o
`task.md`; senão `null` e nada é gerado (sem erro).

**Atômico, no principal.** O clique na bolinha manda `tarefas:alternar(grupo, indice, texto, confirmado)` (o
`indice` é o da lista **do arquivo**; a tela mostra invertido) e recebe as tarefas novas. `alternarTarefa`
lê o `task.md`, **confere que o texto está no índice** (senão devolve `desatualizado` com as tarefas de agora e
nada muda), move, põe/tira a data, mexe na daily e grava. Tudo numa fila (`naFilaDasTarefas`): `salvarTarefas`
e `adicionarTarefa` também passam por ela, e uma regravação da tela no meio de um alternar não o sobrescreve.
Dois cliques ao mesmo tempo → só um vale.

- **Concluir:** a tarefa vai para o fim de "Concluídas" com a data de hoje e, com a daily válida e o modo ≠
  'nada', `adicionarHistorico(daily, hoje, texto)` — ou `"▸ " + texto` no modo 'dailyTopico'. Cada tarefa =
  um tópico.
- **Desmarcar:** lê a data escondida e tira da daily, **naquele dia**, o **último** tópico igual ao texto (ou
  `"▸ "` + a 1ª linha). Um recolhível cujo corpo **não é o que o Blink gerou** (as linhas da tarefa depois
  da primeira) tem anotações do usuário: devolve `precisaConfirmar` sem mudar nada (a tela mostra "O tópico na
  daily tem anotações. Remover mesmo assim?"; `confirmado` remove). Não achou (o texto foi editado lá) →
  `nao-achou`: a tarefa volta mas nada some da daily e a dica avisa. A remoção vale mesmo com o modo em
  'nada' (o tópico pode ter sido criado quando o modo era outro).
- "Limpar concluídas" e apagar uma tarefa são regravações do `task.md` pela tela e **não** mexem na daily.

**Tópico recolhível** (`montarRecolhivel` em `note.js`; só no histórico): item cuja 1ª linha começa com
`"▸ "` — título com seta ▸/▾ e, abaixo, uma `textarea` com as linhas seguintes. Fechado ao
desenhar (o estado aberto fica em `recolhiveisAbertos`, só na memória, chave `dia|título`, e sobrevive a
redesenhos). O corpo grava com debounce de 600 ms e ao sair do campo (`salvarDiaHistorico`; confere que o
índice ainda é o mesmo tópico antes de gravar). Editar o título preserva o corpo (quebra de linha no título
vira espaço). O C copia `- título` + corpo indentado, sem o prefixo.

**Tela:** `ajustarAltura()` também serve ao corpo do recolhível. A aba Fast Note das configurações ganhou o
segmentado "Ao concluir uma tarefa" e o select "Arquivo da daily" (só arquivos com relógio + "Nenhum"); com o
conteúdo mais alto que a janela mínima (460×530) a área das abas **rola** (`overflow-y: auto`, fase 5).

Testes: `teste-tarefas-daily.js` (parte A: 42 casos no principal, numa pasta temporária; parte B: a tela, com a
aba e o recolhível).

### Fonte e tamanho do Fast Note e do Diff

Config `aparencia: { note: { fonte, tamanho }, diff: { fonte, tamanho } }` (padrões JetBrains Mono 12 e 13).
**Nenhum campo é obrigatório**: gravar só a fonte não cria o tamanho, e quem lê usa
`config.obterAparencia(janela)`, que completa com o padrão (e trata valor fora da lista como padrão).
O schema recusa fonte fora de `FONTES_VALIDAS` e tamanho fora de 10–20 (`definir` lança erro, como em todo
campo com enum). A lista de fontes é **fixa** (o Electron não enumera as instaladas) e existe em dois
lugares: `config.js` (`FONTES_VALIDAS`, o enum do schema) e `renderer/comum/aparencia.js` (`FONTES`, com a
pilha de CSS de cada uma) — `teste-aparencia.js` confere que batem.

Como chega à tela: o CSS das duas janelas lê `--fonte-conteudo` e `--tamanho-conteudo` (padrões em
`note.css` e `diff.css`); `aparencia.js` os põe no `<html>` (por `style.setProperty`, que o CSP permite).
Cada janela chama `Blink.aparencia.iniciar('note'|'diff')` ao abrir e escuta o `config:mudou`, que o
`ipc.js` manda a **todas** as janelas quando um caminho `aparencia.*` é gravado (`AVISAM_AS_JANELAS`: só
esses; o resto é lido ao abrir a janela ou montar a aba). O `config:ler` já devolve `aparencia` com os
padrões aplicados.

A geometria do Fast Note depende do tamanho: `--linha-conteudo` = tamanho × 1,3333 (16px a 12px), e
`--linha-primeira` = `max(22px, linha)` (o X de apagar tem 22px). A alça, o `.corpo-topico`, o X e a
bolinha das tarefas se **centram na primeira linha** com margens calculadas dessas duas variáveis (a de baixo
cancela a de cima). No padrão dá os mesmos valores medidos na fase 1 (item 34px, X 22, linha 16, alça 4px,
corpo 3px, bolinha 2,5px); `teste-aparencia.js` confere o centro do X, da alça e da bolinha em oito
combinações de fonte e tamanho. O rascunho usa tamanho + 0,5px (12,5 no padrão) e o campo de edição
`font: tamanho/1.5`. Mudar o tamanho com um campo de edição aberto o reajusta (`aoAplicar`).

**`ajustarAltura()` precisa terminar sempre**: ao fixar a altura do campo, a lista pode ganhar a barra de
rolagem, o campo estreita e quebra uma linha a mais. Medir de novo voltando a `height: auto` tira a barra e
cai no mesmo ciclo (sem ponto fixo: 8 linhas sem barra, 9 com ela). Por isso a segunda medida **só cresce**
(até 3 voltas) e nunca volta a `auto`.

A área das abas da janela principal (`.conteudo`) rola (`overflow-y: auto`) quando uma aba passa da altura.

### Fast Note: qual arquivo abre, e o olho do cabeçalho

**Precedência ao abrir:** estrela (`notaPrincipal`) → último arquivo (`ultimaNota`) → primeiro da
pasta (`primeiroArquivo()` em `note.js`). O `ultimaNota` é gravado pelo renderer a cada troca
(`lembrarArquivo()`), e não só ao fechar, de propósito: o `Ctrl + Alt + N` com a janela já aberta
faz `nota.reload()` (`janelas.abrirNota`), que roda o `iniciar()` de novo — o recarregamento tem que
cair no arquivo que estava na tela. Como o `arquivo` muda em vários lugares (seletor, `/task`,
gravação em nota nova ou em outra nota), o gancho fica em cada um, não só em `escolherArquivo`.
Como a estrela, o `ultimaNota` é revalidado contra a pasta (`notas.ultima()`) e limpo ao excluir o
arquivo, e só o processo principal grava (fora dos `CAMINHOS_GRAVAVEIS`).

**O olho** do cabeçalho do Fast Note e do Diff é um botão (`.botao-olho`, com `no-drag`: o cabeçalho
inteiro é área de arrasto e o clique nunca chegaria ao JS). Chama `janela:abrirPrincipal`, que só
aceita nomes de ferramenta conhecidos, mostra a principal (`mostrarPrincipal(aba)`) e **fecha** a
janela da ferramenta — elas são `alwaysOnTop` e a principal não, então a principal apareceria
escondida atrás. A aba vai gravada em `abaAtiva` (vale se a principal ainda carrega) e também
mandada pelo canal `principal:aba`, porque a principal só lê o config uma vez, ao abrir.

**O estado da janela principal envelhece.** A principal nasce escondida na abertura do app e fica
carregada por horas; o `estado` que `principal.js` lê da configuração seria o de quando ela abriu. Já
causou um defeito real: a pasta das notas também é gravada por fora (o seletor que o `Ctrl + Alt + N`
abre em `garantirPasta`), e a aba Fast Note continuava dizendo "Nenhuma pasta escolhida" com a pasta
salva — e, no mesmo esquema, dialeto, caixa e indentação voltavam ao valor antigo ao trocar de aba.
Por isso `mostrarAba` **relê** a configuração a cada troca e a aba Fast Note é redesenhada quando a
janela volta a ter o foco (com 150ms de espera: o seletor de pasta ainda está gravando). As outras
abas não são redesenhadas no foco, porque uma gravação de atalho em andamento seria interrompida.
Teste: `.verif/teste-pasta.js`.

**Botão copiar (C)** (`#btn-copiar`, `textoParaCopiar()` em `note.js`): copia como `- tópico`, do mais
antigo para o mais novo (a tela mostra o mais novo primeiro, então inverte uma cópia), continuação
indentada com 2 espaços, CRLF, pelo IPC `areaTransferencia:escrever`. No histórico só o dia
selecionado; no `task.md` as caixinhas `- [ ]`/`- [x]`. Fica desabilitado como a vassoura.

**Botão minimizar** (`#btn-minimizar`, Fast Note e Diff): usa o `janela:minimizar` que a principal já
tinha; vai para a barra de tarefas. Em `janelas.js`, `abrirNota()` com a janela minimizada só faz
`restore()` — **sem** `reload()`: o rascunho não é gravado em disco e o recarregamento o perderia.
`abrirDiff()` restaura e recarrega (a comparação nova precisa das linhas novas). **Esc minimiza** nas duas
janelas (fechar é só o `×`). **Foco ao voltar:** `focarCampoDaNota()` (em `janelas.js`) manda `nota:focar`
na restauração — pela bind (`abrirNota`) e pelo evento `restore` (ícone da barra de tarefas) — e a tela foca o
campo de edição aberto, ou o `campoNome` em "+ Criar nova nota", ou o rascunho. Os botões do cabeçalho
ignoram o `mousedown` (`preventDefault`) para nunca ficarem com o foco do teclado.

**Detalhes de tela do Fast Note** (cada um tem verificação em `.verif/teste-fastnote-ajustes.js`, que usa
teclado e mouse **reais** via `sendInputEvent`, porque estes defeitos só aparecem digitando):

- **Sem ligaduras em lugar nenhum** (`* { font-variant-ligatures: none !important }` em `comum/base.css`). A
  JetBrains Mono tem uma ligadura para `..`/`...` desenhada pelo **último** caractere; digitando, ao teclar o
  terceiro ponto o primeiro sumia (2 pontos na tela, 3 no texto) — por atribuição de `value` não aparecia, e só
  no zoom de 125%. O `!important` é por causa do atalho `font:` do `.campo-edicao`, que zera as ligaduras. O teste
  conta os pontos **no print**, com o campo sem foco (sem cursor).
- **O X fica no topo do bloco:** `.topico { align-items: flex-start }` com margens compensadas na alça (`4px/-4px`)
  e no texto (`3px/-3px`); item de uma linha continua com 34px, idêntico ao de antes (medido: X 22px, texto 16px,
  alça 14px).
- **Edição que não empurra a tela:** `ajustarAltura()` põe a altura em `auto` para medir, o que encurta a lista e
  faz o navegador cortar a rolagem — a rolagem é guardada e devolvida na hora. O foco usa `preventScroll`, e o
  cursor entra **onde se clicou** (`caretRangeFromPoint`), não no fim (num tópico comprido o fim está fora da
  tela e a primeira tecla rolava até lá). `desenhar({ manter: true })` (editar, apagar, concluir, reordenar)
  mantém a rolagem; o padrão volta ao topo (item novo, outro arquivo/dia).
- **Tab indenta** (`indentarComTab`, rascunho e campo de edição) por `execCommand('insertText')`, para o Ctrl+Z
  funcionar. A tabulação é guardada nos três formatos; no **histórico**, `LINHA_CONTINUACAO_DIA` tira exatamente os
  4 espaços que o `escreverTopicoDia` grava (o resto é indentação do usuário) e `LINHA_TOPICO_DIA` só aceita
  espaços antes do traço (senão "`<tab>- filho`" dentro de um tópico viraria tópico novo). Limitação antiga e
  deliberadamente fora do pedido: em nota comum e no `task.md`, indentação com **espaços** na continuação ainda é
  engolida na leitura (a tabulação não).
- **Vassoura cinza das concluídas:** botão no `.divisor-tarefas` (`order` no CSS, porque o `::after` vem depois dos
  filhos), centrado na coluna do X; reaproveita o popover da vassoura do topo com `limparModo = 'concluidas'`.

**Testes e perfil:** os testes rodam com `electron .verif/x.js`, cujo perfil é `%APPDATA%\Electron` — **separado**
do Blink instalado (`%APPDATA%\Blink`), então não mexem na sua configuração. Eles **usam a área de transferência
real**: copiar algo no PC durante a rodada derruba `teste-auto`/`teste-copiar` e contamina o golden (rode de novo).
Nunca use `webContents.setZoomFactor` numa sonda: o Chromium **guarda o zoom** no perfil de teste e todas as
janelas `file://` passam a abrir com ele (desfaça com `setZoomFactor(1)`).

### I18n

Segue o mesmo molde do Formatter (`src/main/ferramenta-i18n.js`): sem janela própria, a bind
captura a seleção com `selecao.capturar()`, troca os caracteres e grava na área de transferência.
Diferente do SQL, a transformação nunca falha — qualquer texto é válido — então não existe o
branch de "seleção inválida".

**A tabela `TRADUCOES` nunca deve ter uma sequência de escape digitada direto no fonte.** Escrever
algo como uma string com uma contra-barra, um "u" e quatro dígitos hexadecimais faz o próprio
JavaScript decodificar aquilo na hora de carregar o arquivo e virar o caractere de volta — o
oposto do que a ferramenta precisa produzir (o texto da sequência de escape, pronto para colar em
outro código). A função `escape(hex)` do arquivo monta a contra-barra com `String.fromCharCode(92)`
em vez disso, exatamente para tirar essa pegadinha do caminho. Para acrescentar um caractere novo à
tabela, é só uma linha `'x': escape('00xx'),` — nunca uma string com a sequência escrita à mão.

A última linha da tabela (a aspa curva simples esquerda) é a única exceção de propósito: troca por
**outro** caractere (o apóstrofo reto), não pelo escape de si mesma. Qualquer entrada nova que
seguir esse padrão deveria ganhar um comentário como o que já está lá, para não parecer erro de
digitação.

**Cuidado ao escrever testes que capturam texto acentuado com o teclado falso.** Um
`clipboard.writeText()` disparado por um `setTimeout` separado, concorrendo com o poll de 25ms do
`esperarTexto()` de verdade (`selecao.js`), pode fazer o Electron devolver o texto corrompido numa
leitura entre as duas chamadas — um bug de corrida do próprio Electron nesta combinação de
Windows/versão, não do código do Blink (confirmado isolando `clipboard.writeText`/`readText` fora
de qualquer código do projeto). Só aparece com caracteres fora do ASCII; testes com SQL em inglês
nunca esbarraram nisso. O jeito confiável de simular o `Ctrl + C` nos testes é escrever no
`clipboard` **na hora**, dentro do próprio `keyTap` falso, sem `setTimeout` no meio — veja o
`libnutFalso` de `.verif/teste-i18n.js`.

### Acrescentar um campo obrigatório novo no schema do config.json

O `clearInvalidConfig: true` do electron-store (`src/main/config.js`) só cobre um caso: o
`config.json` virar um JSON inválido (erro de sintaxe). Um `config.json` de uma versão anterior,
que continua sendo JSON válido mas não bate mais com um `ESQUEMA` que ganhou uma exigência nova
— por exemplo, uma bind nova adicionada ao `required` de `binds` — faz o `new Store(...)` lançar
exceção mesmo assim, e essa exceção quebraria o app inteiro na abertura (antes de qualquer janela
existir). Foi o que aconteceu ao acrescentar a bind do I18n: qualquer `config.json` salvo antes
dessa versão não tinha `binds.i18n`, e o app não subia mais.

`criarStore()`, em `config.js`, cobre esse segundo caso também: se o `Store` com schema falhar na
abertura, ele apaga o `config.json` antigo e recomeça dos padrões — a mesma intenção do
`clearInvalidConfig`, só que também para "JSON válido, schema desatualizado". Ao adicionar um novo
campo `required` no futuro, esse caminho já cobre sozinho; não precisa de nenhuma migração manual.

### O Ctrl que continua apertado depois da bind

`selecao.js` manda o Ctrl+C por baixo para capturar a seleção. Antes, `soltarModificadores()` mandava um
Ctrl "para cima" falso e depois `keyTap('c', ['control'])`, que aperta e **solta** o Ctrl: o Windows passava a achar
o Ctrl solto mesmo com o dedo do usuário nele, e quem soltava só o Alt e o F e emendava um Ctrl+V recebia um "v".
Agora `teclado.js` lê o estado real do Ctrl (`GetAsyncKeyState` da `user32`, chamado pelo **koffi**, que traz o
binário pronto — pacote opcional `@koromix/koffi-win32-x64`; o `asarUnpack` de `**/*.node` já o cobre):

- Ctrl apertado → só `keyTap('c')`, o Ctrl do usuário já vale; Alt e Shift continuam sendo "soltos".
- Ctrl solto → `keyTap('c', ['control'])`, como sempre foi.
- koffi indisponível (`null`) → solta tudo e manda Ctrl+C, o comportamento antigo.

A pergunta é feita **na hora de mandar o C** (`mandarCtrlC()`), não na da bind: entre as duas passam ~100 ms e o
usuário pode ter soltado o Ctrl — mandar um "c" puro substituiria a seleção dele. O log de diagnóstico ganhou
`ctrl="apertado|solto|desconhecido"` em cada captura (útil para investigar um relato). O teste
(`.verif/teste-ctrl.js`) usa o estado do Ctrl e a `libnut` falsos: **nunca** mande tecla de verdade num teste.

### Testes que mexem no teclado

**Nunca rode um teste que chame `selecao.capturar()` com o teclado de verdade.** Ele manda
`Ctrl + C` para a janela que estiver na frente — que pode ser um cliente de banco conectado em
produção. Substitua o `libnut` no cache do `require` por um objeto falso antes de carregar o
`selecao.js`, e confira que as teclas foram parar no falso antes de capturar qualquer coisa.

### Regenerar o ícone da bandeja

O arquivo `src/assets/icones/blink.ico` é versionado. Só precisa rodar este comando se o desenho do
olho em `src/assets/olho.svg` ou `olho-simples.svg` mudar:

```
npm run gerar-icone
```

Os dois SVGs têm a mesma geometria de propósito: a bandeja usa os tamanhos pequenos do `.ico` e a
barra de tarefas os grandes. O desenho é uma **caixa de aplicativo** (quadrado arredondado escuro) com
o olho dentro — anel claro, íris escarlate, pupila e brilho. `olho-simples.svg` é chapado (16, 20, 24 e
32 px) e `olho.svg` tem degradê e um filete claro na caixa (48 e 256 px). O mesmo desenho está
copiado, em SVG embutido, no cabeçalho das três janelas (`principal/index.html`, `note/index.html` e
`diff/index.html`, a 16 px, com um filete claro na caixa para ela não sumir no fundo escuro do
cabeçalho): mudou o desenho, mude os cinco lugares. O `.ico` guarda as imagens pequenas como BMP
(DIB) e a de 256 px como PNG — para conferir o que foi empacotado, `.verif/olhos/extrair-ico.js` abre o
arquivo e monta uma folha com cada tamanho.

## Referência de design

A pasta `design_handoff_blink/` guarda o protótipo original (`Blink.dc.html`, abra no navegador) e a
especificação visual completa (`README.md`). É a fonte da verdade para cores, tamanhos e
espaçamentos.

## Estado do projeto

| Etapa | O que entrega | Situação |
|---|---|---|
| 1 | Bandeja, janela principal com as 3 abas, configurações salvas | pronta |
| 2 | Captura da seleção e SQL Formatter | pronta |
| 3 | Fast Note | pronta |
| 4 | Diff Checker | pronta |
| 5 | Menu da bandeja, iniciar com o Windows, instalador | pronta |
| 6 | Atualização automática pelo GitHub Releases | pronta |
| 2b | Tela de demonstração do SQL Formatter | a fazer |

## Contribuições

Contribuição entra por fork e pull request, e só é incorporada depois de revisada e aprovada pelo
mantenedor.
