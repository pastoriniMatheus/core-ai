#!/usr/bin/env node
// CAMADA 0 - PreToolUse(Bash)
//
// Duas guardas que o plano original tratava como texto no prompt:
//
// 1. DEPENDENCIA: transforma a escada do Ponytail ("isso precisa existir?")
//    numa parada obrigatoria. Instrucao no prompt o modelo pode ignorar; uma
//    tool call negada, nao. Nao proibe instalar - forca justificar uma vez.
//
// 2. GRAFO VELHO: o pior erro de um mapa de codigo nao e nao ter mapa, e ter
//    mapa desatualizado - o agente responde com alta confianca sobre dado
//    errado. Se o grafo ficou para tras, avisa antes de consultar.

import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { run, pass, denyTool } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";

const ESCADA = `A escada da preguica inteligente, antes de adicionar uma dependencia:
  1. YAGNI      - isso precisa existir agora?
  2. Repo       - ja existe algo no projeto que resolve?
  3. Stdlib     - a biblioteca padrao da linguagem resolve?
  4. Plataforma - um recurso nativo resolve (ex: <input type="date">)?
  5. Instalado  - uma dependencia JA no projeto resolve?
  6. Uma linha  - da para escrever em uma linha?`;

function graphStale(cwd, limit) {
  const graph = join(cwd, "graphify-out", "graph.json");
  if (!existsSync(graph)) return null;
  const r = spawnSync("git", ["log", "-1", "--format=%cI"], {
    cwd, encoding: "utf8", timeout: 3000, windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout?.trim()) return null;

  const count = spawnSync("git", ["rev-list", "--count", `--since=${statSync(graph).mtime.toISOString()}`, "HEAD"], {
    cwd, encoding: "utf8", timeout: 3000, windowsHide: true,
  });
  const behind = parseInt(count.stdout?.trim() || "0", 10);
  return behind >= limit ? behind : null;
}

run(async (input) => {
  const cfg = loadConfig(input.cwd);
  const cmd = input.tool_input?.command || "";
  if (!cmd) pass();

  // Escape hatch: o agente reexecuta com o prefixo apos avaliar a escada.
  if (/CORE_DEP_OK=1/.test(cmd)) pass();

  if (cfg.depGuard.enabled) {
    const hit = cfg.depGuard.patterns.find((p) => new RegExp(p, "i").test(cmd));
    if (hit) {
      denyTool(
        `[core] Dependencia nova detectada: \`${cmd}\`\n\n${ESCADA}\n\n` +
          `Se a dependencia continuar sendo a resposta certa depois de subir a escada, ` +
          `explique em uma frase por que os degraus 1-6 nao resolvem e reexecute o comando ` +
          `prefixado com CORE_DEP_OK=1.`
      );
    }
  }

  if (cfg.graph.enabled && /\bgraphify\b/.test(cmd)) {
    const behind = graphStale(input.cwd, cfg.graph.staleAfterCommits);
    if (behind) {
      denyTool(
        `[core] O grafo esta ${behind} commits atrasado em relacao ao HEAD.\n` +
          `Consultar um mapa velho produz resposta confiante e errada - o erro mais caro que existe.\n` +
          `Rode \`graphify . --update\` antes, ou \`graphify hook install\` para nunca mais passar por isso.`
      );
    }
  }
});
