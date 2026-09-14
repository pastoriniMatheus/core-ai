# agent-core

Nucleo de diretrizes de agente para Claude Code. Base generica; cada projeto
adiciona sua camada por cima, sem misturar.

## Documentacao

| | |
|---|---|
| [`docs/MAQUINA-NOVA.md`](docs/MAQUINA-NOVA.md) | **Comece aqui numa maquina do zero** — pre-requisitos ate a primeira guarda funcionando |
| [`docs/manual.html`](docs/manual.html) | O manual completo, para abrir no navegador ou publicar para a equipe |
| [`docs/PASSO-A-PASSO.md`](docs/PASSO-A-PASSO.md) | Como instalar e provar que funciona |
| [`docs/COMECAR.md`](docs/COMECAR.md) | Os testes de aceitacao, um a um |
| [`docs/FERRAMENTAS.md`](docs/FERRAMENTAS.md) | Ponytail, mattpocock, Graphify, notebooklm — e a armadilha de cada uma |

O manual e gerado com `python scripts/atualizar-manual.py`, que **le os numeros da
suite em vez de aceita-los digitados**: se algum teste falhar, ele se recusa a
atualizar. Um numero errado no documento que a equipe le vale menos que nenhum.

## O problema que resolve

Diretrizes de agente costumam ser escritas como um texto grande no `CLAUDE.md`
mandando o modelo se comportar. Isso falha por tres motivos:

1. **O `CLAUDE.md` entra no prompt em todo turno.** Procedimento detalhado ali e
   pago sempre para ser util as vezes.
2. **Instrucao e probabilistica.** O modelo obedece quase sempre. "Quase" e onde
   moram os erros que chegam em producao.
3. **Duas autoridades de processo se anulam.** Quando um texto manda entrevistar
   ate exaurir duvidas e outro manda entregar e calar a boca, o agente oscila.

O nucleo organiza as diretrizes por **mecanismo de execucao**, nao por ferramenta:

| Camada | Mecanismo | Ataca |
|---|---|---|
| 0 | hooks + permissoes | erro |
| 1 | `CLAUDE.md` enxuto, `CONTEXT.md`, grafo | alucinacao |
| 2 | uma autoridade de processo + skills | desalinhamento |
| 3 | roteamento de modelo, subagentes | custo |

Regra: **tudo que puder descer de camada, desce.** Se vira hook, nao vira instrucao.

## Camada 0 — o que executa sozinho

| Hook | Evento | O que garante |
|---|---|---|
| `post-edit-verify` | `Edit` `Write` `MultiEdit` | Arquivo editado passa pelo linter da linguagem. Reprovou, o erro volta ao agente |
| `pre-bash-guard` | `Bash` | Dependencia nova exige subir a escada antes. Grafo desatualizado avisa antes de mentir |
| `stop-verify` | `Stop` | Codigo alterado sem teste rodado depois nao encerra a sessao |
| `pre-publish-guard` | `Bash` e `mcp__*` | PR ou card sem permissao explicita do usuario nao passa — **pelos dois caminhos**. Estado final do card e bloqueio **sem escape** |
| `session-start` | `SessionStart` | Projeto sem configuracao avisa na primeira sessao, em vez de rodar meio-mudo em silencio |

Autodeteccao por linguagem: Ruby, JS/TS, Python, Go, PHP, Shell, Swift, Kotlin,
JSON e YAML. Ferramenta ausente = hook silencioso, nunca hook quebrado — a
existencia do binario e checada ANTES de rodar, porque um comando ausente sob
shell nao produz ENOENT e seria confundido com "o linter reprovou".

**Rust, Java, C# e Scala nao tem verificacao por arquivo confiavel** (o compilador
precisa do projeto inteiro). Elas sao cobertas no outro extremo: `stopVerify.projectCheck`
roda o build/typecheck completo UMA vez, antes de encerrar a sessao.

## Skills

| Skill | Para que |
|---|---|
| `fase` | Maquina EXPLORAR -> ALINHAR -> IMPLEMENTAR -> PROVAR. Elimina o conflito entre regimes |
| `mapear-codigo` | Grafo para relacao, busca para texto, leitura para conteudo. Evita o mapa velho |
| `economia-de-contexto` | O que delegar a subagente, qual modelo por tarefa, onde cada instrucao mora |
| `extrair-skill` | Transforma conhecimento do time em skill versionada |
| `entregar-trabalho` | O contrato de entrega: permissao por PR e por card, prova do caminho real, comentario com link |
| `ci-local` | Monta um verificador que roda na maquina em segundos, em vez de esperar CI externo |

## Comandos

`/fase` `/baseline` `/core-doctor` `/core-setup`

## Instalar num projeto

**Primeira vez? Siga [`docs/COMECAR.md`](docs/COMECAR.md)** — dez minutos, com os
quatro testes de aceitacao que provam que cada guarda esta ligada.

```bash
node scripts/preflight.mjs /caminho/do/projeto   # o que a maquina precisa
node scripts/install.mjs   /caminho/do/projeto   # modo local: funciona na hora
node scripts/doctor.mjs    /caminho/do/projeto   # confirma que os hooks ligaram
```

Dois modos de instalacao:

| Modo | Comando | Quando |
|---|---|---|
| **local** (padrao) | `install.mjs <projeto>` | Testar e usar na sua maquina. Os hooks apontam para o caminho deste repo — funciona sem publicar nada |
| **marketplace** | `install.mjs <projeto> --marketplace --repo ORG/agent-core` | Distribuir para a equipe. Exige o repositorio publicado |

Depois de instalar, abra o projeto no Claude Code **interativamente uma vez** e
aceite o dialogo de confianca: sem isso as 48 regras de `permissions.allow` sao
ignoradas. Os hooks rodam de qualquer forma.

Na primeira sessao dentro do projeto, o hook `session-start` detecta o que ainda
nao foi configurado e pede `/core-setup` — que pergunta tracker, credencial,
comando de teste e branch base.

**Credencial nunca entra no `.claude/core.json`**, que e versionado. O `core.json`
guarda o *nome* da variavel de ambiente; o valor vai para `.claude/settings.local.json`,
que o instalador ja acrescenta ao `.gitignore`.

Aditivo: mescla `permissions.allow`, nunca sobrescreve configuracao existente sem
`--force`. Rodar duas vezes nao duplica nada.

## Portao de publicacao: Bash e MCP

Um hook so de `Bash` deixaria passar livre qualquer tracker acessado por **MCP** —
que costuma ser o caminho preferido. O guard inspeciona os dois:

| Caminho | O que e inspecionado | Como autorizar |
|---|---|---|
| Bash | o comando | prefixo `CORE_PUBLISH_OK=1` |
| MCP | `<nome da ferramenta> <argumentos>` | token one-shot em `.claude/core-state/publish-ok` |

Numa chamada MCP nao ha onde prefixar um marcador: o schema da ferramenta e fixo.
Por isso a autorizacao vira um arquivo criado logo antes, **consumido no uso** e
valido por poucos minutos — uma autorizacao, uma publicacao, que e exatamente a
semantica de "por PR e por card".

O bloqueio do estado final vale nos dois caminhos, e nos dois **sem escape**.

## Primeira vez num projeto

```bash
node scripts/preflight.mjs /caminho/do/projeto
```

Detecta a stack pelos manifestos (`go.mod`, `package.json`, `Gemfile`,
`pyproject.toml`, `Cargo.toml`), confere quais binarios estao instalados, separa
o que **bloqueia** do que e apenas desejavel, e imprime o `core.json` sugerido
ja pronto.

Evita a classe de erro mais irritante que existe: o agente tenta rodar a suite,
o binario nao existe, e ele depura o projeto por vinte minutos quando o problema
era a maquina.

A skill `ci-local` usa isso para montar um verificador unico do projeto — um
comando que encadeia formato, build, lint e teste, parando no primeiro que falhar.

## Medir

```bash
node scripts/baseline.mjs --days 7 --save antes    # ANTES de mudar qualquer coisa
node scripts/baseline.mjs --days 7 --compare antes # depois
```

Sem numero de partida, nao ha como saber se uma mudanca ajudou — so a sensacao
de que ajudou.

## Testar

```bash
node tests/hooks.test.mjs        # unidade: 73 casos, segundos
node scripts/aceitacao.mjs       # ponta a ponta: cria projeto, instala, roda sessoes reais
node scripts/aceitacao.mjs --offline   # so instalacao e guardas (rapido)
```

**`aceitacao.mjs` e o teste que importa.** Ele cria um projeto descartavel,
instala o nucleo, e pede ao agente exatamente o que cada guarda deveria barrar —
numa sessao de verdade do Claude Code. O veredito nao sai da resposta do agente
(ele pode recusar por outro motivo) e sim da **contagem de bloqueios registrados
no transcript**. E a diferenca entre "parece que funcionou" e "funcionou".

Unica dependencia: Node 18+, que ja vem com o Claude Code. O projeto de teste e
JavaScript puro com `node --test` — nao exige Go, Ruby nem Python.

Hook errado e pior que hook nenhum: bloqueia trabalho legitimo e o time desliga
tudo na primeira semana.

## Adicionar uma camada de projeto

Um plugin novo em `plugins/<nome>/`, declarado no `.claude-plugin/marketplace.json`.
O projeto habilita o que precisa:

```json
{ "enabledPlugins": { "core@agent-core": true, "<nome>@agent-core": true } }
```

Um projeto que nao habilita uma camada nao enxerga as skills dela. Isolamento por
construcao, nao por disciplina.

## Ferramentas externas

O nucleo **nao instala** Ponytail, mattpocock/skills, Graphify nem notebooklm-py.
Ele e a arquitetura que as recebe — e funciona sozinho sem nenhuma delas.
Comandos de instalacao e as armadilhas de cada uma em [`docs/FERRAMENTAS.md`](docs/FERRAMENTAS.md).

O `doctor.mjs` relata quais estao presentes, e acusa erro se **duas autoridades
de processo** estiverem habilitadas ao mesmo tempo.

## Requisitos

Node 18+ — ja presente em qualquer maquina que rode o Claude Code. Os hooks nao
tem nenhuma outra dependencia.
