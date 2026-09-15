---
description: Diagnostica a instalacao do nucleo neste projeto - hooks, plugin, permissoes, higiene do repo.
---

Rode o diagnostico do nucleo e interprete o resultado para o usuario.

1. Localize o repositorio do nucleo. Tente, em ordem: `.claude/core/scripts/doctor.mjs`,
   o caminho em `agentCoreRoot` de `.claude/core.json`, ou pergunte ao usuario.
2. Execute `node $AGENT_CORE_ROOT/scripts/doctor.mjs "."`.
3. Resuma em portugues: o que esta ok, o que e aviso, o que e erro.
4. Para cada erro ou aviso, ofereca a correcao concreta. Nao aplique nada sem
   confirmacao — configuracao de agente e compartilhada com a equipe.

Se o diagnostico apontar `permissions.allow` curto, explique que e o ajuste de
maior retorno e menor risco: cada comando rotineiro que nao esta na lista vira
uma interrupcao no fluxo.
