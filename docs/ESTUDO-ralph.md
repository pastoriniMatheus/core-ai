# Estudo: o modo do núcleo × o modo ralph

Documento de decisão. Não propõe código. A pergunta é uma só: **o agente-core
deve continuar operando como opera, adotar o modo autônomo por fases do
`beer-and-code-harness` (ralph), ou combinar os dois?** Ao fim há uma
recomendação e o que teria de ser verdade para ela mudar.

Estado em 17/09/2026. O que entrou do harness já entrou (painel, marcador de
fase, âncoras de drift, `projectCheck` como prova); este texto é sobre o que
**não** entrou: o executor autônomo.

---

## 1. Os dois modos, sem juízo

### O núcleo: sessão interativa, humano no loop

Uma sessão do Claude Code, com o humano presente. Quatro fases declaradas
(EXPLORAR → ALINHAR → IMPLEMENTAR → PROVAR), skills que orientam, e **hooks que
bloqueiam o que não pode acontecer**: dependência nova, arquivo quebrado,
encerramento sem prova, PR ou card sem permissão, envio à base externa.

O agente **para** em cada portão e pergunta. Mover um card para revisão exige
"sim" do usuário, por PR e por card, toda vez. O estado final do card nunca é
do agente. A revisão humana é **síncrona**: acontece antes do ato, não depois.

Custo: o humano precisa estar disponível. Ganho: nada irreversível acontece sem
alguém ter olhado.

### ralph: sessão autônoma por fase, humano antes e depois

`/init` produz uma especificação a partir de entrevista. `/plan` produz
`SPEC.md` + `PHASES.md`: fases pequenas, ordenadas, com critério de aceite.
`ralph.sh` então roda **uma sessão `claude -p --dangerously-skip-permissions`
nova por fase**, zero perguntas, e submete o resultado a quatro portas
mecânicas:

1. o próprio agente marca `RALPH-TASK n DONE` em texto puro;
2. a suíte de testes roda **fora** da sessão — o agente não consegue fingir verde;
3. um verificador independente, em modelo barato, lê o diff contra o critério
   de aceite;
4. o commit daquela fase é feito pelo script, um por fase.

Falhou uma porta? Entra o *fix-cycle*: nova sessão, com a causa real da falha
no prompt, até passar ou estourar o limite de tentativas. `ralph-watch.sh` mostra
o progresso ao vivo, lendo `.phases/state/*.tsv`.

Custo: o plano precisa estar certo antes de começar, porque ninguém vai
perguntar. Ganho: um backlog de dez fases roda de madrugada, e cada fase deixa
um commit para reverter.

---

## 2. Onde eles concordam — e é mais do que parece

| Princípio | no núcleo | no ralph |
|---|---|---|
| Não confiar no "pronto" do agente | `stop-verify` bloqueia sem prova | porta 1 não basta: precisa da 2 e da 3 |
| O teste roda fora da sessão do agente | `projectCheck` — o hook roda e o exit code é do processo | porta 2 — a suíte roda no script |
| Progresso em texto puro, sem ferramenta | `[fase] NOME` no transcript | `RALPH-TASK n START/DONE` na saída |
| Regra duplicada precisa ficar idêntica | âncoras de drift no `docs.test` | `check-init-drift.sh` |
| Tornar o silêncio visível | `doctor` (instalação), painel (sessão) | `ralph-watch` (fases) |
| Um só hook que bloqueia, o resto orienta | camada 0 × camada 2 | `sail-guard.sh` × os agents |

Os dois times chegaram, por caminhos diferentes, à mesma desconfiança: **exit
code de agente não é evidência**. A diferença não está no que se exige do
agente — está em *quando* o humano entra.

---

## 3. A diferença real: quando o humano decide

- **Núcleo**: o humano decide *antes de cada ato irreversível* — PR, card,
  envio à base. Entre um portão e outro o agente é livre; nos portões, para.
- **ralph**: o humano decide *antes de começar* (aprova o plano) e *depois de
  terminar* (revisa os commits; o commit por fase é o desfazer). No meio,
  ninguém.

Isso não é detalhe de implementação. É a resposta a uma pergunta de
organização: **quem paga o custo da ambiguidade?** No núcleo, paga-se em
interrupções — o agente pergunta, o humano responde, o trabalho continua certo.
No ralph, paga-se em reprocessamento — a fase sai errada, a porta 3 reprova, o
fix-cycle gasta mais uma sessão inteira, e se o *plano* estava errado, nenhuma
porta pega: o resultado passa nos testes e ainda assim não é o que se queria.

---

## 4. Custo e risco, por eixo

### Tokens

Cada fase do ralph é uma sessão nova: contexto zerado. Por isso é **barato por
fase** (nada acumula) e **caro entre fases** (cada uma reaprende o projeto — lê
o `SPEC.md`, o `PHASES.md`, os arquivos). Num projeto que o núcleo já mapeou
(`CONTEXT.md`, grafo do Graphify, checkpoint da sessão anterior), esse
reaprendizado é o que o `session-start` e o `checkpoint` existem para evitar.

O núcleo, numa sessão longa, paga o oposto: o contexto cresce, e a skill
`economia-de-contexto` existe porque isso dói. Não há vencedor aqui; há dois
custos de forma diferente.

### `--dangerously-skip-permissions` e os hooks do núcleo

Verificado na aceitação: **os hooks continuam rodando em sessão `-p` com essa
flag**. A flag pula o diálogo de permissão do Claude Code, não os hooks — o
`pre-publish-guard` barrou a abertura de PR em sessão exatamente assim, 26/26.

Consequência para quem imaginar rodar o ralph *com* o núcleo instalado: o
executor autônomo **não conseguiria abrir PR nem mover card**, porque ninguém
está ali para autorizar. Isso é bom ou ruim conforme o desenho:

- bom, se o executor deve parar em IMPLEMENTAR/PROVAR e deixar a publicação
  para o humano — e é essa a opção (b) abaixo;
- ruim, se a expectativa é "roda tudo até a PR" — aí ou se desliga o núcleo
  (perde-se tudo o que ele garante) ou se cria um escape para o executor, que
  é exatamente o tipo de escape que o núcleo recusa ter.

### Revisão humana

No núcleo, síncrona e antes: o agente mostra o que verificou e o que ficou
aberto, e espera. No ralph, assíncrona e depois: os commits estão lá, o humano
revisa quando puder, e o desfazer é `git revert`.

Reverter é barato em código. É caro em **efeito colateral**: um card movido,
uma PR aberta com comentário, uma migração rodada, um envio a serviço externo.
Tudo isso é o que os hooks do núcleo barram, e nada disso o ralph barra — o
harness deles não tem tracker nem base externa; o problema não existe lá.

### Ambiguidade no pedido

O ralph *assume* que o `/plan` resolveu a ambiguidade. Quando o card diz
"melhore a performance da listagem" e não diz de quanto, nem onde, nem o que
não pode mudar, o núcleo entra em ALINHAR e pergunta. O ralph gera uma fase
plausível e a executa — e a porta 3 (o verificador contra o critério de
aceite) só pega se o critério estava escrito. Se o critério era vago, o
verificador é tão vago quanto.

---

## 5. Quando cada um ganha

**ralph ganha** quando:
- o backlog é longo e as fases já estão bem especificadas (greenfield, ou
  trabalho mecânico de migração);
- ninguém está disponível para responder durante horas — e isso é o normal,
  não a exceção;
- o custo do erro é um `git revert`, sem efeito fora do repositório;
- o projeto é de quem roda, não de um cliente com revisão.

**núcleo ganha** quando:
- o código é de cliente vivo, com equipe que revisa antes de mesclar;
- o card chega com ambiguidade — e em agência chega quase sempre;
- há tracker, PR, base externa: atos com efeito fora do repositório;
- o trabalho de uma sessão cabe numa sessão, e alguém está por perto.

O primeiro perfil é o do time que escreveu o harness. O segundo é o deste
projeto: agência, vários clientes, cards de tracker, revisão de PR, base
externa compartilhada. Não é uma crítica ao ralph — é o reconhecimento de que
ele resolve o problema deles, e o problema aqui é outro.

---

## 6. As três opções

### (a) Só núcleo — como está

Nada muda. O painel, o marcador de fase e o `projectCheck` como prova já
trouxeram o que do harness cabia na tese "tornar o silêncio visível".

Ganho: zero manutenção nova, zero superfície de risco nova. Perda: nenhum modo
para "rode estas quatro fases enquanto durmo", que é real e útil em trabalho
mecânico.

### (b) Núcleo + executor nativo para fases já alinhadas

Um `ralph.mjs` nosso, em Node, que pega o trabalho **depois** de ALINHAR: o
`atacar-card` conduz EXPLORAR e ALINHAR com o humano, produz o critério de
aceite numa frase, e o executor roda IMPLEMENTAR e PROVAR em sessões `-p`
sucessivas — **com os hooks do núcleo ativos**. Ele para, por construção, no
portão de publicação: PR e card continuam sendo do humano.

O que ele reaproveita, já existente: `stop-verify` com `projectCheck` (porta
2), `post-edit-verify` (verificação por arquivo, que o ralph não tem),
`checkpoint` (a fase seguinte lê onde a anterior parou — o reaprendizado entre
fases cai), painel (o `ralph-watch` já existe: é o `painel.mjs` ao vivo),
marcador `[fase]`.

O que ele teria de construir: o loop de fases, o fix-cycle com a causa da
falha no prompt seguinte, o commit por fase, o verificador independente (porta
3). Estimativa honesta: 300–400 linhas de Node e mais uns 15 testes, mais uma
sessão de aceitação nova. Não é pequeno, e é código que não existe hoje.

Ganho: o modo "de madrugada" para trabalho mecânico, sem abrir mão de nenhuma
garantia. Perda: uma segunda maneira de operar para documentar, ensinar e
manter — e duas maneiras é uma a mais do que o time usa hoje.

### (c) Migrar para o modelo ralph

Trocar sessão interativa por `/init` → `/plan` → executor. Os hooks do núcleo
ficariam, mas a interação humana passaria para antes e depois.

Ganho: autonomia máxima. Perda: o portão de publicação vira obstáculo em vez
de garantia (ninguém para autorizar), ALINHAR desaparece como fase e vira
entrevista única no `/init`, e o custo da ambiguidade migra de interrupção
para reprocessamento — no perfil deste projeto (cards ambíguos, cliente vivo,
efeitos fora do repositório), é o pior dos dois lados.

---

## 7. Recomendação

**(a) agora; (b) quando houver um caso concreto que a justifique; (c) não.**

O motivo de (a) e não (b) hoje: o executor autônomo resolve um problema que
este projeto **ainda não mediu ter**. O ROADMAP diz que ninguém mediu turnos,
tokens nem tempo por card (`baseline.mjs` existe e não foi usado num projeto
real). Sem essa medida, não se sabe se o gargalo é "o humano precisa responder
e não está" (o que (b) resolve) ou "o agente erra e retrabalha" (o que (b)
piora, porque tira o humano do meio). Construir 400 linhas para um gargalo
não medido é o que a skill `fase` chama de YAGNI.

O motivo de (b) e não (c), quando chegar a hora: o desenho de (b) mantém cada
garantia do núcleo e acrescenta o modo autônomo *dentro* delas. (c) troca as
garantias pelo modo.

**O que teria de ser verdade para mudar para (b):**

1. uma medição, com `baseline.mjs`, mostrando que a espera pelo humano é a
   parcela dominante do tempo por card — não o retrabalho;
2. um backlog real de fases mecânicas e bem especificadas (uma migração, uma
   troca de biblioteca em vinte arquivos), não cards de produto;
3. o Mac/Linux exercitado (ROADMAP): um executor que roda de madrugada roda
   numa máquina que ninguém está olhando, e o único bug de plataforma deste
   projeto foi achado por alguém olhando.

**O que teria de ser verdade para mudar para (c):** o time deixar de trabalhar
em código de cliente com revisão, tracker e base externa. Não é o caso, e não
há sinal de que vá ser.

---

## Apêndice: o que já foi portado, e por quê cada um coube

| do harness | virou no núcleo | por quê coube na tese |
|---|---|---|
| `ralph-watch.sh` (948 linhas de bash) | `lib/painel.mjs` + `scripts/painel.mjs` + `statusline.mjs` | o `doctor` torna a instalação visível; faltava a sessão. Uma fonte (o transcript), três superfícies |
| `RALPH-TASK n START/DONE` | `[fase] NOME` na skill `fase` | progresso em texto puro, sem depender de ferramenta; o painel e o checkpoint leem |
| `check-init-drift.sh` | âncoras de drift no `docs.test.mjs` | regra duplicada de propósito precisa ficar idêntica; antes nada acusava |
| porta 2 (a suíte roda fora da sessão) | `projectCheck` que casa `testPatterns` e passa **é** prova | o `stop-verify` confiava que um teste *apareceu*; agora o núcleo o roda |
| `ralph.sh` | este estudo | é outro modo de operar — decisão, não código |

Nada foi copiado: o harness é bash (4.471 linhas), e o núcleo acabou de
consertar um bug que só existia no Linux. Bash-only reabriria esse caminho, e
o núcleo não depende de projeto nenhum de fora.
