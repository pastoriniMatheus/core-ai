---
name: ci-local
description: Use na primeira vez que trabalhar num projeto, quando o usuario pedir "cria o CI", "monta os testes", quando um comando de teste falhar por ferramenta ausente, ou quando nao existir um jeito unico de verificar o projeto. Monta um verificador local que roda na maquina, sem depender de CI externo.
---

# CI local

Esperar o CI remoto para saber se o trabalho presta custa de cinco a vinte
minutos por tentativa, e o resultado chega quando o contexto ja esfriou. Pior:
quando o CI e a unica verificacao que existe, o agente entrega sem ter rodado
nada e descobre o erro na frente do time.

O verificador local resolve os dois: o mesmo comando roda em segundos na
maquina, antes de qualquer coisa sair.

## O que construir

**Um comando que verifica o projeto inteiro.** Um so. Se verificar o projeto
exige lembrar de quatro comandos em ordem, alguem vai esquecer o terceiro.

Ele encadeia, nesta ordem — do mais barato ao mais caro, parando no primeiro
que falhar:

1. **formato** — o mais rapido, e o que mais suja diff
2. **build / typecheck** — pega o que o verificador por arquivo nao alcanca
3. **lint** — o que compila mas nao deveria existir
4. **teste** — a prova

## Procedimento

### 1. Descubra antes de perguntar

```bash
node <raiz do nucleo>/scripts/preflight.mjs "<projeto>"
```

O preflight detecta a stack pelos manifestos (`go.mod`, `package.json`,
`Gemfile`, `pyproject.toml`, `Cargo.toml`), confere quais binarios estao
instalados e **sugere o conteudo do `core.json`** pronto.

### 2. Instale o que falta, com permissao

Se o preflight listar ferramenta obrigatoria ausente, **mostre ao usuario e
pergunte antes de instalar**. Instalacao global muda a maquina dele, nao o
projeto — nao e uma decisao sua.

Ferramenta opcional ausente nao bloqueia: relate e siga.

### 3. Escreva o runner

Um script na raiz (`scripts/check.sh`, `Makefile`, ou o gerenciador de tarefas
que o projeto ja usa — **siga o que existe, nao invente um novo**).

Requisitos:

- **Para no primeiro erro** (`set -e` ou equivalente). Um runner que segue depois
  de falhar esconde a causa atras de vinte erros derivados.
- **Diz o que esta rodando** antes de cada etapa. Quando quebra, o usuario
  precisa saber em qual etapa.
- **Roda em qualquer maquina do time.** Sem caminho absoluto, sem sua pasta pessoal.
- **Aceita um alvo opcional** quando a suite for lenta: verificar um pacote
  durante o trabalho e a suite inteira antes de publicar.

### 4. Ligue no núcleo

No `.claude/core.json`:

```json
{
  "stopVerify": {
    "projectCheck": ["./scripts/check.sh"],
    "testPatterns": ["scripts/check.sh", "go test"]
  }
}
```

`projectCheck` roda o verificador **uma vez antes de encerrar a sessao**.
`testPatterns` ensina o núcleo a reconhecer que o comando conta como prova —
sem isso o `stop-verify` bloqueia mesmo depois de você ter verificado.

### 5. Prove que ele pega erro

Um verificador que nunca reprovou nada e decoracao. Quebre o codigo de
proposito, rode, veja falhar, desfaça.

Sem essa contraprova voce nao sabe se montou um verificador ou um `echo ok`.

## Se houver CI remoto

O local **não substitui** o remoto — ele roda antes. O CI continua sendo a
palavra final porque roda em ambiente limpo, e pega o que a sua maquina
esconde: dependencia instalada globalmente, arquivo nao commitado, variavel de
ambiente que so voce tem.

Mantenha os dois executando **as mesmas etapas**. Um local mais frouxo que o
remoto da falsa confianca; mais rigido, trava trabalho legitimo. Quando o
remoto mudar, mude o local no mesmo commit.

## Armadilhas

**Teste que passa sem infraestrutura.** Se a suite precisa de banco ou fila e o
adaptador cai num stub quando eles nao estao no ar, os testes passam **falsamente**.
Faca o runner falhar com mensagem clara quando a dependencia nao estiver de pe —
nunca deixe ele degradar para verde.

**Separar falha sua de falha pre-existente.** Antes de culpar sua mudanca, rode
o mesmo comando no codigo limpo e compare. "390 exemplos, 4 falhas — as mesmas
quatro na base" e informacao; "quebrou" nao e.

**Runner lento demais vira runner desligado.** Se passar de um ou dois minutos,
divida: um alvo rapido para o ciclo de trabalho e o completo antes de publicar.
