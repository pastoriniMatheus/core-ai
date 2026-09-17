---
description: Mostra a sessão como os hooks a veem — fase, card, prova (o stop-verify vai bloquear?), último bloqueio, base externa. Um quadro, sob demanda.
---

Mostre o painel do núcleo para esta sessão:

```bash
node $AGENT_CORE_ROOT/scripts/painel.mjs --once --projeto "." --no-color
```

Reproduza a saída **como veio**, num bloco de código, sem resumir e sem
comentar linha por linha. O valor do painel é ser lido de relance.

Depois, **uma** frase, só se houver algo a fazer:

- `prova ✗` — o stop-verify vai bloquear o encerramento. Diga qual comando de
  teste rodar. Não rode sem o usuário pedir: o painel informa, não age.
- `externa N vencida(s)` — a consulta à base está barrada até alguém reenviar
  ou podar (`docs/base-externa.md` diz quais).
- `fase não declarada` — se houver trabalho não-trivial em curso, declare a
  fase com a skill `fase`; é o marcador `[fase] NOME` que o painel lê.

Se não houver nada a fazer, não escreva nada além do quadro.

O painel ao vivo, para outra janela: `node $AGENT_CORE_ROOT/scripts/painel.mjs`
(sem `--once`; `q` sai). E a mesma informação numa linha, no rodapé do Claude
Code, é a statusline que o `/core-init` oferece instalar.

<!-- agent-core -->
