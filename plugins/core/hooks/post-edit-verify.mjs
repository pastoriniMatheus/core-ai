#!/usr/bin/env node
// CAMADA 0 - PostToolUse(Edit|Write|MultiEdit|Bash)
//
// Substitui a instrucao probabilistica "escreva codigo correto" por uma
// verificacao que sempre roda. O agente edita, o linter reprova, o erro volta
// como feedback acionavel e ele corrige antes de qualquer humano ver.
//
// COBRE OS DOIS CAMINHOS DE ESCRITA. Olhar so Edit/Write deixava passar livre
// tudo que o agente escrevesse por shell (`cat > x`, `sed -i`, `Set-Content`) —
// e numa sessao real ele resolveu a tarefa inteira por PowerShell, sem que
// nenhum hook visse nada. Mesmo buraco que o portao de publicacao tinha com MCP.
//
// Escopo deliberadamente estreito: verifica O ARQUIVO ESCRITO, nao o projeto.
// Verificacao de projeto inteiro pertence ao Stop.

import { extname, join, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { run, pass, block } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { candidatesFor, yamlCandidates, runFirstAvailable, verifyJsonInline } from "./lib/detect.mjs";
import { arquivosEscritosPorShell } from "./lib/escrita-shell.mjs";

/** Verifica um arquivo. Devolve a mensagem de reprovacao, ou null se passou. */
function verificar(file, cwd, cfg) {
  const ext = extname(file).toLowerCase();

  // JSON sai de graca dentro do proprio Node: sem spawn, sem tooling.
  if (ext === ".json") return verifyJsonInline(file);

  if (ext === ".yml" || ext === ".yaml") {
    const err = runFirstAvailable(yamlCandidates(file), cwd, cfg.verify.timeoutMs);
    return err ? `YAML invalido em ${file}:\n\n${err}` : null;
  }

  const candidatos = cfg.verify.byExtension?.[ext]
    ? cfg.verify.byExtension[ext].map((c) => [c[0], c.slice(1).map((a) => a.replace("{file}", file))])
    : candidatesFor(file, cwd);

  if (!candidatos.length) return null;

  const falha = runFirstAvailable(candidatos, cwd, cfg.verify.timeoutMs);
  return falha ? `Verificacao reprovou em ${file}:\n\n${falha}` : null;
}

run(async (input) => {
  const cfg = loadConfig(input.cwd);
  if (!cfg.verify.enabled) pass();

  // ------------------------------------------------- escrita por shell
  if (input.tool_name === "Bash") {
    for (const alvo of arquivosEscritosPorShell(input.tool_input?.command)) {
      const caminho = isAbsolute(alvo) ? alvo : join(input.cwd || ".", alvo);
      // A extracao e heuristica: o alvo pode nao ser um arquivo de verdade.
      if (!existsSync(caminho)) continue;
      const erro = verificar(caminho, input.cwd, cfg);
      if (erro) {
        block(`[core] ${erro}\n\nO arquivo foi escrito por shell, mas a verificacao vale igual.`);
      }
    }
    pass();
  }

  // --------------------------------------------- escrita por ferramenta
  const file = input.tool_input?.file_path;
  if (!file) pass();

  const erro = verificar(file, input.cwd, cfg);
  if (erro) block(`[core] ${erro}\n\nCorrija agora, antes de seguir para o proximo passo.`);
});
