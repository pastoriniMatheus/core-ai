---
description: Mede tokens, turnos e tempo das sessoes recentes deste projeto. Use antes e depois de mudar a configuracao.
argument-hint: [--days N] [--save nome] [--compare nome]
---

Rode a medicao de sessoes e interprete os numeros.

Execute `node {{CORE_ROOT}}/scripts/baseline.mjs $ARGUMENTS` a partir da raiz
do projeto.

Ao apresentar o resultado:

- **Compare cache lido com output.** Em quase todo projeto o input reprocessado e
  ordens de grandeza maior que a saida gerada. Isso define onde a economia real esta:
  na arquitetura de contexto, nao no tamanho da resposta.
- **Turnos por sessao** e o melhor indicador de assertividade. Menos turnos para o
  mesmo trabalho significa menos ida e volta corrigindo rumo.
- **Nao celebre queda de output isolada.** Resposta mais curta sem queda de turnos
  pode ser so verbosidade menor, nao acerto maior.

Se o usuario esta comecando agora, oriente a salvar um retrato (`--save antes`)
**antes** de instalar qualquer coisa. Sem numero de partida nao ha como saber se
uma mudanca ajudou ou atrapalhou.
