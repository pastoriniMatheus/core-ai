---
description: Configura o núcleo neste projeto — tracker, credencial, comandos de teste e branch base. Rode uma vez por projeto.
---

Configure o núcleo para **este** projeto. Uma vez por projeto; leva um minuto.

## Regra que não se quebra

**Credencial nunca entra em `.claude/core.json`.** Esse arquivo é versionado e vai
para o repositório da equipe. Token em repositório é vazamento, mesmo em repo
privado — ele entra no histórico e não sai mais.

O `core.json` guarda apenas o **nome** da variável de ambiente. O valor mora em
`.claude/settings.local.json`, que não é versionado.

## Passos

### 1. Descubra o que der para descobrir sozinho

Antes de perguntar qualquer coisa, olhe o projeto. Perguntar o que está escrito
no `package.json` desperdiça o tempo do usuário.

- comando de teste: `package.json` (scripts), `Gemfile`, `pyproject.toml`, `go.mod`, `Makefile`, `Cargo.toml`
- branch base: `git symbolic-ref refs/remotes/origin/HEAD`, ou as branches que existem
- linguagem e se precisa de check de projeto (Rust, Java, C#, TS com `tsconfig.json`)
- CI: `.github/workflows/` diz qual lane é a que vale

### 2. Pergunte só o que falta

Use **uma** pergunta com múltipla escolha para o tracker (as opções: Plane,
Linear, Jira, GitHub Issues, nenhum) e, se houver tracker, uma segunda para a URL.
Confirme o que você descobriu sozinho em vez de perguntar do zero.

O que você precisa saber, no fim:

| | |
|---|---|
| tracker | qual, e a URL da API |
| credencial | o **nome** da variável de ambiente, e o valor (que não será versionado) |
| estados | como se chamam o de revisão e o final, nas palavras do time |
| branch base | para onde as PRs vão |
| teste | o comando que prova o trabalho |
| check de projeto | build/typecheck completo, se a linguagem precisar |

### 3. Escreva `.claude/core.json` — versionado

```json
{
  "publish": {
    "trackerPatterns": ["plane[.]exemplo[.]com/api"],
    "reviewState": "In Review",
    "doneState": "Done",
    "baseBranch": "develop",
    "tokenEnv": "PLANE_API_TOKEN"
  },
  "stopVerify": {
    "projectCheck": ["npx tsc --noEmit"],
    "testPatterns": ["vitest", "rspec"]
  }
}
```

`trackerPatterns` são regex testadas contra o comando inteiro. Escape o ponto
(`[.]`) para não casar com qualquer caractere.

### 4. Escreva a credencial em `.claude/settings.local.json` — NÃO versionado

```json
{
  "env": { "PLANE_API_TOKEN": "<valor>" }
}
```

Depois **confirme** que ele está no `.gitignore`:

```bash
git check-ignore -v .claude/settings.local.json
```

Se o comando não retornar nada, o arquivo **não** está ignorado — acrescente ao
`.gitignore` antes de escrever o token. Verifique isso antes, nunca depois.

Se o time preferir variável de ambiente da máquina em vez de arquivo, melhor
ainda: diga como exportar e não escreva o valor em lugar nenhum.

### 5. Preencha a seção "Este projeto" do `CLAUDE.md`

Troque os `<comando>` pelos comandos reais. Um `CLAUDE.md` com placeholder é
pior que nenhum: o agente lê o placeholder como se fosse instrução.

### 6. Confirme

```bash
node {{CORE_ROOT}}/scripts/doctor.mjs "{{PROJECT}}"
```

## Ao terminar

Diga em duas linhas o que ficou configurado e **o que vai mudar no dia a dia**:
que a partir de agora PR e movimento de card pedem autorização explícita, e que
o estado final do card continua sendo movido à mão por quem revisa.

Não faça commit. Configuração de equipe é decisão do usuário — mostre o diff e
pergunte.
