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

### A captura da seleção

O Windows não permite perguntar a outro programa o que está selecionado. O Blink simula `Ctrl + C`,
lê a área de transferência e devolve ela como estava (`src/main/selecao.js`). As esperas estão em
constantes no começo do arquivo, com o porquê de cada número.

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
