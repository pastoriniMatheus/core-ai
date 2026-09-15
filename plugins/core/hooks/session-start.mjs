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

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readInput } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";

/**
 * O checkpoint da sessao anterior, se ainda fizer sentido mostrar.
 *
 * Retomar e o momento em que o contexto vale mais e existe menos. Sem isto,
 * "onde eu parei" custa reler o transcript inteiro — quando nao custa refazer.
 */
function checkpointRecente(cwd, cfg) {
  const p = join(cwd, ".claude", "core-state", "checkpoint.md");
  if (!existsSync(p)) return null;
  const horas = (Date.now() - statSync(p).mtimeMs) / 3600000;
  // Um retrato velho atrapalha mais do que ajuda: o trabalho ja seguiu por
  // outro caminho e o checkpoint aponta para um estado que nao existe mais.
  if (horas > (cfg.checkpoint?.validoPorHoras ?? 168)) return null;
  try { return readFileSync(p, "utf8").trim(); } catch { return null; }
}

function main(input) {
  const cwd = input.cwd || process.cwd();
  const cfgPath = join(cwd, ".claude", "core.json");
  const pendencias = [];
  const cfg = loadConfig(cwd);
  const retomada = checkpointRecente(cwd, cfg);

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

  if (!pendencias.length && !retomada) return;

  const blocos = [];
  if (retomada) {
    blocos.push(
      "Esta sessao continua um trabalho interrompido. O checkpoint abaixo foi",
      "gravado no fim da sessao anterior:",
      "",
      retomada.split("\n").map((l) => "  " + l).join("\n"),
      "",
      "Confirme o estado antes de agir sobre ele — o checkpoint e um retrato do",
      "que foi feito, nao uma garantia de que continua valendo. Se o usuario",
      "pedir outra coisa, o pedido dele vence o checkpoint.",
      "",
    );
  }

  const texto = !pendencias.length ? "" : [
    "O nucleo de diretrizes (agent-core) esta ativo neste projeto, mas nao foi configurado:",
    "",
    ...pendencias.map((p) => `  - ${p}`),
    "",
    "Se o usuario for trabalhar em codigo ou em tarefas do tracker nesta sessao, ofereca",
    "rodar `/core-setup` (uma vez por projeto, leva um minuto). Nao interrompa o que ele",
    "pediu para fazer isso — mencione em uma linha e siga.",
  ].join("\n");

  const completo = blocos.length
    ? blocos.join("\n") + (texto ? "\n" + texto : "")
    : texto;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: completo },
    })
  );
}

readInput()
  .then((input) => { try { main(input); } catch { /* nunca derrubar a sessao */ } })
  .catch(() => {});
