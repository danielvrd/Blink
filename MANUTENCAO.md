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
- **O `electron-builder` perde arquivos em silêncio.** Ele envia os arquivos em paralelo, e quando a
  Release ainda não existe cada envio tenta criá-la: um ganha, e o arquivo do outro some sem erro
  nenhum — o comando termina com sucesso e a Release fica sem o instalador ou sem o `latest.yml`.
  Aconteceu três vezes seguidas. Por isso o último passo confere a Release e envia o que faltou.

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

**XML** (`src/main/formatador-xml.js`). O SQL Formatter desvia para o XML quando o texto começa com
`<?xml`, `<!--` ou `<` + letra (ou o mesmo escapado, `&lt;`). Uma SQL nunca começa com `<`, então o
caminho do SQL fica intacto. A biblioteca `xml-formatter` roda em **modo estrito**: sem ele, um XML
quebrado ou cortado no meio — o comum em log — era "consertado" em silêncio, com a estrutura
inventada. Ao desescapar, o `&amp;` é trocado por último: `&amp;lt;` no original é o texto `&lt;`.

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
