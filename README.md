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
| 1 | Bandeja, janela principal com as 3 abas, configurações salvas | em andamento |
| 2 | Captura da seleção e SQL Formatter funcionando | a fazer |
| 3 | Fast Note funcionando | a fazer |
| 4 | Diff Checker funcionando | a fazer |
| 5 | Menu da bandeja, iniciar com o Windows, instalador | a fazer |
