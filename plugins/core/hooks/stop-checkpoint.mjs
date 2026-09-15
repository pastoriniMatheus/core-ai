#!/usr/bin/env node
// CAMADA 0 - Stop - grava onde a sessão parou
//
// Não bloqueia nada: é registro, não guarda. Roda depois do stop-verify e
// escreve `.claude/core-state/checkpoint.json` com o suficiente para a próxima
// sessão retomar — card em foco, branch, arquivos tocados, se houve prova, e o
// que o agente estava dizendo quando parou.
//
// Depender de alguém lembrar de anotar onde parou é a mesma aposta que este
// núcleo recusa em todo o resto: funciona quase sempre, e "quase" é onde o
// trabalho se perde.
//
// O checkpoint é LOCAL por padrão. Comentar no card é opt-in: um comentário
// automático por sessão vira ruído no tracker do time, e ruído faz ninguém ler
// o que importa.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run, pass } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { montar, emTexto } from "./lib/checkpoint.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

run(async (input) => {
  const cfg = loadConfig(input.cwd);
  if (!cfg.checkpoint?.enabled) pass();

  const c = montar({
    transcriptPath: input.transcript_path,
    cwd: input.cwd,
    cfg: { ...cfg.stopVerify, cardPattern: cfg.checkpoint.cardPattern },
  });
  if (!c) pass(); // sessão sem edição de código: não há o que retomar

  const dir = join(input.cwd || ".", ".claude", "core-state");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "checkpoint.json"), JSON.stringify(c, null, 2) + "\n");
  writeFileSync(join(dir, "checkpoint.md"), emTexto(c) + "\n");

  // ------------------------------------------------- comentário no card
  // Só com opt-in explícito, e só quando ficou trabalho em aberto: registrar no
  // tracker que uma tarefa terminou e foi entregue é redundante com a própria
  // entrega.
  const deveComentar =
    cfg.checkpoint.comentarNoCard && c.card && (!c.testouDepois || c.naoCommitado > 0);

  if (deveComentar) {
    const script = join(AQUI, "..", "..", "..", "scripts", "tracker.mjs");
    if (existsSync(script)) {
      const corpo =
        `**Checkpoint automático** — trabalho em andamento, não entregue.\n\n` +
        emTexto(c) +
        `\n\nEste comentário é gerado ao fim da sessão para que a próxima retome ` +
        `daqui. Não substitui o comentário de entrega.`;
      // Falha aqui não pode derrubar o encerramento: o checkpoint local já
      // cumpriu o essencial, e o tracker pode estar fora do ar.
      spawnSync(process.execPath, [script, "--projeto", input.cwd || ".", "comment", c.card, "-"], {
        input: corpo,
        encoding: "utf8",
        timeout: 30000,
        windowsHide: true,
      });
    }
  }
});
