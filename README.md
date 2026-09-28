# Blink

App desktop local para Windows que fica na bandeja do sistema e oferece três ferramentas
acionadas por atalhos globais:

1. **Diff Checker** — captura dois textos selecionados em qualquer programa e abre um comparador lado a lado.
2. **Fast Note** — abre um mini bloco de notas que grava tópicos em arquivos `.md` de uma pasta escolhida.
3. **SQL Formatter** — formata a SQL selecionada em qualquer programa e substitui a seleção pelo resultado.

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
| 2b | Tela de demonstração do SQL Formatter | a fazer |
| 3 | Fast Note funcionando | a fazer |
| 4 | Diff Checker funcionando | a fazer |
| 5 | Menu da bandeja, iniciar com o Windows, instalador | a fazer |

### Como testar o SQL Formatter

1. `npm start`
2. Abra qualquer editor (VS Code, Bloco de Notas, SQL Server Management Studio)
3. Escreva uma SQL em uma linha só, por exemplo:
   `select a,b from t where x=1 order by a`
4. Selecione o texto e pressione `Ctrl + Alt + F`

A seleção deve ser substituída pela SQL formatada. Se nada acontecer, veja
"Quando o atalho não faz nada" abaixo.

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
