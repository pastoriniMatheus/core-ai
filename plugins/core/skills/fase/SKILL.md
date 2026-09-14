---
name: fase
description: Use no inicio de qualquer trabalho nao-trivial e sempre que o usuario disser "que fase estamos", "muda de fase" ou pedir para acelerar/aprofundar. Declara em qual das quatro fases o trabalho esta (EXPLORAR, ALINHAR, IMPLEMENTAR, PROVAR) e fixa o regime de ferramentas, verbosidade e modelo daquela fase.
---

# Maquina de fases

Existe uma contradicao classica em diretrizes de agente: uma regra manda entrevistar
o usuario ate exaurir duvidas, outra manda entregar o codigo e calar a boca. As duas
estao certas — em momentos diferentes. Quando convivem no mesmo texto, o agente
oscila entre elas e a assertividade despenca.

Fases resolvem isso: os regimes nunca coexistem porque sao estados distintos.

## As quatro fases

| Fase | Objetivo | Ferramenta dominante | Verbosidade | Custo alvo |
|---|---|---|---|---|
| **EXPLORAR** | Descobrir onde o trabalho acontece | grafo de codigo, subagente de busca | so a conclusao | baixo |
| **ALINHAR** | Eliminar ambiguidade antes de codar | entrevista, modelagem de dominio | alta — perguntas incisivas | alto |
| **IMPLEMENTAR** | Escrever o minimo que resolve | edicao, testes | minima | medio |
| **PROVAR** | Mostrar que funciona | suite, revisao | so o que falhou | baixo |

## Como conduzir cada fase

### EXPLORAR
Objetivo: saber quais arquivos importam, sem sujar o contexto principal.

- Delegue a busca ampla a um subagente. Ele le dezenas de arquivos e devolve
  um paragrafo; a leitura crua nunca entra no seu contexto.
- Use o grafo para impacto e dependencia; use busca textual para localizar literal.
  Ver a skill `mapear-codigo`.
- **Nao escreva codigo nesta fase.** Nem "so um ajuste".
- Saia da fase quando puder nomear os arquivos que serao tocados.

### ALINHAR
Objetivo: que nao reste nenhuma interpretacao dupla do pedido.

- Uma pergunta por vez, sempre a que mais reduz incerteza.
- Pergunte sobre caso de borda, comportamento em erro e nomenclatura — nao sobre
  preferencia de estilo.
- Registre o vocabulario acordado no `CONTEXT.md` do projeto.
- **Pule esta fase** quando o pedido for pequeno e inequivoco. Entrevistar alguem
  sobre uma correcao de typo destroi confianca na ferramenta.
- Saia da fase quando conseguir escrever o criterio de aceite em uma frase.

### IMPLEMENTAR
Objetivo: o minimo de codigo que satisfaz o criterio de aceite.

A escada, em ordem — pare no primeiro degrau que resolver:

1. **YAGNI** — isso precisa existir agora?
2. **Repo** — ja existe algo no projeto que resolve?
3. **Stdlib** — a biblioteca padrao resolve?
4. **Plataforma** — um recurso nativo resolve?
5. **Instalado** — uma dependencia ja presente resolve?
6. **Uma linha** — da para escrever em uma linha?
7. So entao: a solucao minima viavel.

Preguicoso nao e negligente: validacao de fronteira de confianca, tratamento de
perda de dados, seguranca e acessibilidade **nunca** entram na conta do corte.

Prosa minima. Entregue o codigo e a frase que explica a decisao nao obvia.

### PROVAR
Objetivo: evidencia, nao afirmacao.

- Rode a suite e mostre a saida.
- Se nao existe teste que cubra a mudanca, **diga isso** em vez de declarar pronto.
- O hook de Stop bloqueia o encerramento quando houve edicao sem prova. Ele e a
  rede de seguranca, nao o processo: chegue na prova por decisao, nao por bloqueio.

## Transicoes

O fluxo normal e EXPLORAR -> ALINHAR -> IMPLEMENTAR -> PROVAR, mas voltar e comum
e saudavel. Descobriu na implementacao que o requisito era ambiguo? Volte para
ALINHAR. Nao tente adivinhar e seguir.

Anuncie a fase quando ela mudar, em uma linha. O usuario precisa saber se voce
esta perguntando ou executando.
