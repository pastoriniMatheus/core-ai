# Começar — e provar que funciona

Dez minutos, num projeto descartável. Não use um projeto real na primeira vez:
o objetivo aqui é ver os bloqueios acontecerem, e isso atrapalha trabalho de verdade.

---

## 1. Crie um projeto de teste

Qualquer stack serve. Em Go, que é o mais rápido de montar:

```bash
mkdir ~/teste-core && cd ~/teste-core
git init

cat > go.mod <<'EOF'
module teste

go 1.26
EOF

cat > fila.go <<'EOF'
package teste

// Soma devolve a soma de dois inteiros.
func Soma(a, b int) int { return a + b }
EOF

cat > fila_test.go <<'EOF'
package teste

import "testing"

func TestSoma(t *testing.T) {
	if Soma(2, 3) != 5 {
		t.Error("Soma(2,3) deveria ser 5")
	}
}
EOF

go test ./...        # tem que passar
git add -A && git commit -m "inicio"
```

## 2. Veja o que a máquina tem

```bash
node ~/caminho/do/agent-core/scripts/preflight.mjs ~/teste-core
```

Ele detecta a stack, separa o que **bloqueia** do que é apenas desejável, e
imprime o `core.json` sugerido. Se listar ferramenta obrigatória ausente,
instale antes de seguir.

## 3. Instale

```bash
node ~/caminho/do/agent-core/scripts/install.mjs ~/teste-core
```

O padrão é o **modo local**: os hooks apontam para o caminho deste repo na sua
máquina. Funciona na hora, sem publicar nada. (`--marketplace` é o modo de
distribuir para a equipe, e exige o repositório publicado.)

## 4. Confirme

```bash
node ~/caminho/do/agent-core/scripts/doctor.mjs ~/teste-core
```

A linha que importa:

```
[ok]  hooks do core ligados (modo local)  PostToolUse, PreToolUse, Stop, SessionStart
```

Se disser **`NENHUM hook do core esta ligado`**, pare aqui — nada mais vai
funcionar. Rode o install de novo e veja o erro.

## 5. Configure o projeto

Copie a sugestão do preflight para `~/teste-core/.claude/core.json`:

```json
{
  "stopVerify": {
    "projectCheck": ["go build ./...", "go vet ./..."],
    "testPatterns": ["go test"]
  },
  "publish": { "baseBranch": "main" }
}
```

## 6. Aceite o diálogo de confiança

Abra o projeto no Claude Code **interativamente** uma vez e aceite a confiança
do workspace.

Sem isso, o Claude Code ignora as 48 regras de `permissions.allow` e avisa no
terminal. **Os hooks funcionam de qualquer forma** — mas você continua
confirmando cada `go test` à mão, que é metade do ganho de tempo.

---

# Os quatro testes de aceitação

Rode cada um numa sessão do Claude Code dentro de `~/teste-core`. O resultado
esperado está ao lado. Se algum divergir, o sistema não está ligado direito.

### Teste 1 — guarda de dependência

> Adicione a dependência `github.com/google/uuid` usando `go get`.

**Esperado:** o comando é **negado** com a escada da preguiça (YAGNI, repo,
stdlib, plataforma, instalado, uma linha). O agente avalia e, na maioria dos
casos, conclui que não precisa da dependência.

**Se passar direto:** o `pre-bash-guard` não está ligado.

### Teste 2 — verificação pós-edição

> Crie `quebrado.go` com um erro de sintaxe deliberado, faltando fechar uma chave.

**Esperado:** a escrita é **bloqueada** com a saída do `gofmt` apontando a linha.

**Se passar direto:** o `post-edit-verify` não está ligado — ou a linguagem não
tem verificador por arquivo (Rust, Java, C# e Scala não têm; nesses casos é o
`projectCheck` que cobre, no teste 4).

### Teste 3 — prova antes de encerrar

> Adicione um campo `Nome string` ao pacote. **Não rode nenhum teste** e encerre.

**Esperado:** o encerramento é **bloqueado**, nomeando o arquivo sem prova.

**Se encerrar normalmente:** o `stop-verify` não está ligado, ou o comando de
teste do projeto não está em `testPatterns`.

### Teste 4 — portão de publicação

> Implemente qualquer coisa pequena e abra a PR com `gh pr create --fill`.

**Esperado:** a PR é **negada**. O agente para, relata o que verificou e o que
ficou aberto, e **pergunta** antes de publicar.

**Se abrir a PR:** o `pre-publish-guard` não está ligado.

---

## Prova de que os hooks realmente rodaram

Não confie na resposta do agente — ele pode ter recusado por outro motivo. Os
disparos ficam registrados no transcript:

```bash
cd ~/.claude/projects/<slug-do-projeto>
grep -oh "\[core\][^\"]\{0,80\}" *.jsonl | sort | uniq -c
```

Cada linha `[core]` é um bloqueio que aconteceu de verdade.

---

## Depois que os quatro passarem

**Congele o ponto de partida antes de mudar qualquer fluxo de trabalho:**

```bash
node ~/caminho/do/agent-core/scripts/baseline.mjs --days 7 --save antes
```

Sem número de partida não há como saber se uma mudança ajudou — só a sensação
de que ajudou.

**Em um projeto real, vá por fases.** Instalar tudo de uma vez garante que
ninguém saiba qual mudança causou o quê. A ordem está no `README.md`.

---

## Quando algo bloquear indevidamente

Não desligue o núcleo inteiro. Cada guarda tem um interruptor próprio em
`.claude/core.json`:

```json
{
  "depGuard":   { "enabled": false },
  "verify":     { "enabled": false },
  "stopVerify": { "enabled": false },
  "publish":    { "enabled": false }
}
```

Mas antes de desligar: um bloqueio indevido costuma ser configuração faltando,
não hook errado. Um `stop-verify` que barra depois de você ter testado quase
sempre significa que o comando de teste do projeto não está em `testPatterns`.

---

# Atalho: o teste automatizado

Em vez dos passos manuais acima, um comando faz tudo — cria o projeto, instala,
roda as quatro sessoes reais e confere no transcript se cada guarda disparou:

```bash
node scripts/aceitacao.mjs
```

| Modo | Comando | Tempo |
|---|---|---|
| Rapido | `node scripts/aceitacao.mjs --offline` | segundos |
| Completo | `node scripts/aceitacao.mjs` | ~10 min |
| Completo, guardando o projeto | `node scripts/aceitacao.mjs --manter` | ~10 min |

O modo rapido valida instalacao, diagnostico e as quatro guardas chamadas
diretamente. O completo acrescenta o que realmente importa: as sessoes de verdade
do Claude Code, com o veredito lido do transcript e nao da resposta do agente.

**Nao precisa instalar nada.** Node ja vem com o Claude Code, e o projeto de
teste e JavaScript puro usando `node --test` — sem Go, Ruby ou Python.

O projeto de teste e criado em um diretorio temporario e apagado no fim
(exceto com `--manter`). Nada toca os seus repositorios.
