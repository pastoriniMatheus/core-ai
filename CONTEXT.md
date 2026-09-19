# Vocabulário do projeto

<!--
  Cada termo aqui substitui uma explicação inteira nas conversas com o agente.
  Regra: um termo entra aqui quando foi preciso explicá-lo duas vezes.
-->

## Termos

- **Núcleo** — este plugin. Hooks + skills + comandos + scripts, genérico: nada
  aqui sabe o nome de cliente, projeto ou máquina.
- **Camada 0 / 1 / 2 / 3** — hooks (executam sempre, bloqueiam) / contexto
  (`CLAUDE.md`, `CONTEXT.md`, grafo) / skills (processo, carregam sob demanda) /
  economia (modelo por tarefa, subagente). "Skill é conselho; hook é controle."
- **Portão de publicação** — o `pre-publish-guard`: PR e movimento de card
  pedem permissão explícita do usuário, por PR e por card, toda vez. O estado
  final do card é **bloqueio sem escape**: quem revisa move à mão.
- **Prova** — um teste rodou **depois** da última edição. `testPatterns` é "o
  agente disse que testou" (apareceu no transcript); `projectCheck` é "o núcleo
  testou" (o hook roda e o exit code é do processo). Sem prova, o `stop-verify`
  não deixa a sessão encerrar.
- **Fase** — EXPLORAR → ALINHAR → IMPLEMENTAR → PROVAR, anunciada com o
  marcador `[fase] NOME` numa linha sozinha. Painel, statusline e checkpoint
  leem esse marcador do transcript.
- **Painel** — o retrato da sessão como os hooks a veem (fase, card, prova,
  último bloqueio, base externa). Uma fonte (o transcript), três superfícies:
  `/core-painel`, `painel.mjs` ao vivo, statusline.
- **Checkpoint** — `.claude/core-state/checkpoint.md`, gravado no `Stop`: onde a
  sessão parou. O `session-start` entrega à sessão seguinte.
- **Base externa** — NotebookLM como índice de busca de material de **terceiro**,
  grande e estável. **O agente consulta; quem alimenta é humano.** Quatro
  portas antes de propor envio: FORA (não versionado), GRANDE (≥ 195 KB),
  REPETIDO (≥ 2 consultas registradas), ESTÁVEL. O que sobe é a **URL**, não o
  arquivo. Fonte vencida **barra** a consulta.
- **Token de autorização** — arquivo em `.claude/core-state/` que **nomeia** o
  que autoriza (a URL liberada, a PR). Um token genérico o agente fabrica; um
  que nomeia o alvo só sai de quem rodou o script.
- **Escape** — `CORE_PUBLISH_OK=1`, `CORE_DEP_OK=1`: prefixo que o usuário
  autoriza para atravessar um portão. O estado final do card não tem escape.
- **Um caminho coberto, outro aberto** — a falha recorrente do projeto (oito
  vezes): a regra vale por Bash e não por MCP, por Edit e não por shell, por
  Bash e não por PowerShell. Toda regra ganha o gêmeo pelo outro caminho, com
  teste.
- **Âncora de drift** — frase que vive duplicada de propósito (skill, comando,
  hook) e que o `docs.test` exige idêntica em todas as cópias.
- **Layout** — as duas formas de instalação: **repo** (clone, `scripts/`) e
  **plugin** (`~/.claude/plugins/cache/agent-core/core/<versão>/`). Todo script
  tem de rodar nos dois; `raizDoNucleo()` acha o núcleo em ambos.
- **`$AGENT_CORE_ROOT`** — variável que aponta para o núcleo; pode estar
  **defasada** (o Claude Code a lê antes dos hooks). O `session-start` anuncia o
  caminho certo; os hooks imprimem o caminho absoluto.
- **Aceitação** — `scripts/aceitacao.mjs`: projeto descartável, instala o
  núcleo, roda sessões reais do `claude -p` e lê o veredito **do transcript**,
  não da resposta do agente. Só sessões da rodada atual contam.
- **Nomes proibidos** — `.claude/nomes-proibidos.local` (não versionado): regex
  de clientes, projetos, máquinas e pessoas que o `docs.test` procura em tudo o
  que é versionado.
