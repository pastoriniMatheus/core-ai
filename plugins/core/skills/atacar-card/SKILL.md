---
name: atacar-card
description: Use quando o usuário mandar trabalhar um card do tracker — "ataque CRM-540", "resolve o EVO-123", "pega essa issue", "conserta isso" com um identificador. Busca o card, conduz as seis fases do trabalho e para no portão de publicação. Funciona com qualquer tracker configurado por /core-tracker.
---

# Atacar um card

Do identificador até a entrega. Seis fases, e um portão no fim.

Nada aqui depende de qual tracker a equipe usa: tudo vem do que `/core-tracker`
configurou. Se não houver tracker configurado, o primeiro comando abaixo diz isso
e o caminho é `/core-tracker` — não adivinhe URL nem peça o card colado antes de
tentar.

```bash
node $AGENT_CORE_ROOT/scripts/tracker.mjs --projeto . card <ID>
```

---

## Fase 0 — Fixe o terreno

**Leia o card inteiro** antes de rodar qualquer comando. Título, descrição,
critérios de aceite, escopo. Se ele oferece opções de solução, elas são
hipóteses, não instruções.

**Confirme a branch base.** O `core.json` declara em `publish.baseBranch`. Não
assuma `main`.

Em monorepo de submódulos, resolva o ponteiro antes de ler qualquer arquivo:
`git -C <sub> grep` lê o **seu** checkout, que pode estar meses atrás do que a
branch fixa.

```bash
SHA=$(git ls-tree <ref> <submodulo> | awk '{print $3}')
git -C <submodulo> show $SHA:<caminho>
```

## Fase 1 — Investigar: medir, nunca deduzir

O card é uma hipótese escrita por alguém que talvez tenha lido o código em vez de
rodar. **Verifique cada afirmação.**

**Nunca conte com comando truncado.** Um `| head -5` numa varredura de inventário
produz "quatro call sites" quando são sete. Use `grep -c`, liste sem `head`, varra
todas as raízes.

**Releia a sua própria medição antes de escrever a frase.** É possível medir uma
coisa e escrever o contrário no mesmo parágrafo. Antes de publicar um "não tem",
volte na tabela e confira.

**Se a premissa do card cair, conserte o card antes de codar.** Atacar uma
premissa errada produz código que resolve o problema errado. Reescreva descrição
e título, diga o que mudou, e só então implemente.

## Fase 2 — Decidir

Quando o card oferece opções, **verifique as duas antes de escolher**. Se as duas
caírem, proponha a terceira com a medição na mesa — dizendo claramente que está
divergindo do card e por quê.

Decisão de produto não se toma em silêncio: proponha com evidência, marque como
pendente, e siga com o que não depende dela. Bloquear tudo esperando resposta é
tão ruim quanto decidir sozinho.

## Fase 3 — Implementar

Diff mínimo, padrão da casa. Não refatore estrutura dentro de um PR de correção.

**Orçamento de comentário.** Em arquivo de CI ou config, comentário é caro:
inglês, curto, só o que o código não consegue dizer. Nada de número de PR, data
ou nome de card no corpo — isso apodrece, e o histórico do git já guarda.

**Releia o arquivo inteiro depois de editar**, não só o seu diff. Um cabeçalho
que contradiz o que está vinte linhas abaixo só aparece para quem lê de cima a
baixo.

## Fase 4 — Provar

**RED e GREEN, na lane que a CI roda.** Sem contraprova não é teste, é decoração.
Reverta só o fix, rode, mostre a falha, restaure.

**Contrato tem duas direções, e prove as duas.** Provar que o campo a mais é
rejeitado não prova que o campo a menos é detectado. Meia contraprova esconde
metade dos defeitos.

**Confirme que o verde é do commit atual.** Um check verde pode ser de um push
anterior — compare o SHA do run com o HEAD da branch antes de citá-lo como prova.

**Exercite o caminho real**, não só o unitário. Quando não der, escreva qual
parte não foi exercitada, com essas palavras.

**Baseline das falhas pré-existentes.** Rode a mesma lane no código limpo e
compare contagens. "390 exemplos, 4 falhas — as mesmas quatro na base" é prova;
"passou aqui" não é.

## Fase 5 — Publicar, com o portão

**Pare e peça permissão.** Antes da PR e antes de mover o card. Toda vez, por
card. Detalhe na skill `entregar-trabalho`.

O hook `pre-publish-guard` intercepta os dois — mas chegue na permissão por
decisão, não por bloqueio: um agente que só pergunta porque travou já gastou o
tempo do usuário.

Comentar no card **não** é publicar, e não precisa de autorização:

```bash
echo "texto do comentário" | node $AGENT_CORE_ROOT/scripts/tracker.mjs --projeto . comment <ID> -
```

Mover o card, sim:

```bash
node $AGENT_CORE_ROOT/scripts/tracker.mjs --projeto . move <ID> "<estado de revisão>"
```

O estado final (`Done`, `Concluído`) é **bloqueio sem escape** — quem revisa move
à mão, depois de olhar. Nem com autorização do usuário o agente faz isso.

**Uma história só em todos os artefatos.** Descrição do card, comentário, corpo
da PR e runbook contam a mesma coisa. Quando uma conclusão muda, muda nos quatro.

## Fase 6 — Depois do review, aprenda

Se o revisor corrigiu algo, **leia os commits dele** antes de comemorar:

```bash
git log --format="%h %an %s" origin/<base> -12
git show <sha>
```

Se ele corrigiu uma afirmação sua, corrija nos artefatos que você publicou — o
comentário do card não se corrige sozinho porque o PR foi mergeado.

E traga a lição de volta para uma skill (veja `extrair-skill`): é o que impede a
terceira ocorrência.

---

## Catálogo de gafes

As que custaram caro, e o antídoto de cada uma.

| Gafe | Antídoto |
|---|---|
| Medir no checkout local em vez do ponteiro fixado | resolver com `git ls-tree` e ler pelo SHA |
| `head` numa varredura de inventário | `grep -c`, lista completa, todas as raízes |
| Contradizer a própria medição | reler a tabela antes de escrever o "não tem" |
| Arquivo internamente contraditório | reler o arquivo inteiro, não só o diff |
| Meia contraprova | provar os dois sentidos do contrato |
| Comentário demais em arquivo de CI | inglês, curto, sem número de PR nem data |
| Artefatos divergentes | mudou uma conclusão, muda nos quatro |
| Card publicado com premissa não medida | medir antes de criar |
| Declarar pronto sem exercitar o caminho real | suíte verde não é "testado" |

## Se o tracker não estiver configurado

Diga isso em uma linha e ofereça `/core-tracker`. Não peça ao usuário para colar
o card como primeira opção — configurar leva um minuto e resolve para sempre.

<!-- agent-core -->
