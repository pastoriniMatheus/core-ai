# O que falta

Estado em 16/09/2026, versão **0.7.0**. Nada aqui é bug conhecido: são coisas
**nunca exercitadas** e decisões adiadas com motivo.

O núcleo passa 217 testes de guarda, 28 de documentação e 25/25 na aceitação
com sessões reais do Claude Code. Isso prova o que foi testado — não o que não
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

### A base externa ja falou com o Google — e o que sobrou

Em 16/09/2026 a integracao foi exercitada de ponta a ponta com sessao real
(`pastorinimatheus@gmail.com`, conta pessoal, nao a corporativa):

| O que | Resultado |
|---|---|
| `notebooklm login` | autenticou pelo Chrome do sistema, em perfil isolado |
| `auth check --test` | todos os checks passaram, 29 cookies, token fetch ok |
| as quatro portas com rede | 7/7, incluindo a `PUBLICA` com `curl` de verdade |
| `source add` de 593 KB | a fonte entrou na base |
| `notebooklm ask` | respondeu, em portugues |
| o carimbo de procedencia | saiu na primeira consulta, calou na segunda |
| `conferir` | acusou a fonte que estava no indice e nao na base |
| servidor Docker | `healthy`, sem bearer 401, com bearer 400, zero reinicios |

O que **nao** foi provado, e nao da para provar sem esperar:

- **a fonte nunca terminou de processar.** Um `.txt` de 593 KB ficou em
  `preparing` por mais de cinco minutos, com tipo `unknown`. Entao a resposta do
  `ask` veio de uma caderneta vazia — correta, mas nao sobre o material. Nao se
  sabe se e o tamanho, o formato, ou lentidao do lado do Google.
- **a resposta longa.** O teto de `tetoRespostaBytes` nunca foi atingido por
  texto real, porque nao houve fonte indexada para gerar resposta longa.
- **fonte vencida barrando consulta real.** Testado com data forjada no indice,
  nunca com uma fonte que venceu de verdade.

E uma armadilha nova, descoberta no caminho: com **Python 3.14** a biblioteca
cospe `AssertionError` de `asyncio` no meio de chamadas que FUNCIONAM. O
`source add` imprimiu cinco tracebacks e adicionou a fonte. Quem olhar a saida
vai achar que falhou.

### `externa.mjs conferir` nunca comparou nada de verdade

O comando existe e reconcilia `notebooklm source list` com
`docs/base-externa.md` — mas sem sessão autenticada ele só foi exercitado no
caminho de falha, onde imprime "não consegui listar as fontes" e sai.

O que falta provar: que a saída real de `source list` casa com os nomes do
índice. A comparação é por substring normalizada, de propósito — o formato de
saída de uma biblioteca não-oficial muda entre versões — mas "de propósito" não
é o mesmo que "testado".

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
