---
name: economia-de-contexto
description: Use ao iniciar uma tarefa de busca ampla, exploracao de codebase grande, leitura de muitos arquivos, ou quando a sessao estiver longa e cara. Decide o que delegar a subagente, qual modelo usar por tipo de tarefa, e o que nunca deve entrar no contexto principal.
---

# Economia de contexto

O custo de uma sessao raramente vem do tamanho da resposta. Vem do **input
reprocessado a cada turno**: instrucoes carregadas sempre, historico acumulado e
saida crua de ferramenta que ficou no contexto para sempre.

Cortar 20% das linhas de codigo geradas e um ganho real. Rotear uma busca ampla
para um modelo barato num subagente e um ganho de ordem de grandeza. As duas somam,
mas so uma delas muda a conta.

## A regra do subagente

**Delegue toda busca cujo resultado util e menor que o material lido.**

Procurar em quarenta arquivos para concluir "a validacao mora em `auth/rules`" e
o caso perfeito: o subagente le os quarenta, voce recebe uma frase. Os quarenta
nunca entram no seu contexto — e continuam fora dele em todos os turnos seguintes.

Delegue:
- varredura ampla por convencao de nomes ou padrao
- "existe algo no repo que ja faz X?"
- leitura de documentacao longa para extrair um fato
- investigacao paralela de hipoteses independentes de um bug

Nao delegue:
- o que voce ja tem em contexto
- edicao de codigo com decisao de design (o subagente nao tem o acordo com o usuario)
- uma unica leitura de arquivo conhecido — o overhead supera o ganho

## Modelo por tipo de tarefa

Rodar o modelo mais forte com esforco maximo em toda tarefa e o maior desperdicio
silencioso que existe. Buscar arquivo nao exige raciocinio profundo.

| Tarefa | Perfil |
|---|---|
| busca, listagem, classificacao, extracao | modelo rapido, esforco baixo |
| implementacao com criterio de aceite claro | modelo intermediario, esforco medio |
| arquitetura, modelagem de dominio, bug sutil | modelo forte, esforco alto |
| revisao adversarial | modelo forte, esforco alto |

Um subagente pode rodar com modelo proprio: e o mecanismo que permite pagar
barato pela exploracao e caro so pela decisao.

## Higiene de contexto

- **Nao releia o que voce acabou de escrever.** A ferramenta de edicao teria
  falhado se a mudanca nao tivesse aplicado.
- **Leia o trecho, nao o arquivo**, quando ja sabe onde esta.
- **Nao repita um fato ja estabelecido** na conversa para "confirmar".
- **Nao narre o que vai fazer antes de fazer.** Faca e relate o resultado.
- Saida enorme de comando: mande para arquivo e leia o recorte que importa.

## Onde mora cada instrucao

Este e o erro de arquitetura mais caro e mais comum:

| Mecanismo | Quando carrega | Use para |
|---|---|---|
| `CLAUDE.md` | **todo turno, toda sessao** | o minimo indispensavel: quem manda e onde achar o resto |
| Skill | so quando relevante | o procedimento detalhado |
| Hook | so no evento | o que nao pode depender do modelo lembrar |

Escrever um procedimento detalhado dentro do `CLAUDE.md` faz voce pagar por ele em
100% dos turnos para usa-lo em 10%. O `CLAUDE.md` e um roteador, nao um manual.
