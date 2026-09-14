# Ferramentas externas

O nucleo **nao instala** nada disto. Ele e a arquitetura que recebe essas
ferramentas: define onde cada regra mora, o que vira hook e quem manda no
processo. As ferramentas sao instalacao separada, e opcional — o nucleo funciona
sozinho.

Comandos verificados nos repositorios em 2026-09-13. Confira o README de cada um
antes de rodar: projeto de terceiro muda.

---

## Ponytail — escrever o minimo de codigo

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Modos `lite` / `full` / `ultra`, trocados com `/ponytail <modo>` ou pela variavel
`PONYTAIL_DEFAULT_MODE`. Comandos: `/ponytail-review` (procura excesso no diff),
`/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`.

**Relacao com o nucleo:** a escada da preguica ja esta embutida no
`pre-bash-guard` e na skill `fase`, mas ali ela so atua no momento de adicionar
dependencia. O Ponytail atua durante toda a escrita. Os dois somam.

**Numeros que o projeto publica** (12 tarefas, Haiku 4.5, n=4): −54% linhas,
−22% tokens, −20% custo, −27% tempo. Medidos com o Ponytail **sozinho** — nao
empilhado com outras ferramentas. Por isso o `baseline.mjs` existe.

---

## mattpocock/skills — processo de engenharia

```
npx skills@latest add mattpocock/skills
```

Depois, uma vez por repositorio: `/setup-matt-pocock-skills`.

Traz `grill-me` e `grill-with-docs` (entrevista ate exaurir duvidas, alimenta o
`CONTEXT.md`), `to-spec`, `to-tickets`, `wayfinder`, `triage`, `implement`,
`tdd`, `code-review`, `diagnosing-bugs`, `improve-codebase-architecture`,
`codebase-design`, `handoff`.

**Atencao — uma autoridade de processo por vez.** Estas skills se sobrepoem
fortemente com o plugin `superpowers`: `grill-me` com `brainstorming`, `tdd` com
`test-driven-development`, `diagnosing-bugs` com `systematic-debugging`,
`to-tickets` com `writing-plans`. Rodar os dois juntos faz o agente oscilar entre
processos incompativeis — o oposto do que se quer.

Escolha uma e desabilite a outra. O unico item do `superpowers` sem equivalente
no Pocock, `verification-before-completion`, ja esta portado para o hook
`stop-verify` do nucleo.

---

## Graphify — grafo de codigo

```
uv tool install graphifyy      # o pacote tem dois "y"; o comando e `graphify`
graphify install --project     # registra a skill no repo, para a equipe
graphify hook install          # rebuild em post-commit e post-checkout
```

Uso: `graphify .` constroi, `graphify query "..."`, `graphify path "A" "B"`,
`graphify explain "X"`. Gera `graphify-out/` com `graph.json`, `GRAPH_REPORT.md`
e `graph.html`.

**Obrigatorio:** `graphify hook install`. Sem reconstrucao automatica o grafo
envelhece e passa a produzir resposta confiante e errada — o erro mais caro que
existe. O `pre-bash-guard` avisa quando isso acontece, mas e paliativo.

**Obrigatorio:** `graphify-out/` no `.gitignore`. O instalador do nucleo ja
acrescenta.

**Privacidade:** codigo e parseado localmente via tree-sitter e nao sai da
maquina. **Documentos e PDFs vao para o LLM configurado.** Em projeto com
contrato de cliente, use `--code-only`.

---

## notebooklm-py — base de conhecimento externa

```
uv tool install "notebooklm-py[browser]"
notebooklm login
notebooklm auth check --test
```

Oferece CLI, API Python e servidor MCP.

**Mantenha fora do caminho critico.** E biblioteca nao-oficial sobre API nao
documentada do Google, com login por cookie ou Playwright e limite de taxa; o
proprio README avisa que pode quebrar sem aviso.

Consequencias de coloca-la como fonte de verdade de uma equipe: ponto unico de
falha, credencial compartilhada, e documento interno saindo para uma conta
pessoal do Google.

**Uso recomendado:** pesquisa individual e assincrona. O que sair dela e
destilado em Markdown e **commitado no repositorio** — e o repositorio que o
agente le. A fonte de verdade da equipe e sempre o repo.

---

## Ordem de instalacao

Instalar as quatro de uma vez e garantir que ninguem saiba qual mudanca causou o
que. A ordem do rollout, e o baseline antes de cada passo, estao no `README.md`.
