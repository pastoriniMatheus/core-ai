#!/usr/bin/env node
// SessionStart - deteccao de projeto nao configurado
//
// O nucleo funciona com os defaults, mas os defaults nao sabem o comando de
// teste do projeto, a branch base nem o tracker da equipe. Sem isso, metade do
// valor fica na mesa em silencio: o portao de publicacao nao reconhece o card,
// o check de projeto nao roda, o stop-verify pode nao reconhecer a suite.
//
// Configuracao que ninguem lembra de fazer e configuracao que nao existe.
// Este hook faz a primeira sessao do projeto avisar.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readInput } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";

function main(input) {
  const cwd = input.cwd || process.cwd();
  const cfgPath = join(cwd, ".claude", "core.json");
  const pendencias = [];

  if (!existsSync(cfgPath)) {
    pendencias.push("`.claude/core.json` nao existe — o nucleo esta rodando so com defaults");
  } else {
    const cfg = loadConfig(cwd);
    let bruto = {};
    try { bruto = JSON.parse(readFileSync(cfgPath, "utf8")); } catch { /* defaults */ }

    if (!cfg.publish.trackerPatterns.length) {
      pendencias.push("**tracker nao configurado** — o portao de publicacao nao reconhece comandos de card, so PRs");
    }
    if (!cfg.stopVerify.projectCheck.length) {
      pendencias.push("**check de projeto vazio** — linguagens sem verificacao por arquivo (Rust, Java, C#, typecheck de TS) ficam descobertas");
    }
    if (bruto.publish?.baseBranch === undefined) {
      pendencias.push(`**branch base** nao declarada (usando \`${cfg.publish.baseBranch}\`)`);
    }
  }

  const claudeMd = join(cwd, "CLAUDE.md");
  if (existsSync(claudeMd) && readFileSync(claudeMd, "utf8").includes("<comando>")) {
    pendencias.push("`CLAUDE.md` ainda tem os placeholders `<comando>` do template");
  }

  if (!pendencias.length) return;

  const texto = [
    "O nucleo de diretrizes (agent-core) esta ativo neste projeto, mas nao foi configurado:",
    "",
    ...pendencias.map((p) => `  - ${p}`),
    "",
    "Se o usuario for trabalhar em codigo ou em tarefas do tracker nesta sessao, ofereca",
    "rodar `/core-setup` (uma vez por projeto, leva um minuto). Nao interrompa o que ele",
    "pediu para fazer isso — mencione em uma linha e siga.",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: texto },
    })
  );
}

readInput()
  .then((input) => { try { main(input); } catch { /* nunca derrubar a sessao */ } })
  .catch(() => {});
