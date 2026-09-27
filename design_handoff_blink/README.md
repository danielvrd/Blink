# Handoff: Blink — app desktop (Windows) de acesso rápido

## Visão geral
Blink é um app desktop **local** (sem web, sem API) que fica na bandeja do sistema e oferece 3 ferramentas acionadas por atalhos globais ("binds"):

1. **Diff Checker** — captura dois textos selecionados em qualquer programa e abre um comparador lado a lado.
2. **Fast Note** — abre um mini bloco de notas que grava tópicos em arquivos `.md` de uma pasta escolhida pelo usuário.
3. **SQL Formatter** — formata a SQL selecionada em qualquer programa e substitui a seleção pelo resultado, sem abrir janela.

Plataforma alvo: **Windows**.

## Sobre os arquivos de design
Os arquivos deste pacote são **referências de design feitas em HTML**: protótipos que mostram a aparência e o comportamento pretendidos. **Não são código de produção para copiar.** A tarefa é **recriar esse design** no ambiente escolhido para o app (ver "Stack recomendada") usando os padrões e bibliotecas dele.

`Blink.dc.html` abre direto no navegador (precisa do `support.js` na mesma pasta e de internet para fontes e para a demo do formatador). Todos os estados são clicáveis: abas, botões "Abrir demonstração", aplicar diff, criar/apagar/arrastar notas, formatar SQL.

## Fidelidade
**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamentos e interações são finais. Recriar pixel a pixel.

## Stack recomendada
- **Electron** (tudo em JavaScript/TypeScript; mais simples para começar), ou **Tauri** (mais leve; backend em Rust).
- Atalhos globais: `globalShortcut` (Electron) / plugin `global-shortcut` (Tauri).
- Bandeja: `Tray` (Electron) / tray API (Tauri).
- Área de transferência: `clipboard` (Electron) / plugin `clipboard-manager` (Tauri).
- Simular Ctrl+C / Ctrl+V para ler e substituir a seleção: `@nut-tree-fork/nut-js` (Node) ou crate `enigo` (Rust).
- Formatação de SQL: biblioteca **`sql-formatter`** (npm, MIT), **instalada localmente com versão fixa**. Nada de CDN no app.
- Persistência de configurações: `electron-store` ou arquivo JSON em `%APPDATA%/Blink`.

---

## Telas

### 1. Janela principal (configurações)
- **Tamanho:** 460px de largura, altura pelo conteúdo. Centralizada na tela. `border-radius: 16px`, fundo `#0a0a0a`, borda `1px solid rgba(255,255,255,0.08)`, sombra `0 30px 60px -20px rgba(0,0,0,.6)`.
- **Barra de título (40px, fundo `#161616`, divisória inferior `rgba(255,255,255,.06)`):** estilo Windows. Ícone do olho escarlate (13px) + "Blink" (Inter 12px/500, `#e8e9ee`) à esquerda; botões minimizar / maximizar / fechar (38×40px cada, ícones `#8b8f9c`) à direita. **Fechar = esconder na bandeja** (não encerra o app).
- **Barra de abas (fundo `#161616`, padding 0 8px, divisória inferior `rgba(255,255,255,.06)`):** 3 abas de largura igual: "Diff Checker", "Fast Note", "SQL Formatter". Inter 12.5px/600, padding 11px 4px, `border-radius: 6px 6px 0 0`.
  - Inativa: texto `#7d8190`, fundo transparente; hover texto `#c7cad1`.
  - Ativa: texto `#eef0f5`, fundo `rgba(168,57,58,0.14)`, borda inferior `2px solid #a8393a`.
- **Conteúdo:** padding 20px, min-height 270px.

Padrões dentro das abas:
- **Rótulo de seção:** Inter 10.5px, MAIÚSCULAS, letter-spacing .07em, `#5f6373`, margin-bottom 8px. Seções separadas por 22px.
- **Campo de bind:** caixa JetBrains Mono 12.5px, fundo `#161616`, borda `1px solid rgba(255,255,255,.1)`, radius 8px, padding 8px 10px, texto `#e8e9ee`. Ao lado, botão fantasma "Alterar" (padding 8px 12px, radius 8px, borda `rgba(255,255,255,.12)`, 12px/600, texto `#c7cad1`). Durante a gravação: campo mostra "Pressione as teclas…" e botão "Gravando…" em `#c65453`.
- **Rodapé da aba:** divisória `rgba(255,255,255,.06)`, padding-top 16px, centralizado: legenda 11.5px `#5f6373` + botão primário "Abrir demonstração" (padding 9px 18px, radius 9px, fundo `#a8393a`, texto `#f5eceb` 12.5px/700). **No app real esse botão pode virar "Testar" ou ser removido.**

#### Aba Diff Checker
- "Atalho de captura e comparação": padrão `Ctrl + Shift + D` (ver "Pendências": trocar por Ctrl+Alt).
- Legenda do rodapé: "Assim abriria após usar a bind duas vezes:".
- **Não há seletor de tema** (foi removido; o esquema preto é fixo).

#### Aba Fast Note
- "Atalho para abrir": padrão `Ctrl + Shift + N`.
- "Pasta de notas": caixa só leitura (JetBrains Mono 12px, `#c7cad1`, reticências se não couber) mostrando o caminho, ex.: `~/Documents/BlinkNotes`, + botão fantasma "Selecionar…" (abre o seletor de pasta do sistema).
- Legenda do rodapé: "Assim abriria ao usar a bind:".

#### Aba SQL Formatter
- "Atalho para formatar seleção": padrão `Ctrl + Shift + F`.
- "Dialeto": select largura total. Opções (valor da lib `sql-formatter` → rótulo): `transactsql` → SQL Server (T-SQL) [padrão], `postgresql` → PostgreSQL, `mysql` → MySQL, `plsql` → Oracle (PL/SQL), `sql` → SQL padrão.
- Grade de 2 colunas (gap 12px):
  - "Palavras-chave": controle segmentado `UPPER` [padrão] / `lower` / `Manter` → `keywordCase: 'upper' | 'lower' | 'preserve'`.
  - "Indentação": `2 esp.` / `4 esp.` [padrão] / `Tab` → `tabWidth` 2 ou 4; Tab → `useTabs: true`.
  - Controle segmentado: container fundo `#161616`, borda `rgba(255,255,255,.1)`, radius 8px, padding 3px, gap 3px. Botão: padding 6px 2px, radius 6px, 11px/600. Ativo: fundo `rgba(168,57,58,0.22)`, texto `#eef0f5`; inativo: transparente, `#7d8190`. Os botões de palavra-chave usam JetBrains Mono.
- Legenda do rodapé: "Selecione a SQL em qualquer lugar e use a bind: o texto é substituído já formatado."

### 2. Modal de comparação (Diff Checker)
- **Overlay:** `rgba(6,7,9,.72)` + `backdrop-filter: blur(2px)`. No app real pode ser uma janela sem moldura, transparente e sempre no topo.
- **Tamanho:** `min(1040px, 90vw)` × `min(680px, 80vh)`, centralizado. Fundo `#0a0a0a`, radius 14px, borda `1px solid rgba(168,57,58,0.28)`, sombra `0 40px 80px -20px rgba(0,0,0,.7)`.
- **Cabeçalho:** fundo `#161616`, padding 14px 18px, divisória inferior `rgba(255,255,255,0.08)`. "Comparação de texto" (13px/600, `#c9ccd3`). À direita: botão "Copiar texto" (padding 6px 12px, radius 7px, borda `rgba(168,57,58,0.28)`, 11.5px/600) e o X (28×28, `#7d828f`, hover fundo `rgba(255,255,255,.08)`).
- **Corpo:** rolagem vertical única; grade `1fr 44px 1fr`, padding 16px 6px. Uma linha da grade por linha de texto, então esquerda e direita ficam sempre alinhadas (efeito de "livro aberto").
  - Célula de texto: JetBrains Mono 13px / line-height 1.6, `#c9ccd3`, padding 8px 18px, radius 5px, `border-left: 3px`, `white-space: pre-wrap`.
  - Linha igual: sem fundo, borda transparente.
  - Linha diferente (pendente): **os dois lados** com fundo `oklch(0.75 0.15 55 / 0.14)` e borda `oklch(0.75 0.15 55)` (laranja suave). O lado esquerdo é clicável (cursor pointer).
  - Linha selecionada (clique na esquerda): anel interno `inset 0 0 0 2px #a8393a`; a seta da calha fica ativa.
  - Calha central (44px): nas linhas diferentes, botão seta "→" 28×28, radius 8px. Inativo: fundo `rgba(255,255,255,0.1)`, cor `#7d828f`. Ativo (linha selecionada): fundo `#a8393a`, cor `#f5eceb`.
  - Ao clicar na seta: o texto da esquerda substitui o da direita; o lado direito fica **verde** (fundo `oklch(0.72 0.16 145 / 0.16)`, borda `oklch(0.72 0.16 145)`), a calha mostra "✓" verde e a esquerda deixa de ser clicável.
- **Rodapé:** padding 10px 18px, divisória superior `rgba(255,255,255,0.08)`, 11px `#7d828f`: legenda "■ Diferença" (laranja), "■ Aplicado" (verde), "Esc para fechar" à direita.
- **Fechar:** X ou Esc. Ao fechar, o estado da comparação é descartado.
- **"Copiar texto":** copia o texto completo da direita (já com as linhas aplicadas); o botão mostra "Copiado ✓" por 1.4s.

### 3. Modal Fast Note
- **Tamanho:** 320×380px. Fundo `#0a0a0a`, radius 20px, borda `1px solid rgba(168,57,58,.3)`, sombra `0 30px 60px -15px rgba(0,0,0,.7)`.
- **Cabeçalho:** fundo `#161616`, padding 18px 20px, divisória `rgba(168,57,58,.2)`. Olho escarlate 12px + "Fast Note" (12.5px/600, `#eef0f5`); X à direita (24×24, `#7d8190`).
- **Corpo:** padding 14px 16px 16px, coluna com gap 10px:
  1. **Linha do select** (flex, gap 16px):
     - Select (flex 1): fundo `#161616`, borda `rgba(255,255,255,.1)`, radius 8px, padding 8px 10px, 12.5px. Opções: arquivos `.md` da pasta configurada + última opção **"+ Criar nova nota"**.
     - Botão limpar: 20×20, radius 5px, fundo `#a8393a`, ícone de vassoura 15px (`#f5eceb`). Fica com opacidade 0.35 e desativado quando não há tópicos.
     - Ao clicar: popover abaixo, alinhado à direita (150px, fundo `#161616`, borda `rgba(168,57,58,.3)`, radius 8px, padding 10px, sombra `0 10px 24px rgba(0,0,0,.5)`): "Limpar todas as notas deste arquivo?" + botões "Limpar" (primário) e "Não" (fantasma). Fecha ao trocar de arquivo ou fechar o modal.
  2. **Nome da nova nota** (só em "+ Criar nova nota"): input com placeholder `nome-da-nota.md`, JetBrains Mono.
  3. **Lista de tópicos** (flex 1, rolagem vertical, gap 5px). Cada linha: padding 6px 4px, radius 6px, JetBrains Mono 12px `#c7cad1`, hover fundo `rgba(255,255,255,.04)`, cursor grab:
     - alça "⋮⋮" (`#4a4d57`) · traço "–" · texto (quebra linha dentro do modal com `overflow-wrap: anywhere`; as linhas quebradas ficam alinhadas à direita do traço) · botão "×" de apagar (22×22, `oklch(0.68 0.19 25)`, 15px; hover `oklch(0.75 0.19 25)`).
     - **Arrastar para reordenar:** item arrastado com opacidade 0.4; linha-guia `inset 0 ±2px 0 #a8393a` indica onde vai entrar (em cima ao subir, embaixo ao descer).
     - Tópico recém-adicionado pisca com fundo `rgba(168,57,58,.18)` por 1.6s.
     - Em "+ Criar nova nota": texto vazio "Nenhum tópico ainda — escreva abaixo." (11.5px `#5f6373`).
  4. **Textarea:** 60px de altura, sem redimensionar, fundo `#161616`, placeholder "Escreva e pressione Enter…". **Enter** salva; **Shift+Enter** quebra linha.
  5. **Dica:** 10px `#5f6373`: "Enter adiciona um tópico · Pasta: <caminho>".

### 4. Modal SQL Formatter (demonstração)
No uso real **não abre janela**: a seleção é substituída direto. O modal existe como tela de teste e pré-visualização.
- **Tamanho:** `min(1040px, 90vw)` × `min(640px, 80vh)`; mesmo visual do modal de comparação (fundo `#0a0a0a`, borda vermelha, cabeçalho `#161616` com "SQL Formatter", botões "Copiar" e X).
- **Corpo:** 2 colunas iguais (divisória `rgba(255,255,255,0.06)`), cada uma com padding 14px 16px, rótulo de seção ("Seleção original" / "Formatada") e um painel (fundo `#111111`, borda `rgba(255,255,255,.08)`, radius 8px, padding 12px 14px, JetBrains Mono 13px/1.6):
  - Esquerda: textarea editável, placeholder "Cole ou digite uma SQL…", texto `#9a9ea9`.
  - Direita: resultado formatado ao vivo, com rolagem e `white-space: pre`, com destaque de sintaxe: palavras-chave `#e0676a`, strings e números `#d8b48a`, comentários `#5f6373`, resto `#c9ccd3`.
- **Rodapé:** resumo das opções ("SQL Server (T-SQL) · MAIÚSCULAS · 4 espaços"), "No uso real, a seleção é substituída direto, sem abrir janela.", "Esc para fechar".
- **Fechar (X/Esc) limpa os dois campos.**

### 5. Ícone da bandeja
Escolhido: **Olho Escarlate**. Contorno de olho amendoado (traço claro) + íris vermelha com gradiente radial (`#ff5a6b` → `#e0263b` → `#7a0f1e`), pupila escura, brilho branco. O mesmo olho (versão simplificada) é o logo usado na barra de título e no cabeçalho do Fast Note. O SVG está em `Blink.dc.html` (procure `scarletIris`). Para a bandeja do Windows, gerar `.ico` com 16, 20, 24, 32 e 48px e conferir a leitura em 16px (pode ser necessário simplificar).
- Clique esquerdo: abre a janela principal.
- Clique direito (**ainda não desenhado**): menu com "Abrir Blink", "Diff Checker", "Fast Note", "SQL Formatter", separador, "Sair".

---

## Comportamento real (lógica a implementar)

### Captura da seleção (Diff Checker e SQL Formatter)
1. Salvar o conteúdo atual da área de transferência.
2. Simular Ctrl+C e esperar cerca de 100ms.
3. Ler a área de transferência (texto capturado).
4. **Restaurar** a área de transferência original ao terminar.

### Diff Checker
1. 1ª bind: captura o texto A. Mostrar um aviso discreto: "1º texto capturado — selecione o segundo" (**ainda não desenhado**). Esc ou timeout cancela.
2. 2ª bind: captura o texto B e abre o modal (A à esquerda, B à direita).
3. Diff por linha (ex.: lib `diff`, `diffLines`). **Linhas adicionadas/removidas** precisam de uma linha vazia do outro lado para manter o alinhamento (**estado ainda não desenhado**).
4. Aplicar (→) copia a linha da esquerda para a direita e marca como aplicada (verde).

### Fast Note
- O select lista os arquivos `*.md` da pasta configurada (atualizar ao abrir o modal).
- Enter: grava o texto como tópico no arquivo selecionado, no formato de lista Markdown `- texto`.
- "+ Criar nova nota": cria `<nome>.md` na pasta (acrescenta `.md` se faltar; sem nome → `nova-nota.md`), grava o primeiro tópico e seleciona o arquivo novo.
- Apagar (×), reordenar (arrastar) e limpar tudo reescrevem o arquivo.
- **Decidir:** o modal mostra o tópico mais novo em cima; no arquivo, adicionar no início ou no fim?
- Tratar pasta não configurada ou inacessível (**estado ainda não desenhado**).

### SQL Formatter
1. Bind: captura a seleção (ver acima).
2. `format(texto, { language, keywordCase, tabWidth, useTabs })` com as opções salvas.
3. Sucesso: colocar o resultado na área de transferência, simular Ctrl+V e restaurar a área de transferência original.
4. **Erro (SQL inválida): não colar nada**; mostrar uma notificação discreta.

### Janela e app
- Iniciar minimizado na bandeja; opção "Iniciar com o Windows".
- Janela principal: X esconde na bandeja; "Sair" só pelo menu da bandeja.
- Modais: janelas sem moldura, sempre no topo, centralizadas no monitor ativo; Esc fecha.
- Configurações persistidas: binds, pasta de notas, dialeto, palavras-chave, indentação.
- Gravar bind: capturar a combinação real de teclas; validar conflitos (ver pendências).

## Estado (referência do protótipo)
- Janela: `activeTab: 'diff' | 'note' | 'sql'`.
- Binds: `diffBind`, `noteBind`, `sqlBind` + flag de "gravando" para cada um.
- Diff: `textA`, `textB`, `selectedRow`, `appliedRows`.
- Fast Note: `folderPath`, `files[]`, `selectedFile | '__new__'`, `newNoteName`, `draft`, `topics[]`, `dragIndex`, `dragOverIndex`, `showClearConfirm`.
- SQL: `dialect`, `keywordCase`, `indent: '2' | '4' | 'tab'`.

## Design tokens
**Cores**
| Token | Valor |
|---|---|
| Fundo (janelas/modais) | `#0a0a0a` |
| Superfície (barras, cabeçalhos, campos) | `#161616` |
| Painel de código (SQL) | `#111111` |
| Destaque | `#a8393a` |
| Destaque texto/estado | `#c65453` |
| Texto sobre destaque | `#f5eceb` |
| Aba ativa (fundo) | `rgba(168,57,58,0.14)` |
| Segmentado ativo | `rgba(168,57,58,0.22)` |
| Borda de modal | `rgba(168,57,58,0.28)` (Fast Note `0.3`) |
| Borda da janela / divisórias | `rgba(255,255,255,0.08)` / `0.06` |
| Borda de campo / botão fantasma | `rgba(255,255,255,0.1)` / `0.12` |
| Texto forte | `#eef0f5`, `#e8e9ee` |
| Texto | `#c9ccd3`, `#c7cad1` |
| Texto secundário | `#7d8190`, `#7d828f` |
| Rótulo / dica | `#5f6373` |
| Diff pendente | `oklch(0.75 0.15 55)` (fundo 14%) |
| Diff aplicado | `oklch(0.72 0.16 145)` (fundo 16%) |
| Apagar | `oklch(0.68 0.19 25)` |
| Overlay | `rgba(6,7,9,.72)` |

**Tipografia:** Inter (interface) 400/500/600/700 · JetBrains Mono (binds, caminhos, notas, diff, SQL) 400/500/600. Tamanhos usados: 10, 10.5, 11, 11.5, 12, 12.5, 13px. Código: 13px, line-height 1.6.

**Raios:** janela 16 · modais grandes 14 · Fast Note 20 · campos e segmentados 8 · botões 7–9 · abas 6 6 0 0 · itens 5–6 · botão limpar 5.

**Sombras:** janela `0 30px 60px -20px rgba(0,0,0,.6)` · modais grandes `0 40px 80px -20px rgba(0,0,0,.7)` · Fast Note `0 30px 60px -15px rgba(0,0,0,.7)` · popover `0 10px 24px rgba(0,0,0,.5)`.

**Animações:** overlay `opacity 0→1` em 150ms ease-out · modal `opacity 0→1, scale .97→1, translateY 6px→0` em 180ms ease-out.

## Pendências e decisões em aberto
1. **Atalhos padrão conflitam** com programas comuns (Ctrl+Shift+F = busca do VS Code; Ctrl+Shift+N = aba anônima do Chrome / nova pasta no Explorer; Ctrl+Shift+D = Chrome e editores). Sugestão: Ctrl+Alt+D / Ctrl+Alt+N / Ctrl+Alt+F e avisar quando o atalho já estiver em uso.
2. Estados não desenhados: aviso "1º texto capturado", linhas adicionadas/removidas no diff, pasta de notas ausente/inacessível, notificação de erro do SQL, menu de clique direito da bandeja.
3. Ordem dos tópicos no arquivo `.md` (início ou fim).

## Arquivos
- `Blink.dc.html` — protótipo completo e interativo (todas as telas e estados acima).
- `support.js` — runtime necessário para abrir o `Blink.dc.html` no navegador. **Não faz parte do app.**
