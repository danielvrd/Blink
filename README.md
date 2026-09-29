# Blink

App para Windows que fica na bandeja do sistema e oferece três ferramentas acionadas por atalhos
de teclado, de dentro de qualquer programa:

1. **Diff Checker** — compara dois textos selecionados e mostra as diferenças lado a lado.
2. **Fast Note** — um bloco de notas rápido que grava tópicos em arquivos `.md` numa pasta sua.
3. **SQL Formatter** — formata a SQL selecionada e deixa o resultado pronto para colar.

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
atualiza quando você fechar.

## Como usar

### SQL Formatter — `Ctrl + Alt + F`

1. Selecione uma SQL em qualquer programa.
2. Pressione `Ctrl + Alt + F`.
3. Cole onde quiser com `Ctrl + V`.

O texto de origem **não é alterado**: a versão formatada vai para a área de transferência, e uma
notificação confirma. O dialeto, a caixa das palavras-chave e a indentação são escolhidos na aba
SQL Formatter das configurações.

### Diff Checker — `Ctrl + Alt + D`

O atalho funciona em **dois tempos**:

1. Selecione o primeiro texto e pressione `Ctrl + Alt + D` — uma notificação confirma que ele foi
   guardado.
2. Selecione o segundo texto (em qualquer programa) e pressione `Ctrl + Alt + D` de novo — a
   janela de comparação abre.

Na janela, as linhas diferentes aparecem em laranja, e a barra de rolagem à direita mostra onde
cada uma está no texto inteiro — clique numa marca para ir direto até ela. Clique em uma linha da
esquerda e na seta para levá-la para a direita; ela fica verde. **"Copiar texto"** copia o lado direito inteiro, já
com as linhas aplicadas. `Esc` fecha e descarta a comparação.

O primeiro texto guardado vale por **2 minutos**. Depois disso o próximo atalho volta a ser o
primeiro, para você não comparar com algo que capturou e esqueceu.

### Fast Note — `Ctrl + Alt + N`

1. Pressione `Ctrl + Alt + N`. Na primeira vez o Windows pergunta em que pasta guardar as notas.
2. Escreva e pressione `Enter`. `Shift + Enter` quebra a linha dentro do mesmo tópico.
3. Escolha outro arquivo no seletor, ou **"+ Criar nova nota"** para começar um.

Para **editar** um tópico, clique no texto dele: `Enter` ou clicar fora salva, `Esc` desiste.
Apagar (`×`), arrastar para reordenar e a vassoura (limpar tudo) gravam na hora. A lixeira ao lado
da vassoura exclui o arquivo inteiro — ele vai para a Lixeira do Windows, então dá para recuperar.
`Esc` fecha a janela.

#### Tarefas com `/task`

De qualquer arquivo, escreva `/task` seguido da tarefa e pressione `Enter`:

```
/task fazer 9.1 luis
```

O Fast Note troca para o arquivo `task.md` com a tarefa nova em vermelho, na seção **A fazer**.
Clique na bolinha ao lado dela para concluir — ela desce para **Concluídas**, riscada. Clicar de
novo na bolinha volta a tarefa para A fazer.

Com o `task.md` aberto, basta escrever e dar `Enter`, sem o `/task`. Só `/task`, sem texto, abre as
tarefas. O `task.md` aparece sempre primeiro no seletor e usa o formato de checklist do Markdown,
então dá para abri-lo no VS Code ou no GitHub e ver as caixinhas.

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
configurações também maximiza, pelo botão ou com dois cliques na barra de título.

## Menu do ícone na bandeja

Clique com o botão direito no olho, ao lado do relógio:

| Item | O que faz |
|---|---|
| Abrir Blink | mostra a janela de configurações |
| Diff Checker | abre uma comparação de exemplo |
| Fast Note | abre o bloco de notas |
| SQL Formatter | lembra qual é o atalho |
| Procurar atualizações | consulta na hora se há versão nova |
| Iniciar com o Windows | liga ou desliga a inicialização automática |
| Sair | encerra o Blink |

Pelo menu, o Diff Checker e o SQL Formatter não capturam texto: clicar num item de menu tira o
foco do programa onde a seleção estava. Para eles, use os atalhos.

## Atalhos

| Ferramenta | Atalho padrão |
|---|---|
| Diff Checker | `Ctrl + Alt + D` |
| Fast Note | `Ctrl + Alt + N` |
| SQL Formatter | `Ctrl + Alt + F` |

Todos podem ser trocados na janela de configurações, em **"Alterar"**. Se o campo ficar vermelho,
outro programa já usa aquela combinação — escolha outra.

## Onde ficam seus dados

- **Configurações:** `%APPDATA%\Blink\config.json`
- **Notas:** na pasta que você escolheu no Fast Note

Desinstalar o Blink não apaga nenhum dos dois.

## Problemas comuns

**O atalho não faz nada.** Abra a janela do Blink: se o campo do atalho estiver vermelho, outro
programa já usa essa combinação. Troque por outra.

**Funciona em quase tudo, menos num programa específico.** Se esse programa roda como
administrador, o Windows impede que o Blink converse com ele. Rode os dois no mesmo nível.

**Abri o Blink e nada apareceu.** Ele abre escondido na bandeja — procure o olho ao lado do
relógio (às vezes dentro da setinha `^`).

## Contribuindo

O código é aberto para consulta. Contribuições entram por **fork e pull request** e só são
incorporadas depois de revisadas e aprovadas pelo mantenedor. Para rodar o projeto localmente, veja
o [guia de manutenção](MANUTENCAO.md).
