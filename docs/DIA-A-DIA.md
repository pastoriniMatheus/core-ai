# O dia a dia

Os outros documentos são sobre instalar, adotar e atualizar — coisas que você
faz uma vez. Este é sobre os outros dias: o que o núcleo faz sozinho, por que
o agente parou, e o que você responde.

**A regra que resume tudo:** o núcleo nunca pede que você confie no "pronto" do
agente. Quando ele para, ele diz o motivo e o que falta. Ler a mensagem costuma
bastar; este documento é para quando não basta.

---

## O que acontece sem você pedir

| Quando | O que roda | O que você vê |
|---|---|---|
| Ao abrir o projeto | `session-start` | o checkpoint da sessão anterior, o que falta configurar, e o caminho do núcleo se ele mudou |
| A cada arquivo escrito | `post-edit-verify` | nada, se o arquivo estiver íntegro — o linter roda por ferramenta **e** por shell |
| A cada comando | `pre-bash-guard`, `pre-publish-guard`, `pre-externa-guard` | nada, até um deles ter motivo para parar |
| Ao encerrar | `stop-verify`, `stop-checkpoint` | o bloqueio por falta de prova, e o checkpoint gravado |

Nada disso pede sua atenção enquanto está tudo certo. É deliberado: guarda que
fala o tempo todo vira ruído e acaba desligada.

Para ver o estado **antes** de o hook falar: `/core-painel`.

---

## O agente parou. E agora?

Cada bloco abaixo começa com a mensagem literal que aparece na sua tela.

### `[core] Dependencia nova detectada`

O agente ia instalar um pacote. Ele precisa subir a escada primeiro — YAGNI,
repo, stdlib, plataforma, dependência já instalada, uma linha.

**Você faz:** nada, normalmente. O agente sobe a escada sozinho e, se a
dependência continuar sendo a resposta certa, explica em uma frase por que os
degraus não resolvem e reexecuta com `CORE_DEP_OK=1`. Se a explicação não
convencer **você**, essa é a hora de dizer.

### `[core] Codigo foi alterado e nenhum teste rodou depois da ultima edicao.`

O encerramento foi bloqueado: há código editado sem prova depois.

**Você faz:** deixe o agente rodar o teste. Se ele **já rodou** e mesmo assim
bloqueou, é falso positivo — o comando de teste deste projeto não está em
`testPatterns`. É o erro mais provável do primeiro dia, e a correção está em
`/core-setup` ou direto no `.claude/core.json`.

O caminho melhor é o outro: ponha o comando de teste real em `projectCheck`.
Aí **o núcleo roda o teste ele mesmo** antes de encerrar, e isso vale como
prova — o agente não consegue fingir verde.

### `[core] A verificacao de projeto reprovou:`

O `projectCheck` (build, typecheck ou a suíte) rodou e falhou. O erro real vem
logo abaixo, na mensagem.

**Você faz:** nada — é um erro de verdade, e o agente tem o texto para corrigir.

### `[core] A verificacao de projeto NAO terminou:`

O comando estourou o tempo ou nem pôde ser executado. **Não é aprovação**:
ninguém sabe se o projeto compila.

**Você faz:** se o build for mesmo longo, suba `stopVerify.projectCheckTimeoutMs`
no `.claude/core.json`. Se o comando não existe nesta máquina, corrija o comando.

### `[core] Portao de publicacao:`

O agente ia abrir uma PR ou mover um card. Permissão é **por PR e por card,
toda vez** — um "pode" de ontem não vale para hoje.

**Você faz:** a mensagem lista o que ele deveria ter em mãos (caminho real
exercitado, contraprova, o que ficou de fora, branch base). Peça isso, e depois
autorize. O agente reexecuta com `CORE_PUBLISH_OK=1` — o prefixo é o registro
de que **você** decidiu.

### `[core] Este comando parece mover um card para`

O estado final do card. **Este bloqueio não tem escape** — nem com a sua
autorização. Fechar um card é o julgamento de quem revisou, e quem revisa move
à mão.

**Você faz:** o card vai para revisão com o link da PR no comentário, e para
por aí. Se o trabalho está pronto mesmo, feche você.

### `[core] Isto nao sai da maquina:`

Um segredo ou dado pessoal (CPF, cartão, chave) ia dentro de um comando para a
base externa. **Sem escape.**

**Você faz:** reformule a pergunta sem o dado. O que a base precisa é da
pergunta, não do dado do cliente.

### `[core] Este arquivo esta VERSIONADO neste repositorio:`

Alguém ia mandar para a base externa um arquivo que já está no git. **Sem
escape:** procedência é veto. O repositório já é a fonte de verdade, e duplicar
cria uma segunda autoridade que desatualiza no primeiro commit.

### `[core] A base externa tem`

Uma ou mais fontes **venceram**, e fonte vencida **barra a consulta** em vez de
avisar. Um aviso que aparece em toda consulta vira ruído em duas semanas, e a
fonte continua velha.

**Você faz:** reenvie ou pode a fonte, e atualize `docs/base-externa.md`.

### `[core] O grafo esta` N commits atrasado

Aviso, não bloqueio. Um mapa velho responde com confiança sobre estrutura que
mudou — o pior erro de um grafo não é faltar, é estar desatualizado.

**Você faz:** `graphify hook install` uma vez, e ele se reconstrói a cada commit.

---

## O que nunca destrava

Três coisas não aceitam autorização, de ninguém:

| | Por quê |
|---|---|
| mover card para o estado final | é o julgamento de quem revisou, e o agente não revisou |
| segredo ou dado pessoal saindo da máquina | irreversível: falso positivo custa um prompt, falso negativo é permanente |
| arquivo versionado indo para a base externa | procedência é veto — o repositório já é a fonte de verdade |

Tudo o mais tem caminho: ou um escape que **você** autoriza, ou configuração.

---

## Os escapes, e o que eles significam

| Escape | Onde | O que ele registra |
|---|---|---|
| `CORE_DEP_OK=1` | dependência nova | o agente subiu a escada e explicou por que ela não resolve |
| `CORE_PUBLISH_OK=1` | PR e movimento de card | **você** autorizou, nesta conversa, esta publicação |
| token da base externa | envio de material | quem rodou `externa.mjs enviar` foi um humano, e o token **nomeia** o que autoriza |

Escape não é atalho do agente: é a marca de uma decisão sua. Um agente que
prefixa sem ter perguntado está quebrando a regra, não usando o mecanismo — e
isso aparece no `/core-painel` e no checkpoint.

---

## Falso positivo ou bloqueio legítimo?

Quase todo bloqueio "injusto" é configuração faltando, não hook errado:

| Sintoma | Causa quase sempre |
|---|---|
| bloqueia depois de o teste ter rodado | o comando de teste do projeto não está em `testPatterns` |
| o portão ignora movimento de card | `publish.trackerPatterns` vazio — ele só reconhece PRs |
| toda edição de um tipo de arquivo bloqueia | o linter daquela linguagem não está instalado nesta máquina |
| `/core-*` falha com "Cannot find module" | `$AGENT_CORE_ROOT` ficou na versão anterior: abra o projeto de novo |

Antes de desligar qualquer coisa, rode `/core-doctor`.

Se ainda assim precisar desligar, desligue **uma** guarda, naquele projeto —
nunca o núcleo inteiro:

```json
{ "depGuard": { "enabled": false } }
```

As chaves são `depGuard`, `verify`, `stopVerify`, `publish`, `checkpoint` e
`externa`. A lista completa do que cada uma aceita está em
[`CONFIGURACAO.md`](CONFIGURACAO.md), gerada a partir do código.

---

## Os comandos que você usa mais

| | Quando |
|---|---|
| `/core-painel` | "o encerramento vai bloquear?" — mostra fase, card e prova antes do hook falar |
| `/core-doctor` | algo parece desligado, ou você acabou de atualizar |
| `ataque PROJ-540` | trabalhar um card de ponta a ponta, parando no portão |
| `/core-setup` | o projeto mudou de comando de teste, de branch base ou de tracker |

A statusline mostra o mesmo retrato do painel, sem você pedir — o `/core-init`
oferece instalar.
