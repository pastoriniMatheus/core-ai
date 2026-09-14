---
name: entregar-trabalho
description: Use ANTES de abrir qualquer PR, antes de mover um card no tracker, e quando achar que uma tarefa esta pronta. Tambem quando o usuario disser "abre a PR", "move o card", "terminei". Carrega o portao de publicacao - permissao explicita por PR e por card, prova do caminho real, e o contrato de comentario com link.
---

# Entregar trabalho

Publicar nao e o fim do trabalho — e o momento em que ele passa a existir para
outras pessoas. Uma PR aberta fica visivel para o time inteiro sob o nome do
usuario. Um card movido para revisao puxa o tempo de alguem.

Por isso a entrega tem portao, e o portao e o usuario.

---

## Regra zero — o usuario autoriza, sempre

**Nunca abra uma PR e nunca mova um card para revisao sem permissao explicita do
usuario. Por PR e por card. Toda vez.**

Nao vale nenhuma destas:

- "o trabalho esta pronto e a CI esta verde"
- "esta obviamente pronto"
- "o card anterior desta mesma leva foi autorizado"
- "o usuario pediu para atacar o card, logo pediu a PR"

Autorizacao e por item. Um "pode" para uma tarefa nao e um "pode" para a proxima.

**O que fazer quando o trabalho termina:** pare, relate e pergunte.

> Branch empurrada. Verificado: `<o que foi exercitado, com o resultado>`.
> Em aberto: `<o que ficou de fora, ou "nada">`.
> Posso abrir a PR?

E espere. O custo de perguntar e uma mensagem. O custo de nao perguntar e do
usuario, nao seu.

## Regra zero-b — nunca entregue o que voce nao rodou

"Testes unitarios verdes" nao e "testado". Antes de oferecer o trabalho como
pronto, exercite a coisa real: a tela no navegador contra a stack, o endpoint
contra um servidor de verdade, o fluxo de ponta a ponta.

Se o ambiente para isso nao existe, **construa ou diga com estas palavras que
nao foi exercitado**. Nunca deixe uma suite verde ocupar o lugar de um caminho
que ninguem andou — e o tipo de defeito que passa por todo teste unitario e
aparece no primeiro uso.

---

## Antes de pedir a permissao

O pedido so faz sentido se estas cinco coisas ja estao feitas.

**1. Contraprova.** O teste falha sem o fix e passa com ele. Reverta so o fix,
rode, mostre a falha, restaure. Sem a direcao negativa, nao e teste — e decoracao.

**2. As duas direcoes do contrato.** Provar que o campo a mais e rejeitado nao
prova que o campo a menos e detectado. Meia contraprova esconde metade dos defeitos.

**3. Afirmacoes == cobertura.** Se a descricao diz "cobre A e B", tem que existir
teste de B. A redacao e uma promessa verificavel.

**4. Falhas pre-existentes separadas das suas.** Rode a mesma lane no codigo limpo
e compare as contagens. "390 exemplos, 4 falhas — as mesmas quatro na base" e prova.
"Passou aqui" nao e.

**5. O que ficou de fora, dito.** Regressao de performance, bug latente que voce
viu e nao consertou, limite silencioso: diga antes que o revisor encontre. Uma
escolha consciente declarada e respeitada; uma lacuna silenciosa e cobrada.

---

## O contrato do comentario

Quando a permissao vier e o card for movido, o comentario nao e um aviso — e o
que o revisor le antes de olhar o codigo.

- **Link clicavel da PR.** URL inteira, nunca so `#123`: referencia curta entre
  repositorios raramente vira link no tracker.
- **Os SHAs dos commits** que a PR carrega.
- **O que foi exercitado**, com o resultado — e o que nao foi.
- **Referencias cruzadas nomeando o tipo de dependencia**: nao "relacionado a
  X", mas "conflita textualmente com X", "precisam entrar juntos", "encontrado
  ao testar X". E coloque a referencia nos dois cards.

**Uma historia so em todos os artefatos.** Descricao do card, comentario, corpo
da PR e runbook contam a mesma coisa. Quando uma conclusao muda, ela muda nos
quatro — deixar a recomendacao nova no card e a velha no comentario e gafe, e o
revisor encontra.

Antes de dizer "publicado", releia o que foi publicado. Nao o rascunho: o que
esta no ar.

---

## Estados do tracker

| Movimento | Quem faz |
|---|---|
| pegar a tarefa / iniciar | agente, com o trabalho comecando de fato |
| mover para **revisao** | agente, **com permissao explicita**, e so com a PR ja criada e linkada no comentario |
| mover para **concluido** | **somente quem revisa, a mao.** Nunca o agente, nunca o autor |

Fechar um card e o julgamento de quem revisou. O hook `pre-publish-guard`
bloqueia essa transicao **sem escape** — nem com autorizacao do usuario, porque
a autorizacao nao transfere o julgamento.

---

## O que o hook faz por voce

O `pre-publish-guard` intercepta comandos de PR e de tracker e verifica o que da
para verificar sozinho:

- codigo editado sem teste rodado depois → nomeia os arquivos sem prova
- usuario nao falou desde a ultima edicao → ninguem autorizou esta publicacao
- transicao para o estado final → bloqueio sem escape

Ele e a rede, nao o processo. Chegue na permissao por decisao, nao por bloqueio:
um agente que so pergunta porque o hook travou ja errou o tempo do usuario.

Depois de perguntar e receber o sim, reexecute o comando prefixado com o marcador
que o bloqueio indica. **O marcador significa "eu perguntei e o usuario disse
sim"** — usa-lo sem ter perguntado e mentir para a unica salvaguarda que existe.

---

## Configurar para o seu tracker

O nucleo nao sabe qual tracker a equipe usa. Preencha em `.claude/core.json`:

```json
{
  "publish": {
    "trackerPatterns": ["tracker[.]suaempresa[.]com/api", "api[.]linear[.]app"],
    "reviewState": "In Review",
    "doneState": "Done",
    "baseBranch": "develop"
  }
}
```

Sem `trackerPatterns`, o portao continua valendo para PRs — so nao reconhece
comandos de tracker.
