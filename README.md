# Blink

App desktop local para Windows que fica na bandeja do sistema e oferece três ferramentas
acionadas por atalhos globais:

1. **Diff Checker** — captura dois textos selecionados em qualquer programa e abre um comparador lado a lado.
2. **Fast Note** — abre um mini bloco de notas que grava tópicos em arquivos `.md` de uma pasta escolhida.
3. **SQL Formatter** — formata a SQL selecionada em qualquer programa e deixa o resultado pronto para colar.

Tudo roda localmente. Não há servidor, API ou envio de dados para fora da máquina.

## Como rodar

```
npm install
npm start
```

O app sobe **escondido**: o ícone do olho aparece na bandeja, ao lado do relógio. Clique nele para
abrir a janela de configurações.

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
| 2b | Tela de demonstração do SQL Formatter | a fazer |
| 5 | Menu da bandeja, iniciar com o Windows, instalador | a fazer |

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
