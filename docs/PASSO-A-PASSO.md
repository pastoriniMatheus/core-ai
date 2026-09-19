# Passo a passo

**Você não copia nada manualmente.** Um script faz tudo. A única decisão é o
escopo.

---

## Escolha o escopo

| | Por projeto (padrão) | Global |
|---|---|---|
| Comando | `install.mjs <projeto>` | `install.mjs --global` |
| Vale em | só naquele projeto | **todos** os projetos desta máquina |
| Instala | hooks + skills + `CLAUDE.md` + `CONTEXT.md` + `core.json` + permissões | só hooks + skills |
| Repete por projeto? | sim | não |

**Global** é conveniente e tem um preço real: as guardas valem mesmo — inclusive
num repositório de terceiro que você só foi ler. Bloquear `npm install` em código
que não é seu incomoda rápido.

**A combinação que funciona melhor:** global uma vez, e depois por projeto
naquele onde você trabalha de verdade. O segundo comando acrescenta o que só faz
sentido por projeto — comando de teste, branch base, tracker, vocabulário — e
não duplica os hooks.

**Fora dos dois escopos:** a statusline do núcleo (fase, card, se o
`stop-verify` vai bloquear) é preferência pessoal e vive em
`~/.claude/settings.json`, do usuário. O `/core-init` oferece instalar; ela
encadeia com a statusline que já existir, não substitui.

---

## Global (uma vez, para todos)

```bash
node ~/caminho/do/agent-core/scripts/install.mjs --global
```

Escreve em `~/.claude/`:

- os 5 hooks no `settings.json` do usuário
- as 6 skills em `~/.claude/skills/`
- os 4 comandos em `~/.claude/commands/`

**Aditivo:** hooks de outras ferramentas no mesmo evento são preservados, e uma
skill sua com o mesmo nome não é sobrescrita. Não cria `CLAUDE.md` nem
`CONTEXT.md` no seu home — esses são por projeto.

---

## Por projeto

### 1. Veja o que a máquina tem

```bash
node ~/caminho/do/agent-core/scripts/preflight.mjs ~/meu-projeto
```

Detecta a stack pelos manifestos, separa o que **bloqueia** do que é desejável,
e imprime o `core.json` sugerido. Se listar ferramenta obrigatória ausente,
instale antes.

### 2. Instale

```bash
node ~/caminho/do/agent-core/scripts/install.mjs ~/meu-projeto
```

O que aparece no projeto:

```
.claude/settings.json         permissões       → versionar
.claude/settings.local.json   hooks desta máquina → NÃO versionar (já no .gitignore)
.claude/skills/               6 skills         → versionar
.claude/commands/             4 comandos       → versionar
.claude/core.json             ajustes          → versionar
CLAUDE.md                     roteador         → versionar
CONTEXT.md                    vocabulário      → versionar
```

Nada aqui carrega o caminho da sua máquina, exceto o `settings.local.json`, que
fica fora do git de propósito.

### 3. Confirme

```bash
node ~/caminho/do/agent-core/scripts/doctor.mjs ~/meu-projeto
```

A linha que importa:

```
[ok]  hooks do core ligados (settings.local.json)  PostToolUse, PreToolUse, Stop, SessionStart
```

Se disser **`NENHUM hook do core esta ligado`**, pare — nada vai funcionar.

### 4. Configure o projeto

Abra o Claude Code no projeto e rode:

```
/core-setup
```

Ele pergunta tracker, credencial, comando de teste e branch base, e escreve nos
lugares certos. A credencial vai para `settings.local.json`, **nunca** para
arquivo versionado.

Ou edite `.claude/core.json` à mão com a sugestão do preflight.

### 5. Aceite o diálogo de confiança

Abra o projeto no Claude Code **interativamente uma vez** e aceite a confiança do
workspace.

Sem isso o Claude Code ignora as 48 regras de permissão e avisa no terminal. Os
hooks funcionam de qualquer forma — mas você continua confirmando cada teste à mão.

---

## Prove que está funcionando

Peça ao agente, dentro do projeto:

> Adicione a dependência lodash usando npm install.

Ele deve ser **bloqueado** com a escada da preguiça. Se instalar direto, algo não
está ligado — volte ao passo 3.

Para a verificação completa, com as cinco guardas e o veredito lido do transcript:

```bash
node ~/caminho/do/agent-core/scripts/aceitacao.mjs           # ~10 min
node ~/caminho/do/agent-core/scripts/aceitacao.mjs --offline # segundos
```

---

## Antes de usar num projeto real

```bash
node ~/caminho/do/agent-core/scripts/baseline.mjs --days 7 --save antes
```

Uma semana **antes** de mudar o fluxo de trabalho. Sem número de partida você não
vai saber se melhorou — só vai ter a sensação de que melhorou.

---

## Para a equipe

Tudo acima é local: funciona na sua máquina, não propaga.

Para o time inteiro receber ao clonar, publique este repositório e reinstale
apontando para ele:

```bash
node ~/caminho/do/agent-core/scripts/install.mjs ~/meu-projeto --marketplace --repo pastoriniMatheus/core-ai
```

O `.claude/settings.json` versionado **declara** o plugin. Mas declarar não
instala: cada pessoa roda estes dois comandos uma vez, dentro do projeto.

```bash
claude plugin marketplace add https://github.com/pastoriniMatheus/core-ai.git
claude plugin install core@agent-core
```

**Use a URL completa.** Com o atalho `pastoriniMatheus/core-ai` o Claude Code
clona por SSH e falha em máquina sem chave configurada; com `https://` ele usa a
credencial do `gh`. Testado com o SSH deliberadamente desabilitado.

Medido no repositório privado real: o plugin passa a
entregar hooks, skills e comandos em qualquer projeto — **sem** precisar do
repositório do núcleo na máquina.

Custo declarado pela própria ferramenta (`claude plugin details core@agent-core`):
**~1.378 tokens sempre presentes** por sessão, que são as descrições das skills e
dos comandos. O número sobe quando o núcleo ganha skill — medido em 0.7.2 com
`claude plugin details core@agent-core`, que é de onde ele deve sair sempre.
O corpo de cada uma só carrega quando é invocada.

---

## Quando algo bloquear indevidamente

Não desligue tudo. Cada guarda tem interruptor em `.claude/core.json`:

```json
{
  "depGuard":   { "enabled": false },
  "verify":     { "enabled": false },
  "stopVerify": { "enabled": false },
  "publish":    { "enabled": false }
}
```

Antes de desligar: bloqueio indevido costuma ser configuração faltando, não hook
errado. Um `stop-verify` que barra depois de você ter testado quase sempre
significa que o comando de teste do projeto não está em `testPatterns`.
