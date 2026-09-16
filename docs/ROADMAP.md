# O que falta

Estado em 16/09/2026, versão **0.6.1**. Nada aqui é bug conhecido: são coisas
**nunca exercitadas** e decisões adiadas com motivo.

O núcleo passa 209 testes de guarda, 22 de documentação e 17/17 na aceitação offline
(as sessões reais foram exercitadas em 0.6.0; a rodada completa desta versão
foi interrompida por falta de memória na máquina, e está pendente). Isso prova o que foi testado — não o que não
foi, e esta página existe para que a diferença entre as duas coisas fique visível.

---

## Nunca exercitado

### Mac e Linux

O `binExiste` tem dois ramos: `where` no Windows, `command -v` no resto. A
lógica do ramo Unix tem teste, mas **ele nunca rodou como hook** numa dessas
máquinas — o projeto inteiro foi desenvolvido e validado em Windows.

Risco concreto: o `runFirstAvailable` agora executa pelo caminho resolvido, sem
shell. No Unix `command -v` devolve o caminho igual, mas nada disso foi
observado rodando.

**Como fechar:** alguém com Mac ou Linux roda `node tests/hooks.test.mjs` e
`node scripts/aceitacao.mjs`. Trinta minutos, e é o maior buraco da lista.

### MCP num tracker de verdade

Os 13 testes de MCP montam o evento à mão. **Nenhum servidor MCP foi acionado**
— nem para ler card, nem para barrar escrita.

O que isso não prova: que os nomes reais das ferramentas de cada servidor
casam com os padrões. `mcp__plane_uaizy__list_work_items` veio de um relato seu,
não de um catálogo. Servidores de Linear, Jira e GitHub podem nomear diferente.

**Como fechar:** num projeto com MCP de tracker configurado, pedir uma leitura
(tem de passar), uma escrita (tem de parar) e uma tentativa de fechar card (tem
de negar sem escape). O teste da aceitação já tem a forma; falta a credencial.

### Convivência com outros hooks no mesmo evento

Esta máquina tem hooks de outra ferramenta (Orca) registrados em **todos** os
eventos, com matcher `*`. A documentação afirma que hooks somam e rodam em
paralelo — é o comportamento documentado do Claude Code, **mas não foi
verificado aqui**.

O que pode dar errado: um hook de terceiro que devolva exit 2 num caminho onde
o núcleo passaria, ou a ordem de execução importando de um jeito não previsto.

**Como fechar:** abrir uma sessão com os dois ativos e confirmar que ambos
disparam, sem um anular o outro.

### O modo `--global` em uso real

Foi testado com um `HOME` falso, preservando configuração existente. **Nunca
rodou de verdade** no diretório do usuário.

---

## Decidido adiar, com motivo

### Ponytail e Graphify

`/core-ferramentas` instala e configura os dois. O Graphify é o que mais
acrescentaria: a skill `mapear-codigo` já descreve quando usar grafo.

O modo servidor MCP do Graphify tem a configuração pronta e **o servidor não
existe**. Decidido começar local: migrar depois é barato, e montar infra para um
problema não medido é criar manutenção à toa.

### A base externa nunca falou com o Google

Toda a camada 0 da base externa está testada — 66 casos, incluindo o portão, a
autorização nomeada, o frescor e o que volta. **Mas nenhuma chamada real ao
NotebookLM aconteceu**: não há sessão autenticada, porque autenticar exige um
humano num navegador, e a conta tem de ser descartável.

O que isso deixa sem prova:

- que `notebooklm ask` devolve o que se espera, e em que formato
- que o carimbo de procedência do `post-externa-resposta` casa com a saída real
- que o servidor em Docker **serve** (ele constrói, sobe, e recusa subir sem
  sessão — isso está provado; responder a uma consulta, não)
- o tempo de uma consulta, que é o número que decide se ela vale a pena no meio
  de uma decisão

**Como fechar:** criar a conta descartável, `notebooklm login`, `notebooklm auth
check --test`, e então uma consulta real. Vinte minutos, e é o maior buraco
desta versão.

### Conferir a base contra o índice

`docs/base-externa.md` é a única fonte de validade das fontes, e ele é escrito à
mão pelo `registrar`. **Nada reconcilia os dois.** Se alguém subir uma fonte e
esquecer de registrar, ela existe no NotebookLM e não existe para o núcleo:
nunca vence, e não conta para o teto.

O caminho oposto está fechado — índice sumido com a feature preparada agora
**barra a consulta**, em vez de silenciosamente desligar a guarda. O que falta é
o `externa.mjs conferir`: rodar `notebooklm source list`, comparar com o índice,
e dizer o que está na base e fora do índice, e vice-versa.

Não foi feito porque exige sessão autenticada para ser testado de verdade, e
essa sessão não existe ainda.

### Deferimento de ferramentas MCP — a verificação que pode inverter uma decisão

A escolha de usar a CLI em vez do servidor MCP foi feita sobre um número medido:
as 38 ferramentas do `notebooklm-py` custam **12.629 tokens** de system prompt em
toda sessão, contra ~928 do plugin inteiro.

Há um caminho que mudaria a conta. Se as ferramentas MCP chegarem **deferidas** —
só o nome, com o schema carregado sob demanda — o custo medido cai para 395
tokens, 32× menos. O Claude Code faz isso em algumas configurações.

O que **não** se sabe: se é um botão controlável por projeto ou comportamento do
harness. Enquanto for a segunda coisa, nenhuma linha de código pode se apoiar
nisso — e nenhuma se apoia. O portão cobre os dois caminhos justamente por isso.

**Como fechar:** uma sessão de teste com o MCP ligado, medindo `/context` antes
e depois. Se for controlável, o MCP volta à mesa para uso interativo.

### mattpocock/skills — não entra

Quando a escolha foi feita, o núcleo não tinha skills próprias. Hoje `fase`,
`atacar-card` e `entregar-trabalho` cobrem o mesmo terreno, escritas a partir das
skills do próprio time. Instalar por cima criaria duas autoridades de processo
disputando cada decisão — o erro que o `doctor.mjs` acusa e que este núcleo
existe para eliminar.

### Obsidian — fora do escopo

`CONTEXT.md` e `docs/` já fazem o papel de conhecimento versionado, e vivem no
repositório, que é onde decidimos que mora a verdade da equipe. Quem quiser o
grafo navegável tem `graphify . --obsidian`: um flag, não uma ferramenta a mais.

---

## Camadas de projeto

Planejadas desde o início, nenhuma iniciada:

| Camada | O que entraria |
|---|---|
| **evo** | `core.json` com o comando de teste do CRM (roda no container), `develop` como base, o Plane em `trackerPatterns` |
| **projeto B** | idem, com os valores daquele projeto |

A arquitetura já suporta: um plugin novo em `plugins/<nome>/`, declarado no
mesmo `marketplace.json`. Um projeto que não habilita uma camada **não enxerga**
as skills dela — isolamento por construção, não por disciplina.

**Pré-requisito que não foi feito:** rodar `baseline.mjs --save antes` num
projeto real por uma semana. Sem número de partida, a camada vai parecer que
funcionou independentemente de ter funcionado.

---

## Medição — o que o projeto pede e ninguém fez

`scripts/baseline.mjs` existe desde o começo e **nunca foi usado para valer**.
Foi rodado uma vez, para provar que lê os transcripts.

Isso é a maior incoerência aberta do projeto: ele argumenta que instalar
ferramentas sem medir é viés de confirmação, e não mediu a si mesmo.

```bash
node scripts/baseline.mjs --days 7 --save antes
```

---

## O padrão que a revisão expôs

Quatro vezes o mesmo tipo de falha apareceu — **um caminho coberto, outro
aberto**:

| | Coberto | Aberto |
|---|---|---|
| 1 | Bash | MCP |
| 2 | `Edit`/`Write` | escrita por shell |
| 3 | `curl` no tracker | o próprio `tracker.mjs` |
| 4 | `install.mjs` | instalação por plugin |

E a revisão achou a quinta: a isenção de leitura no MCP casando prefixo, o que
deixava `get_or_update_work_item` atravessar o portão inteiro.

**A pergunta que precisa ser feita sempre, e não foi:** *e pelo outro caminho?*

A segunda lição foi mais desconfortável: **três dos sete achados críticos foram
introduzidos nas horas anteriores**, corrigindo outra coisa. Correção com pressa
cria o próximo bug, e só revisão pega.

---

## Ordem sugerida

1. **Mac ou Linux** — o maior buraco, e o mais barato de fechar
2. **Baseline num projeto real** — desbloqueia julgar qualquer mudança seguinte
3. **MCP de verdade** — precisa só da credencial que já existe
4. **Convivência com o Orca**
5. **Graphify local** — a ferramenta que mais acrescentaria
6. **Camada Evo** — depois do baseline, nunca antes
