#!/usr/bin/env node
// CAMADA 0 - Stop
//
// Porta "nao declare pronto sem evidencia" de instrucao para garantia.
//
// A regra original depende do modelo lembrar. Aqui ela vira uma checagem do
// transcript: se a sessao editou codigo e nenhum comando de teste rodou depois
// da ultima edicao, o encerramento e bloqueado com a lista do que ficou sem prova.
//
// Nao substitui CI. E o portao que impede "terminei" sem ter rodado nada.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run, pass, block } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { estadoDaProva } from "./lib/transcript.mjs";

run(async (input) => {
  // O proprio bloqueio reentra no Stop. Sem esta guarda, loop infinito.
  if (input.stop_hook_active) pass();

  const cfg = loadConfig(input.cwd);
  if (!cfg.stopVerify.enabled) pass();
  if (!input.transcript_path || !existsSync(input.transcript_path)) pass();

  const prova = estadoDaProva(input.transcript_path, cfg.stopVerify, input.cwd);
  if (!prova.editouCodigo) pass();

  // --------------------------------------------- check de projeto inteiro
  // Rust, Java, C# e o typecheck de TS nao tem verificacao por arquivo
  // confiavel: o compilador precisa do projeto todo. Pagar esse custo a cada
  // edicao seria inviavel, entao ele e pago UMA vez, aqui.
  for (const cmd of cfg.stopVerify.projectCheck) {
    const r = spawnSync(cmd, {
      cwd: input.cwd,
      shell: true,
      encoding: "utf8",
      timeout: cfg.stopVerify.projectCheckTimeoutMs,
      windowsHide: true,
    }, { aoFalhar: "bloqueia" });
    if (r.status === 0) continue; // passou

    // Timeout nao e aprovacao. "Nao terminei de verificar" nunca deve ser
    // relatado como "esta tudo certo" — o silencio aqui seria a falha mais
    // enganosa do nucleo inteiro.
    if (r.error) {
      const motivo = r.error.code === "ETIMEDOUT" || r.error.killed
        ? `estourou o limite de ${Math.round(cfg.stopVerify.projectCheckTimeoutMs / 1000)}s`
        : `nao pode ser executado (${r.error.code || r.error.message})`;
      block(
        `[core] A verificacao de projeto NAO terminou:\n\n  $ ${cmd}\n  ${motivo}\n\n` +
          `Isso nao e aprovacao: ninguem sabe se o projeto compila.\n` +
          `Rode o comando a mao e mostre o resultado, ou ajuste ` +
          `stopVerify.projectCheckTimeoutMs em .claude/core.json se o build for mesmo longo.`
      );
    }
    const saida = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").slice(0, 40).join("\n");
    block(
      `[core] A verificacao de projeto reprovou:\n\n  $ ${cmd}\n\n${saida}\n\n` +
        `Corrija antes de encerrar. Este check existe porque a linguagem nao permite ` +
        `verificar arquivo por arquivo — o erro so apareceria depois, para outra pessoa.`
    );
  }

  if (prova.provado) pass();

  const lista = prova.arquivos.slice(-10).map((f) => `  - ${f}`).join("\n");
  block(
    `[core] Codigo foi alterado e nenhum teste rodou depois da ultima edicao.\n\n` +
      `Arquivos sem prova:\n${lista}\n\n` +
      `Rode a suite (ou o subconjunto relevante) e mostre a saida. Se nao houver teste ` +
      `que cubra essa mudanca, diga isso explicitamente ao usuario em vez de declarar pronto.`
  );
}, { aoFalhar: "bloqueia" });
