---
description: Configura o acesso ao tracker (Plane, Linear, Jira, GitHub Issues) neste projeto. Pergunta URL e token, testa a conexão e grava nos lugares certos.
argument-hint: [--testar]
---

Configure o acesso ao tracker **deste** projeto.

Se `$ARGUMENTS` contiver `--testar`, pule direto para o passo 4.

## 1. Descubra antes de perguntar

**Primeiro de tudo**, veja se o projeto já fala com um tracker por MCP:

```bash
node $AGENT_CORE_ROOT/scripts/tracker-setup.mjs --projeto "." --detectar
```

Se devolver um servidor, o acesso **já existe** — URL, workspace e token estão no
env dele. Nesse caso não peça credencial nenhuma: diga o que encontrou e pergunte
apenas se o usuário quer que o portão de publicação reconheça esse tracker. Para
isso basta escrever `publish.trackerPatterns` e `publish.tracker` no `core.json`,
sem tocar em token.

Perguntar credencial a quem já configurou tudo é a forma mais rápida de o time
concluir que a ferramenta não entende o próprio ambiente.

Se devolver `null`, siga. Olhe também:

- `.claude/core.json` — já existe `publish.tracker`? Então é reconfiguração
- `CLAUDE.md`, `README.md` — costumam citar a URL do tracker
- as skills em `.claude/skills/` e no diretório do usuário — uma skill do time
  que mencione o tracker provavelmente já tem a URL e o formato dos IDs

## 2. Pergunte só o que falta

Use **uma** pergunta de múltipla escolha para o tracker (Plane, Linear, Jira,
GitHub Issues) e confirme o que você já descobriu em vez de perguntar do zero.

O que você precisa no fim:

| Tracker | Campos |
|---|---|
| Plane | URL da instância e o **workspace slug** |
| Linear | nada além do token |
| Jira | URL e o **email** da conta |
| GitHub Issues | nada além do token |

**Onde o usuário acha o token:**

- **Plane** — avatar no canto → *Settings* → *API tokens* → *Add API token*
- **Linear** — *Settings* → *API* → *Personal API keys*
- **Jira** — id.atlassian.com → *Security* → *API tokens*
- **GitHub** — `gh auth token`, ou Settings → Developer settings → Tokens

Peça o token por último e diga que ele **não vai para nenhum arquivo versionado**.

## 3. Grave pelo script, nunca à mão

```bash
echo "<token>" | node $AGENT_CORE_ROOT/scripts/tracker-setup.mjs \
  --projeto "." --tracker plane --url https://plane.exemplo.com --workspace evolution
```

O token vai por **stdin**, não por argumento: `argv` aparece em `ps`, fica no
histórico do shell e vaza em log de CI.

O script, nesta ordem:

1. **recusa gravar** se `.claude/settings.local.json` não estiver no `.gitignore`
2. **testa a conexão** de verdade
3. só então grava — token em `settings.local.json`, resto em `core.json`

Se o teste falhar, **nada é gravado**. Relate o erro ao usuário em vez de gravar
uma credencial que não funciona: configuração que parece pronta e falha no
primeiro uso real é pior que configuração ausente.

## 4. Teste

```bash
node $AGENT_CORE_ROOT/scripts/tracker-setup.mjs --projeto "." --testar
```

## 5. Diga o que muda no dia a dia

Duas frases, não mais:

- o portão de publicação agora **reconhece comandos do tracker**: mover card pede
  autorização explícita, toda vez
- o estado final do card continua sendo movido **à mão por quem revisa** — esse
  bloqueio não tem escape, nem com autorização

Se o projeto ainda não tem uma skill que saiba **buscar** cards deste tracker,
ofereça criar uma (a skill `extrair-skill` descreve o formato). O núcleo garante
que nada seja publicado sem permissão; ele não sabe consultar a API de ninguém.

## Nunca

- Escrever o token em `.claude/core.json`, `CLAUDE.md` ou qualquer arquivo
  versionado. O `core.json` guarda o **nome** da variável, jamais o valor.
- Repetir o token na sua resposta, nem truncado.
- Fazer commit. Configuração de projeto é decisão do usuário — mostre o diff e
  pergunte.

<!-- agent-core -->
