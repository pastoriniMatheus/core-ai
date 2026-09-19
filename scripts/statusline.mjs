#!/usr/bin/env node
// A statusline do nucleo: uma linha, sempre visivel no rodape do Claude Code.
//
//   IMPLEMENTAR · PROJ-540 · prova ✗ 3 arq · publish bloqueou 14:02
//
// O Claude Code chama o comando da statusline com um JSON no stdin
// ({ transcript_path, cwd, session_id, model, ... }) a cada atualizacao. Este
// script le o transcript e responde o que os hooks vao responder no fim.
//
// ENCADEIA, NAO SUBSTITUI. Se ja havia uma statusline (Orca, ou qualquer
// outra), o /core-init a guarda em `statusLine.anterior` no settings.json, e
// este script a roda primeiro com o mesmo stdin — a linha final e
// "<anterior> │ <nucleo>". Tirar a statusline de outra ferramenta para por a
// nossa seria exatamente o tipo de sobreposicao que o doctor acusa.
//
// ponytail: sem cache — retrato() mede 72 ms num transcript de 18 MB porque
// readTail() so le os ultimos 4 MB. Se um dia passar de ~200 ms, gravar a
// ultima linha em .claude/core-state/statusline.cache e devolve-la no timeout.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { raizDoNucleo } from "./raiz.mjs";

let entrada = "";
try { entrada = readFileSync(0, "utf8"); } catch { /* sem stdin */ }
let ev = {};
try { ev = JSON.parse(entrada || "{}"); } catch { /* segue vazio */ }
const cwd = ev.cwd || ev.workspace?.current_dir || process.cwd();

// A statusline anterior, se houver, roda primeiro — com o MESMO stdin.
let anterior = "";
try {
  const st = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"));
  const cmd = st?.statusLine?.anterior;
  if (cmd) {
    // O Claude Code roda a statusline pelo Git Bash, tambem no Windows — a
    // anterior (a do Orca, por exemplo) e um script POSIX. `shell: true` aqui
    // seria cmd.exe, que responde "-z foi inesperado" e a linha some. Entao:
    // o mesmo bash que o Claude Code usa, se existir; senao o shell da maquina.
    // ponytail: dois caminhos fixos; ler a config do Claude Code se ela mudar.
    const gitBash = process.platform === "win32"
      ? [process.env.CLAUDE_CODE_GIT_BASH_PATH, "C:\\Program Files\\Git\\bin\\bash.exe"].find((p) => p && existsSync(p))
      : null;
    const r = gitBash
      ? spawnSync(gitBash, ["-c", cmd], { input: entrada, encoding: "utf8", timeout: 1500, windowsHide: true })
      : spawnSync(cmd, { input: entrada, encoding: "utf8", shell: true, timeout: 1500, windowsHide: true });
    anterior = (r.stdout || "").split("\n")[0].trim();
  }
} catch { /* sem anterior */ }

let nucleo = "";
try {
  const NUCLEO = raizDoNucleo(import.meta.url);
  const lib = (n) => import(pathToFileURL(join(NUCLEO, "hooks", "lib", n)).href);
  const [{ loadConfig }, { transcriptDaSessao }, { retrato, emLinha }] =
    await Promise.all([lib("config.mjs"), lib("transcript.mjs"), lib("painel.mjs")]);
  const t = ev.transcript_path && existsSync(ev.transcript_path) ? ev.transcript_path : transcriptDaSessao(cwd);
  nucleo = emLinha(retrato({ transcriptPath: t, cwd, cfg: loadConfig(cwd) }));
} catch {
  // A statusline nunca pode quebrar o rodape: sem nucleo, mostra o que houver.
}

process.stdout.write([anterior, nucleo].filter(Boolean).join(" │ ") + "\n");
