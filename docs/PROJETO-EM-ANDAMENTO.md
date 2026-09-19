# Adicionar a um projeto que já existe

Diferente de um projeto novo: aqui já há código, histórico, convenções e talvez
configuração de agente. O risco não é não funcionar — é **funcionar demais no
primeiro dia** e bloquear trabalho legítimo até alguém desligar tudo.

---

## Antes de tudo: você talvez já esteja coberto

Se o plugin está instalado no escopo do usuário, **as guardas já valem em todos
os seus projetos**, sem você ter tocado em nenhum deles.

```bash
claude plugin list          # procure core@agent-core, Scope: user
```

Sendo assim, adotar um projeto não é ligar o núcleo — é **ensinar o núcleo sobre
aquele projeto**. Sem isso ele funciona com os padrões, que não conhecem o seu
comando de teste nem a sua branch base.

---

## 1. Diagnostique antes de mudar

```bash
node scripts/doctor.mjs /caminho/do/projeto
```

Não escreve nada. Diz o que já está ativo e o que falta.

---

## 2. Congele o ponto de partida

```bash
node scripts/baseline.mjs --days 7 --save antes
```

**Faça isso antes de mudar o fluxo de trabalho**, não depois. Num projeto em
andamento você já tem histórico de sessões — é o único momento em que dá para
medir o "antes" sem esperar uma semana.

Depois de algumas semanas:

```bash
node scripts/baseline.mjs --days 7 --compare antes
```

---

## 3. Ensine o projeto ao núcleo

Abra o Claude Code na pasta e rode:

```
/core-setup
```

O que realmente importa preencher, em ordem de impacto:

### `testPatterns` — o mais urgente

O `stop-verify` bloqueia o encerramento quando há código alterado e nenhum teste
rodou depois. Ele reconhece os comandos comuns (`rspec`, `vitest`, `pytest`,
`go test`…). **Se o seu projeto roda os testes de um jeito próprio, ele não vai
reconhecer** — e vai bloquear mesmo depois de você ter testado.

```json
{ "stopVerify": { "testPatterns": ["docker compose run --rm test", "make test"] } }
```

É o falso positivo mais provável no primeiro dia. Resolva primeiro.

### `projectCheck` — o que o núcleo roda ele mesmo

Dois usos. O primeiro: Rust, Java, C# e Scala não têm verificação por arquivo
confiável, e nessas o build completo roda uma vez antes de encerrar. O segundo:
**o comando de teste real**. `testPatterns` é "o agente *disse* que testou" — o
hook só sabe que o comando apareceu no transcript, não se passou.
`projectCheck` é "o núcleo *testou*": o hook roda o comando, e se um comando
de teste passa ali, isso **é a prova** — mesmo que o agente não tenha rodado
teste nenhum. O agente não consegue fingir verde.

```json
{ "stopVerify": { "projectCheck": ["make test", "cargo check"], "testPatterns": ["make test"] } }
```

Em projeto grande, meça o tempo antes: um check de três minutos a cada
encerramento vira um núcleo desligado na sexta-feira. Suíte lenta? Deixe em
`projectCheck` só o subconjunto rápido, ou só o typecheck.

### `baseBranch` e `trackerPatterns`

```json
{ "publish": { "baseBranch": "develop", "trackerPatterns": ["tracker[.]empresa[.]com/api"] } }
```

Sem `trackerPatterns`, o portão de publicação vale para PRs mas não reconhece
movimento de card.

---

## 4. O `CLAUDE.md` que já existe

O instalador **não sobrescreve** um `CLAUDE.md` existente. Mas vale olhar o seu
com outros olhos:

- **Acima de 60 linhas úteis?** Ele entra no prompt em todo turno. Procedimento
  detalhado ali é pago sempre para ser útil às vezes — mova para uma skill.
- **Tem passo a passo longo?** Vire skill com `/core-setup` ou pela skill
  `extrair-skill`.
- **Contradiz alguma guarda?** Se o `CLAUDE.md` manda instalar dependências à
  vontade e o `depGuard` bloqueia, o agente fica preso no meio. Alinhe os dois.

O que o núcleo acrescenta (precedência, fases, publicação) está em
`templates/CLAUDE.template.md` — copie as seções que fizerem sentido em vez de
substituir o seu.

---

## 5. Adoção por fases

Num projeto em andamento, ligar tudo de uma vez garante que ninguém saiba qual
mudança causou o quê — e a primeira fricção derruba o núcleo inteiro.

| Semana | Ligue | Por quê |
|---|---|---|
| 0 | baseline + `permissions.allow` | ganho de tempo puro, risco zero |
| 1 | `verify` e `depGuard` | interferem pouco no fluxo já existente |
| 2 | `stopVerify` | **o mais provável de gerar falso positivo** — só depois de `testPatterns` acertado |
| 3 | `publish` | muda como as pessoas entregam, não só o que a máquina faz |

Desligue o que ainda não vai usar, em `.claude/core.json`:

```json
{
  "stopVerify": { "enabled": false },
  "publish":    { "enabled": false }
}
```

E ligue um por semana, medindo entre eles.

---

## 6. Para a equipe receber também

Tudo acima cobre a **sua** máquina. Para quem clonar o repositório receber igual,
declare o plugin no projeto:

```bash
node scripts/install.mjs /caminho/do/projeto --marketplace --repo pastoriniMatheus/core-ai
```

Isso escreve `extraKnownMarketplaces` e `enabledPlugins` no `.claude/settings.json`
versionado. **Declarar não instala:** cada pessoa roda uma vez, dentro do projeto:

```bash
claude plugin marketplace add https://github.com/pastoriniMatheus/core-ai.git
claude plugin install core@agent-core
```

Faça commit do `.claude/settings.json` e do `.claude/core.json` — é a configuração
do projeto, e ela vale para todo mundo.

---

## Quando algo bloquear indevidamente

Não desligue o núcleo inteiro por causa de uma guarda. E antes de desligar
qualquer coisa, desconfie da configuração:

| Sintoma | Causa quase certa |
|---|---|
| `stop-verify` barra depois de eu ter testado | comando de teste fora de `testPatterns` |
| bloqueia um arquivo que não é código | extensão em `codeExtensions` que não deveria estar |
| `depGuard` barra um comando legítimo | o padrão casou por acidente — ajuste `depGuard.patterns` |
| o encerramento demora | `projectCheck` pesado demais para rodar sempre |

Um bloqueio indevido costuma ser configuração faltando, não hook errado.
