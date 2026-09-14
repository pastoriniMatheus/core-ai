---
name: extrair-skill
description: Use quando o usuario explicar um procedimento do time, corrigir voce sobre uma convencao do projeto, ou quando voce errar por nao saber algo que so este time sabe. Tambem quando pedirem "vira isso numa skill". Transforma conhecimento tacito em skill versionada.
---

# Extrair conhecimento do time em skill

Disciplina importada — escrever pouco codigo, testar antes, mapear dependencia — e
generica por construcao: serve a qualquer projeto porque nao sabe nada sobre o seu.

O maior ganho de assertividade num projeto grande vem do oposto: do que **so o seu
time sabe**. Como rodar de verdade. Por que aquele modulo e daquele jeito. Qual
comando de deploy mente sobre ter dado certo. Onde esta a armadilha que pegou
todo mundo uma vez.

Nenhuma ferramenta de prateleira traz isso. Voce extrai.

## Quando extrair

Estes momentos sao sinal, e passam despercebidos:

- O usuario corrige voce sobre uma convencao que nao esta escrita em lugar nenhum
- Voce descobre, sofrendo, por que o caminho obvio nao funciona
- Alguem explica um procedimento com mais de tres passos
- Voce comete o mesmo erro que ja cometeu em outra sessao
- O usuario diz "sempre que for X, faca Y"

Se custou tempo descobrir, vai custar de novo. Extraia.

## O que faz uma skill boa

**Especifica.** "Rode os testes" nao ajuda ninguem. "A suite de integracao exige
o Postgres de teste no ar; sem ele os testes passam falsamente porque o adapter
cai num stub" — isso ajuda.

**Acionavel.** Comando exato, caminho exato, ordem exata. Nao a filosofia.

**Com a armadilha nomeada.** A parte mais valiosa e o que da errado e por que.
Registre o erro concreto que aconteceu, nao a versao abstrata dele.

**Com criterio de disparo.** O campo `description` e o que decide se a skill vai
ser lembrada. Escreva quando usar, com as palavras que o usuario usaria — nao um
resumo do conteudo.

## Formato

Um diretorio por skill, com `SKILL.md`:

```
---
name: nome-em-kebab-case
description: Use quando <gatilho concreto>. <O que a skill faz em uma frase.>
---

# Titulo

<Contexto: por que isso existe, qual erro evita.>

## Procedimento
1. Passo com comando exato
2. ...

## Armadilhas
- <O que ja deu errado e por que.>
```

## Onde colocar

| Alcance | Local |
|---|---|
| So voce, todos os projetos | diretorio de skills do usuario |
| Esta equipe, este projeto | `.claude/skills/` do repo, versionado |
| Varios projetos da mesma equipe | plugin de camada no marketplace do time |

Regra que evita bagunca: se a skill menciona um sistema especifico pelo nome, ela
**nao** pertence ao nucleo generico. Nucleo e o que vale para qualquer projeto;
camada e o que vale para um.

## Depois de escrever

Exercite a skill numa tarefa real antes de considerar pronta. Skill nunca testada
costuma ter um passo faltando — justamente o que era obvio demais para quem escreveu.
