# agent-core

Diretrizes de agente para Claude Code organizadas por **mecanismo de execução**,
não por ferramenta: tudo que pode virar hook vira hook, e só o que sobra vira
instrução no prompt.

Skills são conselho — o modelo pode ignorar. Hooks são controle.

---

# Instalação

## Dois comandos, uma vez por máquina

```bash
claude plugin marketplace add https://github.com/pastoriniMatheus/core-ai.git
claude plugin install core@agent-core
```

> **Use a URL completa.** Com o atalho `pastoriniMatheus/core-ai`, o Claude Code
> clona por SSH (`git@github.com:…`) e falha em máquina sem chave configurada —
> o caso de toda instalação nova. Com `https://`, ele usa a credencial do `gh`.

Confira:

```bash
claude plugin details core@agent-core
```

```
Skills (9)   baseline, ci-local, core-doctor, core-setup, economia-de-contexto,
             entregar-trabalho, extrair-skill, fase, mapear-codigo
Hooks (4)    PostToolUse, PreToolUse, Stop, SessionStart  (harness-only)
Always-on:   ~874 tok   added to every session
```

**Pronto.** As guardas e as skills já valem em **qualquer projeto** desta máquina.
Você não precisa clonar este repositório.

<details>
<summary><b>Máquina do zero?</b> Node, Claude Code e <code>gh auth</code> primeiro</summary>

```bash
# 1. Node 18+  →  nodejs.org  (o Claude Code vem por npm, então vem antes)
node --version

# 2. Claude Code
npm install -g @anthropic-ai/claude-code
claude --version        # faça o login na primeira execução

# 3. GitHub CLI  →  cli.github.com
gh auth login           # escolha HTTPS e aceite configurar as credenciais do git
```

O repositório é privado. Antes de seguir, isto tem de listar refs **sem pedir senha**:

```bash
git ls-remote https://github.com/pastoriniMatheus/core-ai.git
```

Passo a passo completo em [`docs/MAQUINA-NOVA.md`](docs/MAQUINA-NOVA.md).

</details>

## Configurar cada projeto

O plugin traz hooks e skills. O que ele **não** sabe é o comando de teste do seu
projeto, a branch base e o tracker.

Abra o Claude Code na pasta do projeto e rode:

```
/core-setup
```

Ele pergunta o que falta e escreve nos lugares certos.

Para ligar o tracker (Plane, Linear, Jira, GitHub Issues), há um comando próprio:

```
/core-tracker
```

Pergunta a URL e o token, **testa a conexão de verdade** e só então grava — o
token em `.claude/settings.local.json`, fora do git. Se o teste falhar, nada é
gravado: credencial que parece configurada e falha no primeiro uso real é pior
que credencial ausente.

E ele **recusa gravar** se o `.gitignore` do repositório não cobrir o arquivo —
inclusive quando a proteção vem só de uma regra global da sua máquina, porque no
clone de um colega o token ficaria commitável.

Num projeto que **já existe**, o roteiro é outro — medir antes, acertar
`testPatterns` primeiro, ligar por fases:
[`docs/PROJETO-EM-ANDAMENTO.md`](docs/PROJETO-EM-ANDAMENTO.md).

**Aceite o diálogo de confiança** na primeira abertura de cada projeto. Sem isso
o Claude Code ignora as regras de permissão e avisa no terminal — os hooks
funcionam, mas você confirma cada teste na mão.

## Prove em 30 segundos

Peça ao agente, dentro de um projeto:

> Adicione a dependência lodash usando npm install.

Ele tem de ser **bloqueado** com a escada da preguiça. Se instalar direto, algo
não ligou — rode `claude plugin details core@agent-core`.

## Referência rápida

| Situação | Comando |
|---|---|
| Ver o que está instalado | `claude plugin list` |
| Inventário e custo em tokens | `claude plugin details core@agent-core` |
| Atualizar para a versão nova | `claude plugin marketplace update agent-core` |
| Desligar temporariamente | `claude plugin disable core@agent-core` |
| Remover | `claude plugin uninstall core@agent-core` |

**Cuidado:** `marketplace remove` **desinstala o plugin junto**. Para desligar sem
perder, use `disable`.

Quando uma guarda atrapalhar num repositório que você só foi ler, desligue **só
ela**, naquele projeto, em `.claude/core.json`:

```json
{ "depGuard": { "enabled": false } }
```

---

# O que ele faz

## O problema

Diretrizes de agente costumam ser um texto grande no `CLAUDE.md` mandando o
modelo se comportar. Falha por três motivos:

1. **O `CLAUDE.md` entra no prompt em todo turno.** Procedimento detalhado ali é
   pago sempre para ser útil às vezes.
2. **Instrução é probabilística.** O modelo obedece quase sempre. "Quase" é onde
   moram os erros que chegam em produção.
3. **Duas autoridades de processo se anulam.** Quando um texto manda entrevistar
   até exaurir dúvidas e outro manda entregar e calar a boca, o agente oscila.

## Quatro camadas, por mecanismo

| Camada | Mecanismo | Ataca |
|---|---|---|
| 0 | hooks + permissões | erro |
| 1 | `CLAUDE.md` enxuto, `CONTEXT.md`, grafo | alucinação |
| 2 | uma autoridade de processo + skills | desalinhamento |
| 3 | roteamento de modelo, subagentes | custo |

Regra: **tudo que puder descer de camada, desce.**

## Camada 0 — o que executa sozinho

| Hook | Evento | O que garante |
|---|---|---|
| `post-edit-verify` | `Edit` `Write` `MultiEdit` `Bash` | O arquivo escrito passa pelo linter — por ferramenta **ou por shell** |
| `pre-bash-guard` | `Bash` | Dependência nova exige subir a escada. Grafo desatualizado avisa antes de mentir |
| `pre-publish-guard` | `Bash` e `mcp__*` | PR ou card sem permissão explícita não passa, **pelos dois caminhos**. Estado final do card é bloqueio **sem escape** |
| `stop-verify` | `Stop` | Código alterado sem teste rodado depois não encerra a sessão |
| `session-start` | `SessionStart` | Projeto sem configuração avisa, em vez de rodar meio-mudo em silêncio |

Autodetecção: Ruby, JS/TS, Python, Go, PHP, Shell, Swift, Kotlin, JSON e YAML.
Ferramenta ausente = hook silencioso, nunca hook quebrado — a existência do
binário é checada **antes** de rodar, porque um comando ausente sob shell não
produz `ENOENT` e seria confundido com "o linter reprovou".

**Rust, Java, C# e Scala não têm verificação por arquivo confiável** (o compilador
precisa do projeto inteiro). São cobertas no outro extremo: `stopVerify.projectCheck`
roda o build completo **uma vez**, antes de encerrar.

## Portão de publicação: Bash e MCP

Um hook só de `Bash` deixaria passar livre qualquer tracker acessado por MCP —
que costuma ser o caminho preferido.

| Caminho | Inspecionado | Como autorizar |
|---|---|---|
| Bash | o comando | prefixo `CORE_PUBLISH_OK=1` |
| MCP | `<ferramenta> <argumentos>` | token one-shot em `.claude/core-state/publish-ok` |

Numa chamada MCP não há onde prefixar um marcador. Por isso a autorização vira um
arquivo criado logo antes, **consumido no uso** e válido por poucos minutos — uma
autorização, uma publicação, que é a semântica de "por PR e por card".

## Skills

| Skill | Para quê |
|---|---|
| `fase` | EXPLORAR → ALINHAR → IMPLEMENTAR → PROVAR. Elimina o conflito entre regimes |
| `mapear-codigo` | Grafo para relação, busca para texto, leitura para conteúdo. Evita o mapa velho |
| `economia-de-contexto` | O que delegar a subagente, qual modelo por tarefa, onde cada instrução mora |
| `extrair-skill` | Transforma conhecimento do time em skill versionada |
| `entregar-trabalho` | Permissão por PR e por card, prova do caminho real, comentário com link |
| `ci-local` | Verificador que roda na máquina em segundos, em vez de esperar CI externo |
| `atacar-card` | Do identificador à entrega: busca o card, conduz as seis fases, para no portão |

## Comandos

`/core-setup` `/core-tracker` `/core-ferramentas` `/core-doctor` `/baseline`

## Trabalhar um card

Configure o tracker uma vez com `/core-tracker` e depois, em qualquer projeto:

> ataque CRM-540

A skill `atacar-card` busca o card, conduz as seis fases (fixar o terreno,
investigar, decidir, implementar, provar, publicar) e **para no portão** pedindo
sua autorização antes da PR e antes de mover o card.

Funciona com **Plane, Linear, Jira e GitHub Issues** — nada na skill sabe o nome
de nenhuma empresa. Trocar de tracker é trocar uma linha de configuração.

```bash
# o que a skill usa por baixo
node $AGENT_CORE_ROOT/scripts/tracker.mjs --projeto . card CRM-540
echo "texto" | node $AGENT_CORE_ROOT/scripts/tracker.mjs --projeto . comment CRM-540 -
```

Buscar e comentar passam livres. **Mover o card é interceptado** — inclusive
quando feito por este script, que é parte do núcleo: uma ferramenta que fura a
própria guarda é o jeito mais fácil de destruir o sistema.

---

# Desenvolver o núcleo

Só necessário para **editar**, não para usar.

```bash
git clone https://github.com/pastoriniMatheus/core-ai.git
cd core-ai
node tests/hooks.test.mjs              # 97 casos, segundos
node scripts/aceitacao.mjs --offline   # instalação e guardas
node scripts/aceitacao.mjs             # + sessões reais do Claude Code, ~10 min
```

**`aceitacao.mjs` é o teste que importa.** Cria um projeto descartável, instala o
núcleo e pede ao agente exatamente o que cada guarda deveria barrar — numa sessão
de verdade. O veredito vem da **contagem de bloqueios no transcript**, não da
resposta do agente: ele pode recusar por outro motivo. É a diferença entre
"parece que funcionou" e "funcionou".

Para testar alterações locais antes de publicar, instale por caminho:

```bash
node scripts/preflight.mjs /caminho/do/projeto   # o que a máquina precisa
node scripts/install.mjs   /caminho/do/projeto   # aponta para este clone
node scripts/doctor.mjs    /caminho/do/projeto   # confirma
```

| Modo | Comando | Quando |
|---|---|---|
| plugin | `claude plugin install core@agent-core` | uso normal, e para a equipe |
| local | `install.mjs <projeto>` | desenvolver o núcleo; hooks apontam para este clone |
| global | `install.mjs --global` | as guardas em todo projeto, sem publicar |

O instalador é **aditivo**: mescla `permissions.allow`, preserva hooks de outras
ferramentas, não sobrescreve uma skill sua de mesmo nome, e rodar duas vezes não
duplica nada.

## Medir

```bash
node scripts/baseline.mjs --days 7 --save antes     # ANTES de mudar o fluxo
node scripts/baseline.mjs --days 7 --compare antes  # depois
```

Sem número de partida não há como saber se uma mudança ajudou — só a sensação de
que ajudou.

## Adicionar uma camada de projeto

Um plugin novo em `plugins/<nome>/`, declarado no `.claude-plugin/marketplace.json`.
O projeto habilita o que precisa:

```json
{ "enabledPlugins": { "core@agent-core": true, "<nome>@agent-core": true } }
```

Um projeto que não habilita uma camada **não enxerga** as skills dela. Isolamento
por construção, não por disciplina.

---

# Documentação

| | |
|---|---|
| [`docs/MAQUINA-NOVA.md`](docs/MAQUINA-NOVA.md) | Máquina do zero: pré-requisitos até a primeira guarda funcionando |
| [`docs/PROJETO-EM-ANDAMENTO.md`](docs/PROJETO-EM-ANDAMENTO.md) | Adotar num projeto que já existe, sem quebrar o fluxo do time |
| [`docs/manual.html`](docs/manual.html) | O manual completo, para abrir no navegador ou compartilhar |
| [`docs/PASSO-A-PASSO.md`](docs/PASSO-A-PASSO.md) | Escopos de instalação e o que vai para o git |
| [`docs/COMECAR.md`](docs/COMECAR.md) | Os testes de aceitação, um a um |
| [`docs/FERRAMENTAS.md`](docs/FERRAMENTAS.md) | Ponytail, mattpocock, Graphify, notebooklm — e a armadilha de cada uma |

O manual é gerado por `python scripts/atualizar-manual.py`, que **lê os números da
suíte em vez de aceitá-los digitados** e se recusa a atualizar se algum teste
falhar. Um número errado no documento que a equipe lê vale menos que nenhum.

## Ferramentas externas

O núcleo funciona sozinho. As ferramentas abaixo acrescentam capacidades, e um
comando instala e configura todas:

```
/core-ferramentas
```

| Ferramenta | Papel | Onde roda |
|---|---|---|
| **Ponytail** | escrever o mínimo de código | local (plugin) |
| **Graphify** | grafo: quem chama o quê, o que quebra se mudar | **local ou servidor MCP** — o comando pergunta |
| **notebooklm-py** | base de conhecimento externa | local, opcional |
| ~~mattpocock/skills~~ | — | **não entra** |

**O Pocock não entra** porque o núcleo passou a cobrir o mesmo terreno: `fase`
faz o alinhamento, `atacar-card` conduz a implementação, `entregar-trabalho`
fecha a entrega — as três escritas a partir das skills do próprio time. Instalar
por cima criaria duas autoridades de processo disputando cada decisão, que é o
erro que este núcleo existe para eliminar.

**Graphify local × MCP.** O padrão é local: o grafo vive em `graphify-out/`, fora
do git, e o hook post-commit o reconstrói a cada commit. Zero infra. O modo MCP
serve um time inteiro de um servidor só — compensa quando o build fica lento num
repositório grande, ao custo de mais uma peça para manter e de alguém precisar
reconstruir o grafo a cada push. A configuração do modo MCP é escrita mesmo antes
do servidor existir: quando ele subir, troca-se a URL e nada mais muda.

O grafo é construído com `--code-only`: parsing local por tree-sitter, **nada sai
da máquina**. Sem esse flag, documentos e PDFs do repositório vão para o LLM
configurado — num projeto com contrato de cliente, é a diferença entre local e
vazamento.

**Obsidian ficou de fora**, por decisão: `CONTEXT.md` e `docs/` já fazem o papel
de conhecimento versionado, e um vault separado seria mais uma coisa para manter
em sincronia. Quem quiser o grafo navegável tem `graphify . --obsidian`, que é um
flag e não uma ferramenta a mais.

## Requisitos

Node 18+, que já vem com o Claude Code. Os hooks não têm nenhuma outra dependência.
