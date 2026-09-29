# Blink

App desktop local para Windows que fica na bandeja do sistema e oferece três ferramentas
acionadas por atalhos globais:

1. **Diff Checker** — captura dois textos selecionados em qualquer programa e abre um comparador lado a lado.
2. **Fast Note** — abre um mini bloco de notas que grava tópicos em arquivos `.md` de uma pasta escolhida.
3. **SQL Formatter** — formata a SQL selecionada em qualquer programa e deixa o resultado pronto para colar.

Tudo roda localmente. Não há servidor, API ou envio de dados para fora da máquina.

## Instalar

Baixe o `Blink-Setup-0.1.0.exe` (113 MB) e execute. A instalação é por usuário,
em `%LOCALAPPDATA%\Programs\Blink`, então não pede senha de administrador.

O Windows vai mostrar um aviso azul do SmartScreen dizendo que o app é de um
editor desconhecido. É esperado: o instalador não tem assinatura digital, que é
um certificado pago. Clique em "Mais informações" e depois em "Executar assim
mesmo".

Depois de instalado, o Blink sobe escondido na bandeja. Para ele iniciar junto
com o Windows, clique com o botão direito no ícone e marque "Iniciar com o
Windows".

## Como rodar durante o desenvolvimento

```
npm install
npm start
```

## Gerar o instalador

```
npm run empacotar
```

O resultado sai em `dist/Blink-Setup-<versão>.exe`. Para conferir o app
empacotado sem gerar o instalador (bem mais rápido), use
`npm run empacotar-pasta`: ele deixa o executável pronto em
`dist/win-unpacked/`.

**Só roda uma cópia do Blink por vez.** Duas brigariam pelos mesmos atalhos
globais e a segunda ficaria muda. Se você abrir o app instalado enquanto um
`npm start` estiver rodando, o novo apenas mostra a janela do que já está no ar
e encerra — o que parece um travamento, mas é a trava funcionando. Para testar o
app instalado, feche o de desenvolvimento antes pelo "Sair" da bandeja.

O app sobe **escondido**: o ícone do olho aparece na bandeja, ao lado do relógio. Clique nele para
abrir a janela de configurações.

## Publicar uma atualização

O app **não** lê o código do repositório. Ele lê um arquivo `latest.yml`
publicado numa **Release** do GitHub, compara a versão de lá com a que está
rodando e baixa o instalador novo se houver novidade.

Quer dizer: fazer `git push` não atualiza ninguém. O que atualiza é publicar uma
Release.

### Uma vez só: o token

O `electron-builder` precisa de permissão para criar a Release. Gere um token em
**GitHub → Settings → Developer settings → Personal access tokens → Fine-grained**,
com acesso ao repositório `Blink` e permissão de escrita em **Contents**.

Guarde na sua conta do Windows (uma vez só, vale para sempre):

```powershell
[Environment]::SetEnvironmentVariable('GH_TOKEN', 'seu_token_aqui', 'User')
```

Feche e reabra o terminal depois disso.

### A cada versão

1. Suba o número da versão no `package.json` (`0.1.0` → `0.1.1`).
2. Faça o commit e o push normalmente.
3. Rode:

```
npm run publicar
```

O comando cria a tag da versão, envia para o GitHub, limpa o `dist/`, empacota e
publica a Release com o instalador e o `latest.yml`.

Três detalhes que ele resolve, cada um por causa de um erro que já aconteceu:

- **A tag precisa existir.** O GitHub recusa criar uma Release publicada sem uma
  tag no repositório (`Published releases must have a valid tag`). Sem ela, o
  empacotamento inteiro roda e só falha no fim.
- **O `dist/` precisa estar limpo.** Ele guarda o `latest.yml` do empacotamento
  anterior. Se a publicação falhar no meio, sobra o arquivo velho apontando para
  a versão passada — e o app lê "já está atualizado" para sempre.
- **Nada pode estar pendente de commit.** A tag aponta para o commit atual; com
  mudanças soltas, a tag e o instalador não batem com o repositório.

A Release sai publicada, não como rascunho — o app não enxerga rascunho.

Pronto. O Blink instalado de cada pessoa vai encontrar a versão nova na próxima
vez que abrir, ou em até 6 horas se já estiver aberto.

### Como a atualização chega

- Procura ao iniciar e a cada 6 horas.
- Achou: baixa em segundo plano e avisa por notificação.
- Baixou: avisa de novo, e o menu da bandeja passa a mostrar
  **"Reiniciar para atualizar"**.
- Se você não clicar, a atualização se aplica sozinha na próxima vez que o Blink
  fechar.

Nada disso funciona pelo `npm start`: sem instalador não há o que trocar, e o
menu mostra o item desabilitado.

**Importante na primeira vez:** a atualização automática só existe a partir da
versão que a inclui. Uma cópia instalada antes disso não vai se atualizar
sozinha — precisa ser reinstalada uma vez na mão.

## Menu do ícone na bandeja

Clique com o botão direito no olho, ao lado do relógio:

| Item | O que faz |
|---|---|
| Abrir Blink | mostra a janela de configurações |
| Diff Checker | abre a comparação com dois textos de exemplo |
| Fast Note | abre o bloco de notas |
| SQL Formatter | lembra qual é o atalho |
| Procurar atualizações | consulta o GitHub na hora; vira "Reiniciar para atualizar" quando há uma baixada |
| Iniciar com o Windows | liga ou desliga a inicialização automática |
| Sair | encerra o Blink de verdade |

O Diff Checker e o SQL Formatter dependem de um texto selecionado, e clicar em
um item de menu tira o foco do programa onde ele estava. Por isso, pelo menu,
esses dois não capturam nada — use as binds.

## Atalhos padrão

| Ferramenta | Atalho |
|---|---|
| Diff Checker | `Ctrl + Alt + D` |
| Fast Note | `Ctrl + Alt + N` |
| SQL Formatter | `Ctrl + Alt + F` |

Todos podem ser trocados na janela principal, em "Alterar".

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
`main` e são acessadas pelas telas através do `preload`.

Os comentários estão em português.

### Onde ficam as configurações

`%APPDATA%/Blink/config.json` — binds, pasta de notas e opções do SQL Formatter.

### Regenerar o ícone da bandeja

O arquivo `src/assets/icones/blink.ico` é versionado. Só precisa rodar este comando se o desenho do
olho em `src/assets/olho.svg` mudar:

```
npm run gerar-icone
```

## Referência de design

A pasta `design_handoff_blink/` guarda o protótipo original (`Blink.dc.html`, abra no navegador) e a
especificação visual completa (`README.md`). É a fonte da verdade para cores, tamanhos e espaçamentos.

## Estado do projeto

| Etapa | O que entrega | Situação |
|---|---|---|
| 1 | Bandeja, janela principal com as 3 abas, configurações salvas | pronta |
| 2 | Captura da seleção e SQL Formatter funcionando | pronta |
| 4 | Diff Checker funcionando | pronta |
| 3 | Fast Note funcionando | pronta |
| 5 | Menu da bandeja, iniciar com o Windows, instalador | pronta |
| 6 | Atualização automática pelo GitHub Releases | pronta |
| 2b | Tela de demonstração do SQL Formatter | a fazer |

### Como testar o SQL Formatter

1. `npm start`
2. Abra qualquer editor (VS Code, Bloco de Notas, SQL Server Management Studio)
3. Escreva uma SQL em uma linha só, por exemplo:
   `select a,b from t where x=1 order by a`
4. Selecione o texto e pressione `Ctrl + Alt + F`
5. Vá para outro arquivo e cole com `Ctrl + V`

O arquivo de origem **não é alterado**. A bind formata e deixa o resultado na
área de transferência; uma notificação do Windows confirma. Se nada acontecer,
veja "Quando o atalho não faz nada" abaixo.

### Como testar o Diff Checker

A bind funciona em **dois tempos**:

1. Selecione o primeiro texto e pressione `Ctrl + Alt + D` — uma notificação
   confirma que ele foi guardado.
2. Selecione o segundo texto (em qualquer programa) e pressione `Ctrl + Alt + D`
   de novo — a janela de comparação abre.

Na janela: clique em uma linha da esquerda para escolhê-la e na seta para
levá-la para a direita. "Copiar texto" copia o lado direito inteiro, já com as
linhas aplicadas. `Esc` fecha e descarta a comparação.

O texto guardado vale por **2 minutos**. Depois disso a próxima bind volta a ser
a primeira, para você não comparar com algo que capturou e esqueceu. Ao abrir a
janela o guardado também é descartado, então o próximo par começa limpo.

O botão "Abrir demonstração" da aba abre a mesma janela com dois textos de
exemplo, sem capturar nada.

### Como testar o Fast Note

1. `npm start` e pressione `Ctrl + Alt + N`. Na primeira vez o Windows pergunta
   onde guardar os arquivos.
2. Escreva algo e pressione `Enter`. `Shift + Enter` quebra a linha dentro do
   mesmo tópico.
3. Escolha outro arquivo no seletor, ou "+ Criar nova nota" para começar um.

Apagar (`×`), arrastar para reordenar e a vassoura (limpar tudo) regravam o
arquivo na hora. `Esc` fecha.

**Sobre os arquivos `.md`:** o Blink só cuida das linhas que começam com `- `.
Título, parágrafo, tabela, qualquer outra coisa que você escrever no arquivo
por fora fica onde está — dá para apontar o Blink para uma pasta de notas que
você já usa.

Os tópicos ficam no arquivo em ordem cronológica, com o mais novo no fim, para
o `.md` se ler como um diário. Na janela eles aparecem ao contrário, com o mais
recente em cima.

```markdown
# Trabalho              <- o Blink não toca

Anotações da sprint.    <- o Blink não toca

- Rever PR #142         <- mais antigo
- Call com cliente      <- mais novo (em cima na janela)
```

### Quando o atalho não faz nada

O Windows não permite perguntar a outro programa o que está selecionado. O
Blink simula `Ctrl + C`, lê a área de transferência e devolve ela como estava
(`src/main/selecao.js`). Isso depende de o Windows deixar o Blink enviar
teclas, o que pode falhar em alguns casos:

- **O programa da frente roda como administrador e o Blink não.** O Windows
  bloqueia envio de teclas de um programa comum para um elevado. Rode os dois
  no mesmo nível.
- **O atalho não registrou.** Abra a janela do Blink: se o campo do atalho
  estiver vermelho, outro programa já usa essa combinação. Escolha outra.
- **O programa demora para responder.** As esperas estão em constantes no
  começo do `selecao.js` (`LIMITE_CAPTURA` e `PAUSA_APOS_COLAR`), com o
  porquê de cada número. Aumente se o seu editor for lento.
