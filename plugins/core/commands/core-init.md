---
description: Deixa o projeto pronto de ponta a ponta — detecta a stack, instala o que falta, configura, constrói o grafo e confere. Rode uma vez por projeto.
argument-hint: [--sem-ferramentas]
---

Leve este projeto de "plugin instalado" a **pleno**, numa passada só.

O plugin entrega hooks e skills no momento em que é instalado. O que ele não
sabe é o comando de teste **deste** projeto, a branch base, o tracker da equipe,
nem quais ferramentas externas a máquina tem. É isso que este comando resolve.

## Princípio

**Descobrir antes de perguntar, e perguntar uma vez só.** Cada pergunta que o
usuário responde sobre algo escrito no `package.json` é tempo dele gasto à toa.
Junte tudo o que não dá para inferir numa única rodada de perguntas, no fim do
passo 2 — não uma pergunta por etapa.

---

## 1. Levante o terreno

```bash
node $AGENT_CORE_ROOT/scripts/preflight.mjs "."
node $AGENT_CORE_ROOT/scripts/tracker-setup.mjs --projeto "." --detectar
```

O primeiro detecta a stack pelos manifestos e diz o que falta na máquina. O
segundo responde se o projeto **já** fala com um tracker por MCP — se responder
um servidor, a credencial já existe e não se pergunta nada sobre ela.

Olhe também, sem perguntar:

- `.claude/core.json` — já existe configuração? Então é reconfiguração
- `CLAUDE.md`, `README.md` — costumam citar a URL do tracker e o comando de teste
- `package.json`, `Gemfile`, `Makefile` — o comando de teste real
- `git symbolic-ref refs/remotes/origin/HEAD` — a branch base

## 2. Pergunte o que sobrou

Uma rodada de perguntas, com as opções que você já descobriu marcadas como
padrão. Tipicamente sobra:

| | Quando perguntar |
|---|---|
| tracker e credencial | só se o passo 1 não achou MCP nem configuração |
| instalar ferramentas externas | sempre — muda a máquina dele, é decisão dele |
| Graphify local ou servidor MCP | só se ele aceitou instalar o Graphify |
| base de conhecimento externa | sempre, em uma linha — a maioria dos projetos **não** precisa |

Sobre a última: pergunte se ele lida com **material de terceiro, grande e
estável** que hoje ninguém versiona — manual de integração, norma, guia de
migração de framework. Se a resposta for não, pule sem insistir: a base externa
custa uma conta Google descartável e um ritual de curadoria, e num projeto que
não tem esse material ela é só manutenção.

Se `$ARGUMENTS` contiver `--sem-ferramentas`, pule a parte de instalação e não
pergunte sobre ela.

## 3. Instale o que ele autorizou

```bash
node $AGENT_CORE_ROOT/scripts/ferramentas.mjs --instalar --graphify local
```

**Ponytail** entra como plugin e passa a valer em tudo. **Graphify** precisa de
`uv`; se faltar, diga onde obter e siga sem ele — o núcleo funciona sem.

`notebooklm-py` só com pedido explícito: é biblioteca não-oficial sobre API não
documentada, a credencial dela é de conta Google inteira, e o repositório
continua sendo a fonte de verdade da equipe. Se ele quiser, a configuração toda
— staging, índice, guardas — está em `/core-externa`; instalar sem rodar esse
comando entrega a parte perigosa sem a parte útil.

## 4. Configure o projeto

Escreva `.claude/core.json` com o que foi descoberto e respondido:

```json
{
  "stopVerify": {
    "projectCheck": ["<o comando de teste REAL deste projeto>", "<build ou typecheck, se a linguagem precisar>"],
    "testPatterns": ["<o comando de teste REAL deste projeto>"]
  },
  "publish": {
    "baseBranch": "<a branch base de verdade>",
    "trackerPatterns": ["<a URL da API do tracker>"]
  }
}
```

**`testPatterns` é o mais urgente.** O `stop-verify` bloqueia o encerramento
quando há código alterado e nenhum teste rodou depois. Se o projeto roda os
testes de um jeito próprio — dentro de container, por um `make` — e isso não
estiver aqui, ele bloqueia **mesmo depois** de o teste ter rodado. É o falso
positivo mais provável do primeiro dia.

**O comando de teste vai nos dois lugares, e a diferença importa.**
`testPatterns` é "o agente *disse* que testou": o `stop-verify` procura o
comando no transcript, e só sabe que ele foi invocado — não se passou.
`projectCheck` é "o núcleo *testou*": o hook roda o comando ele mesmo, antes
de encerrar, e um comando de teste que passa ali **é a prova** — mesmo que o
agente não tenha rodado teste nenhum. O agente não consegue fingir verde. Se a
suite for lenta demais para rodar a cada encerramento, deixe em `projectCheck`
só o subconjunto rápido, ou só o typecheck.

Credencial de tracker vai pelo `tracker-setup.mjs`, nunca escrita à mão: ele
testa a conexão antes de gravar, e recusa gravar se o `.gitignore` do
repositório não proteger o arquivo.

Preencha também a seção "Este projeto" do `CLAUDE.md`, se ela ainda tiver os
placeholders `<comando>`.

## 4b. A statusline do núcleo, se ele quiser

Ofereça — e só instale com "sim":

> Quer a linha do núcleo no rodapé do Claude Code? Ela mostra fase, card, se o
> stop-verify vai bloquear, e o último bloqueio — sem precisar chamar nada.

Se ele quiser, edite `~/.claude/settings.json` (escopo do **usuário**, nunca o
do projeto — statusline é preferência pessoal):

1. Se já existe `statusLine.command`, guarde o valor em `statusLine.anterior`.
   A nossa **encadeia**, não substitui: a linha final é `<anterior> │ <núcleo>`.
2. Descubra o caminho **absoluto** do script — a statusline roda fora de
   qualquer sessão, sem variável de ambiente do núcleo:

   ```bash
   echo $AGENT_CORE_ROOT/scripts/statusline.mjs
   ```

   Escreva `statusLine.type = "command"` e `statusLine.command` = `node`
   seguido desse caminho.
3. Diga como desfazer: apagar `statusLine`, ou devolver `anterior` a `command`.

O mesmo retrato existe sob demanda (`/core-painel`) e ao vivo, noutra janela
(`node $AGENT_CORE_ROOT/scripts/painel.mjs`). As três leem o transcript; nada
aqui cria estado nem hook.

## 5. Construa o grafo, se o Graphify entrou

```bash
node $AGENT_CORE_ROOT/scripts/ferramentas.mjs --projeto "." --grafo
```

E **meça o tempo**. É o número que decide se o modo servidor MCP vale a pena, e
ele só existe depois de rodar. Um build de três minutos a cada commit é um
Graphify que alguém vai desligar na sexta-feira.

O hook de reconstrução entra junto: sem ele o grafo envelhece e passa a
responder com alta confiança sobre estrutura que mudou — o pior erro de um mapa
não é faltar, é estar velho.

## 5b. Base de conhecimento externa, se ele quis

```bash
node $AGENT_CORE_ROOT/scripts/externa.mjs preparar --projeto "." --modo local
```

Cria a pasta de staging, o índice versionado `docs/base-externa.md`, e as linhas
de `.gitignore` que impedem a credencial de ser commitada.

Depois disso, **pare e diga que o resto é dele**: `notebooklm login` abre um
navegador e pede uma conta Google — que precisa ser **descartável**, porque o
arquivo gerado é credencial de conta inteira, não um token revogável.

Não tente autenticar por ele, e não sugira usar a conta corporativa "só para
testar" — é o primeiro passo do modo de falha que essa feature inteira existe
para evitar.

Se o projeto for usar a base a sério, `/core-externa` cobre o resto: a escolha
local × equipe, a caderneta, e o servidor de teste.

## 6. Congele o ponto de partida

```bash
node $AGENT_CORE_ROOT/scripts/baseline.mjs --days 7 --save antes
```

Num projeto que já tem histórico de sessões, este é o único momento em que dá
para medir o "antes" sem esperar uma semana. Sem número de partida, nenhuma
mudança seguinte pode ser julgada — só sentida.

## 7. Confira

```bash
node $AGENT_CORE_ROOT/scripts/doctor.mjs "."
```

Zero erros é o alvo. Avisos sobre ferramenta ausente são aceitáveis; "nenhum
hook ligado" e "nenhuma skill instalada" não são.

## 8. Diga o que mudou, e o que falta

Em poucas linhas:

- **o que passou a valer**: verificação a cada edição, prova antes de encerrar,
  e PR e movimento de card pedindo autorização explícita, por PR e por card,
  toda vez
- **o que continua sendo dele**: fechar card, que nenhum agente faz
- **o que ficou pendente**: aceitar o diálogo de confiança do workspace (sem
  isso as regras de permissão são ignoradas), e qualquer ferramenta que ele não
  quis instalar agora

Não faça commit. A configuração é compartilhada com a equipe — mostre o diff e
pergunte.

<!-- agent-core -->
