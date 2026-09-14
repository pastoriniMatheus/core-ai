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
 * Envolve o corpo do hook. Qualquer excecao vira exit 0 silencioso:
 * um hook com bug deve ser invisivel, nunca um bloqueio fantasma.
 */
export async function run(fn) {
  try {
    await fn(await readInput());
  } catch (err) {
    if (process.env.CORE_HOOK_DEBUG) emit(2, `[core-hook] ${err?.stack || err}`);
  }
  process.exit(0);
}
