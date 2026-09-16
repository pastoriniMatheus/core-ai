# Máquina nova, do zero

Testado em **Windows 11 / Node 24.14 / Claude Code 2.1.263 / git 2.53 / gh 2.91**.
No Mac e no Linux os comandos são os mesmos; só os instaladores dos pré-requisitos mudam.

Tempo: uns 15 minutos, quase todos esperando download.

---

## 1. Pré-requisitos

### Node 18 ou maior

O Claude Code é distribuído por npm, então o Node vem primeiro — e é a única
runtime que os hooks do núcleo exigem.

- **Windows / Mac:** https://nodejs.org (versão LTS)
- **Linux:** o gerenciador da distribuição, ou https://github.com/nvm-sh/nvm

```bash
node --version    # precisa ser v18 ou maior
```

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

Na primeira execução ele pede login. Faça antes de seguir.

### git e GitHub CLI

```bash
git --version
gh --version
```

O `gh` não vem por padrão: https://cli.github.com

### Autentique o GitHub

O repositório é **privado**, então sem autenticação nada baixa.

```bash
gh auth login
```

Escolha **HTTPS** quando ele perguntar pelo protocolo, e aceite quando ele
oferecer configurar as credenciais do git. É isso que permite o passo 2 sem
chave SSH.

Confira:

```bash
gh auth status
git ls-remote https://github.com/pastoriniMatheus/core-ai.git  # tem que listar refs
```

Se o `ls-remote` pedir senha ou falhar, a autenticação não ficou pronta —
resolva aqui antes de seguir.

---

## 2. Instale o núcleo

**Dois comandos, uma vez por máquina:**

```bash
claude plugin marketplace add https://github.com/pastoriniMatheus/core-ai.git
claude plugin install core@agent-core
```

> **Use a URL completa, não `pastoriniMatheus/core-ai`.**
> Com o atalho, o Claude Code clona por SSH (`git@github.com:…`) e falha numa
> máquina sem chave SSH configurada. Com a URL `https://`, ele usa a credencial
> que o `gh` acabou de configurar. Testado com o SSH deliberadamente desabilitado.

Confirme:

```bash
claude plugin details core@agent-core
```

Você deve ver:

```
Skills (9)   baseline, ci-local, core-doctor, core-setup, economia-de-contexto,
             entregar-trabalho, extrair-skill, fase, mapear-codigo
Hooks (4)    PostToolUse, PreToolUse, Stop, SessionStart  (harness-only)
Always-on:   ~1.378 tok  added to every session
```

Pronto: as **guardas e as skills já valem em qualquer projeto** desta máquina.
Você não precisa do repositório do núcleo clonado no disco.

---

## 3. Por projeto

O plugin entrega hooks e skills. O que ele **não** sabe é o comando de teste do
seu projeto, a branch base e o tracker — isso é por projeto.

Abra o Claude Code na pasta do projeto e rode:

```
/core-setup
```

Ele pergunta o que falta e escreve nos lugares certos. A credencial do tracker
vai para `.claude/settings.local.json`, que fica **fora do git**.

### Aceite o diálogo de confiança

Na primeira vez que abrir cada projeto, aceite a confiança do workspace.

Sem isso o Claude Code **ignora as regras de permissão** e avisa no terminal.
Os hooks funcionam de qualquer forma, mas você confirma cada teste na mão.

---

## 4. Prove que está valendo

Peça ao agente, dentro de um projeto:

> Adicione a dependência lodash usando npm install.

Ele tem de ser **bloqueado** com a escada da preguiça (YAGNI, repo, stdlib,
plataforma, dependência instalada, uma linha).

Se instalar direto, algo não ligou — volte ao passo 2 e rode
`claude plugin details core@agent-core`.

---

## Se quiser desenvolver o núcleo nesta máquina

Só necessário para **editar** o núcleo, não para usá-lo.

```bash
git clone https://github.com/pastoriniMatheus/core-ai.git
cd core-ai
node tests/hooks.test.mjs           # 90 casos, segundos
node scripts/aceitacao.mjs --offline
```

Para testar alterações locais antes de publicar, instale por caminho em vez de
marketplace:

```bash
node scripts/install.mjs /caminho/do/projeto     # aponta para este clone
```

---

## Referência rápida

| Situação | Comando |
|---|---|
| Ver o que está instalado | `claude plugin list` |
| Ver o inventário e o custo | `claude plugin details core@agent-core` |
| Atualizar para a versão nova | `claude plugin marketplace update agent-core` |
| Desligar temporariamente | `claude plugin disable core@agent-core` |
| Remover | `claude plugin uninstall core@agent-core` |

**Cuidado:** `claude plugin marketplace remove agent-core` **desinstala o plugin
junto** — o plugin some do `plugin list`. Para desligar sem perder o
marketplace, use `disable`.

### Quando uma guarda atrapalhar

Não desligue o núcleo inteiro. Cada uma tem interruptor, por projeto, em
`.claude/core.json`:

```json
{
  "depGuard":   { "enabled": false },
  "verify":     { "enabled": false },
  "stopVerify": { "enabled": false },
  "publish":    { "enabled": false }
}
```

É o que fazer num repositório de terceiro que você só foi ler.
