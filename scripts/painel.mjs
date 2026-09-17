#!/usr/bin/env node
// O painel do nucleo, no terminal.
//
//   node scripts/painel.mjs                     # ao vivo, redesenha a cada 2s
//   node scripts/painel.mjs --once              # um quadro e sai (e o que /core-painel roda)
//   node scripts/painel.mjs --projeto <dir> --intervalo 5 --no-color
//
// Le o transcript da sessao corrente do projeto e mostra o que os hooks vao
// ver: fase, card, prova (o stop-verify vai bloquear?), ultimo bloqueio, base
// externa. Nao escreve nada, nao cria estado, nao precisa de hook.

import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { raizDoNucleo } from "./raiz.mjs";

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const PROJETO = resolve(flag("projeto", process.cwd()));
const UMA_VEZ = args.includes("--once");
const CORES = !args.includes("--no-color") && Boolean(process.stdout.isTTY);
const INTERVALO = Math.max(1, parseInt(flag("intervalo", "2"), 10) || 2) * 1000;

const NUCLEO = raizDoNucleo(import.meta.url);
if (!NUCLEO) { console.error("\n  nao achei o nucleo (hooks/hooks.json) a partir deste script\n"); process.exit(1); }
const lib = (n) => import(pathToFileURL(join(NUCLEO, "hooks", "lib", n)).href);
const { loadConfig } = await lib("config.mjs");
const { transcriptDaSessao } = await lib("transcript.mjs");
const { retrato, emQuadro } = await lib("painel.mjs");

const cfg = loadConfig(PROJETO);

function quadro() {
  const t = transcriptDaSessao(PROJETO);
  const r = retrato({ transcriptPath: t, cwd: PROJETO, cfg });
  const largura = Math.min(100, Math.max(56, (process.stdout.columns || 80) - 2));
  let s = emQuadro(r, { cores: CORES, largura });
  if (!t) s += `\n  ${CORES ? "\x1b[2m" : ""}(nenhuma sessao do Claude Code encontrada para ${PROJETO})${CORES ? "\x1b[0m" : ""}`;
  return s;
}

if (UMA_VEZ) {
  console.log(quadro());
  process.exit(0);
}

// Ao vivo: limpa e redesenha. `q` ou Ctrl-C sai. E o ralph-watch em 30 linhas —
// porque a fonte ja existe (o transcript) e o parser ja existe (os hooks).
const desenha = () => {
  process.stdout.write("\x1b[2J\x1b[H");
  console.log(quadro());
  console.log(`${CORES ? "\x1b[2m" : ""}  ${new Date().toTimeString().slice(0, 8)} · q sai · atualiza a cada ${INTERVALO / 1000}s${CORES ? "\x1b[0m" : ""}`);
};
desenha();
const timer = setInterval(desenha, INTERVALO);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (k) => {
    const s = k.toString();
    if (s === "q" || s === "") { clearInterval(timer); process.stdout.write("\n"); process.exit(0); }
  });
}
