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
- Baixou: avisa de novo, e o menu da bandeja passa a mostrar **"Reiniciar para atualizar"**.
- Se o usuário não clicar, a atualização se aplica sozinha na próxima vez que o Blink fechar.

Nada disso funciona pelo `npm start`: sem instalador não há o que trocar, e o menu mostra o item
desabilitado.

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
`main` e são acessadas pelas telas através do `preload`. Os comentários estão em português.

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
chegar começando com `SELECT`, `INSERT`, `UPDATE`, `DELETE` ou `WITH`. Fora da janela remota ele
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
  TRIGGER, blocos, `IF`/`ELSE`/`WHILE` com corpo simples, `TRY`/`CATCH`, `GO`, `SET NOCOUNT ON;`). Só age
  com um **marcador** (CREATE/ALTER de PROC/FUNCTION/TRIGGER, `BEGIN` de bloco, `IF`/`WHILE` de comando);
  sem ele devolve `null` sem nem tokenizar. A trava compara a lista de tokens da entrada e da saída
  (`lexer-sql.js`): qualquer diferença, ou qualquer coisa que o algoritmo não entenda (comando sem `;`
  ambíguo dentro de um corpo simples, `END` sem `BEGIN`…), devolve `null`. No fuzz, ~5% dos programas
  desistem; todos os outros saem idempotentes.

`functionCase` e `dataTypeCase` da `sql-formatter` recebem a mesma opção das palavras-chave
(`opcoes()`); o risco aceito é uma coluna com nome de tipo (`date`, `text`) mudar só de caixa.

#### O teste de referência ("golden") do Formatter

Como o Formatter mexe em texto de produção, toda mudança nele é conferida contra o **comportamento
anterior**, e não só contra testes escritos à mão. Em `.verif/` (fora do git):

- `corpus-formatter.js`: ~300 entradas determinísticas (SQL, procedures, XML, JSON, listas, logs).
- `golden.js`: roda o `executar()` **e** o `monitor.verificar()` reais sobre o corpus, em três
  configurações (T-SQL maiúsculas/4, T-SQL minúsculas/tab, PostgreSQL/2), com teclado e aviso falsos.
  `gerar` grava `golden-antes.json` (só com `src/` igual ao commit de referência); `atual` roda e
  compara; `comparar` reavalia as regras sobre o último resultado, sem recoletar.
- `golden-regras.js`: as **mudanças intencionais**, uma regra por etapa, cada uma com a saída esperada
  calculada de forma independente (a própria biblioteca, sem o nosso código por cima). Toda diferença
  fora das regras é regressão. Ao final, `golden-relatorio.md` lista o antes/depois de cada mudança.

O baseline do pack de 0.6.0 foi gerado no commit `6c8b367` (v0.5.0). Para a próxima rodada de mudanças
no Formatter, gere um baseline novo do commit atual e esvazie as regras.

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
barra de tarefas os grandes.

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
