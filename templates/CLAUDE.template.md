# Diretrizes do agente

<!--
  Este arquivo entra no prompt em TODO turno de TODA sessao.
  Cada linha aqui e paga sempre, para ser util as vezes.

  Regra: aqui fica so o que vale em quase todo turno. Procedimento detalhado
  mora em skill (carrega sob demanda). Regra que nao pode falhar mora em hook
  (executa sempre). Se uma secao aqui passar de um paragrafo, ela pertence a
  uma skill.

  Alvo: 40 linhas. Se passar de 60, algo esta no lugar errado.
-->

## Precedencia

Quando houver conflito, obedeca nesta ordem:

1. **O usuario**, nesta conversa
2. **Hooks** — o que eles bloqueiam nao se contorna; corrija a causa
3. **Este arquivo**
4. **Skills** — processo e procedimento
5. Comportamento padrao

Nunca ha duas autoridades de processo ativas ao mesmo tempo. Se duas skills
mandam conduzir o trabalho de formas diferentes, pare e pergunte qual vale.

## Fases

Todo trabalho nao-trivial passa por **EXPLORAR -> ALINHAR -> IMPLEMENTAR -> PROVAR**.
Cada fase tem seu regime de ferramenta e verbosidade. Anuncie a fase quando mudar.
Detalhe na skill `fase`.

Pule ALINHAR quando o pedido for pequeno e inequivoco. Entrevistar alguem sobre
uma correcao trivial e pior do que nao ter processo.

## Escrever codigo

Suba a escada e pare no primeiro degrau que resolver: **existe? ja tem no repo?
stdlib? plataforma? dependencia instalada? uma linha?**

Preguicoso nao e negligente: validacao de fronteira de confianca, perda de dados,
seguranca e acessibilidade nunca entram na conta do corte.

## Encontrar codigo

Grafo para **relacao** (quem chama, o que quebra). Busca textual para **texto**.
Leitura direta para **conteudo**. Detalhe na skill `mapear-codigo`.

## Contexto e custo

Busca ampla vai para subagente: ele le muito e devolve a conclusao. Detalhe na
skill `economia-de-contexto`.

## Publicar

**Nunca abra uma PR e nunca mova um card sem permissao explicita do usuario.
Por PR e por card, toda vez.** "Esta pronto e verde" nao e autorizacao; o card
anterior autorizado nao autoriza este.

Nunca entregue o que voce nao rodou: suite verde nao e caminho exercitado.

Estado final do card e movido **a mao por quem revisa** — nunca pelo agente.

Detalhe na skill `entregar-trabalho`.

## Quando aprender algo

Correcao do usuario, convencao nao escrita, armadilha que custou tempo: vire
skill. Detalhe em `extrair-skill`.

<!--
  ABAIXO: especifico deste projeto. Comandos reais, nao filosofia.
  Preencha e apague o que nao usar.
-->

## Este projeto

- **Rodar:** `<comando>`
- **Testar:** `<comando>`
- **Lint/typecheck:** `<comando>`
- **Vocabulario do dominio:** `CONTEXT.md`
- **Tracker:** `<nome e URL>`  ·  estados: `<em progresso>` -> `<revisao>` -> `<final>`
- **Base da PR:** `<branch>`
- **Nunca:** `<a armadilha que ja pegou o time>`
