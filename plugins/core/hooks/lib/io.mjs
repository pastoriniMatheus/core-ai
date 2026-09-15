// Entrada/saida padronizada de hooks do Claude Code.
// Contrato: hook le JSON no stdin, sinaliza decisao por exit code ou JSON no stdout.
//   exit 0  -> segue o fluxo
//   exit 2  -> bloqueia; stderr volta para o modelo como feedback acionavel
// Regra de ouro: hook que quebra nao pode derrubar a sessao. Tudo degrada para exit 0.

import { writeSync } from "node:fs";

// process.stdout.write para um pipe e ASSINCRONO no Windows: um process.exit()
// logo em seguida descarta a saida, e o hook nega a acao sem dizer por que.
// writeSync direto no file descriptor e sincrono em toda plataforma.
function emit(fd, text) {
  try {
    writeSync(fd, text.endsWith("\n") ? text : text + "\n");
  } catch {
    /* pipe fechado: nada a fazer */
  }
}

export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Segue o fluxo sem dizer nada. */
export function pass() {
  process.exit(0);
}

/** Bloqueia e devolve `reason` ao modelo para que ele corrija e tente de novo. */
export function block(reason) {
  emit(2, reason);
  process.exit(2);
}

/** Nega uma tool call antes de executar, com motivo visivel ao modelo. */
export function denyTool(reason) {
  emit(
    1,
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

/**
 * Envolve o corpo do hook.
 *
 * `aoFalhar` decide o que uma excecao significa, e a escolha e por hook:
 *
 *   "passa"   hook consultivo. Um bug nele deve ser invisivel — o pior que
 *             acontece e perder um aviso.
 *   "bloqueia" GUARDA. Um bug aqui, tratado como "passa", vira falha ABERTA: a
 *             guarda morre e nada avisa, que e exatamente o que ela existia
 *             para impedir. Falhar fechado e recuperavel — a mensagem diz como
 *             desligar a guarda em .claude/core.json — e falhar aberto nao.
 *
 * O cwd tambem e normalizado aqui: um evento sem esse campo fazia join(undefined)
 * lancar TypeError, que virava exit 0 silencioso no meio de uma guarda.
 */
export async function run(fn, { aoFalhar = "passa" } = {}) {
  try {
    const input = await readInput();
    input.cwd = input.cwd || process.cwd();
    await fn(input);
  } catch (err) {
    const detalhe = err?.stack || String(err);
    if (process.env.CORE_HOOK_DEBUG) emit(2, `[core-hook] ${detalhe}`);
    if (aoFalhar === "bloqueia") {
      emit(
        2,
        "[core] A guarda falhou e por isso esta BLOQUEANDO — falhar aberto seria pior.\n\n" +
          detalhe.split("\n")[0] + "\n\n" +
          "Isso e um bug do nucleo. Relate, e se precisar destravar agora, desligue\n" +
          "a guarda em .claude/core.json (ver docs/CONFIGURACAO.md)."
      );
      process.exit(2);
    }
  }
  process.exit(0);
}
