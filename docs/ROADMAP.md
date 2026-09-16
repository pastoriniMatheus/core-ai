# O que falta

Estado em 16/09/2026, versão **0.7.6**. Nada aqui é bug conhecido: são coisas
**nunca exercitadas** e decisões adiadas com motivo.

O núcleo passa 217 testes de guarda, 31 de documentação e 25/25 na aceitação
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

Os testes de MCP montam o evento à mão. **Nenhum servidor MCP foi acionado**
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
(conta Google pessoal, nao a corporativa):

| O que | Resultado |
|---|---|
| `notebooklm login` | autenticou pelo Chrome do sistema, em perfil isolado |
| `auth check --test` | todos os checks passaram, 29 cookies, token fetch ok |
| as quatro portas com rede | 7/7, incluindo a `PUBLICA` com `curl` de verdade |
| `source add` de 593 KB | a fonte entrou na base |
| `notebooklm ask` | leu a fonte e respondeu com citacoes: 12 historias, `[1, 2]`, `[3-9]` |
| o carimbo de procedencia | saiu na primeira consulta, calou na segunda |
| o teto de bytes | disparou numa resposta real de 21,3 KB |
| `conferir` | acusou a fonte que estava no indice e nao na base |
| servidor Docker | `healthy`, sem bearer 401, com bearer 400, zero reinicios |

O envio por ARQUIVO nao funciona, e o por URL funciona — o que mudou o desenho:

| caminho | resultado |
|---|---|
| `source add <arquivo>` | `preparing`, tipo `unknown`, travado por 25+ minutos |
| `source add <URL>` | `ready` em 25 segundos, respondeu com citacoes |

Como a porta FORA ja exigia URL publica, o envio passou a ser da URL. O
conteudo nunca sai da maquina, e a superficie de vazamento do envio some.

A consequencia esta escrita na skill: **material sem URL publica nao entra**.
Um PDF que o fornecedor mandou por e-mail falha na porta FORA.

O que **nao** foi provado:

- **fonte vencida barrando consulta real.** Ver abaixo.
- **fonte vencida barrando consulta real.** Testado com data forjada no indice,
  nunca com uma fonte que venceu de verdade. So o tempo prova, e sao 180 dias.

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

### Upload de arquivo: investigado, e a conclusao mudou o desenho

Tres medicoes na mesma conta e na mesma sessao:

| tamanho | tipo que o Google atribuiu | status |
|---|---|---|
| 60 B | `pasted_text` | ready |
| 97 KB | `pasted_text` | ready |
| 593 KB | `unknown` | **travado em `preparing`** |

Abaixo do limiar, o conteudo vai INLINE — o Google o classifica como texto
colado e processa na hora. Acima, o caminho muda e a ingestao nunca termina.
A biblioteca nao tem culpa: `.txt` nao esta em `_DRIVE_STAGED_UPLOAD_EXTENSIONS`
(so `.csv`, `.docx`, `.pptx`), vai pelo pipeline resumable em blocos de 64 KB,
e a fonte E criada com id. Quem para e a ingestao do lado do Google.

**E aqui esta o ponto.** A porta GRANDE exige >= 195 KB. O intervalo que
funciona termina em algum lugar entre 97 KB e 593 KB. Os dois sao
**disjuntos**: o caminho de arquivo nunca poderia ter funcionado para nada que
as portas admitem.

Por isso o envio passou a ser da URL — nao como melhoria, como unica opcao que
funciona para o material que esta feature existe para receber. E como a porta
FORA ja exigia URL publica, nao se perdeu nada.

O limiar exato nao foi fechado (esta entre 97 KB e 593 KB) porque a resposta nao
muda nenhuma decisao: acima de 195 KB nao funciona, e e so acima de 195 KB que
esta feature envia.

### Deferimento de ferramentas MCP — a verificação que pode inverter uma decisão

A escolha de usar a CLI em vez do servidor MCP foi feita sobre um número medido:
as 38 ferramentas do `notebooklm-py` custam **12.629 tokens** de system prompt em
toda sessão, contra ~1.378 do plugin inteiro (medido em 0.7.2).

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
| **projeto A** | `core.json` com o comando de teste dele (roda em container), `develop` como base, o Plane em `trackerPatterns` |
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
6. **Primeira camada de projeto** — depois do baseline, nunca antes
