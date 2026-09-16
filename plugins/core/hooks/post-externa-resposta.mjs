#!/usr/bin/env node
// CAMADA 0 - PostToolUse(Bash | mcp__*) - o que VOLTA da base externa
//
// O portao cuida do que sai. Este hook cuida do que entra, e trata os dois
// modos de falha que nenhuma instrucao em prompt alcanca:
//
//   1. FALHA QUE PARECE VAZIO. Quando a biblioteca quebra — e ela vai quebrar
//      no dia em que o Google mexer num endpoint interno — a resposta nao vem
//      com erro limpo: vem vazia, ou vem HTML de login. O agente le vazio como
//      "nao ha informacao sobre isso na base" e responde com confianca a partir
//      do nada. Alucinacao por omissao. Aqui, falha nunca vira vazio: vira uma
//      frase que diz que caiu.
//
//   2. CUSTO QUE NAO APARECE UMA VEZ SO. Uma resposta longa nao custa o que ela
//      mede: ela fica no contexto e e reprocessada em TODO turno seguinte.
//      Neste projeto ja foram medidos 8.551.717 tokens de entrada contra
//      202.465 de saida numa unica sessao — 42x. Um texto de 4KB colado no
//      turno 10 de uma sessao de 75 nao custa 4KB.
//
// E carimba a procedencia. A resposta e sintese de um LLM sobre fontes que
// ninguem esta vendo, sem data e sem autoria no repositorio — o oposto de um
// arquivo versionado. Citar isso dentro de uma decisao sem dizer de onde veio e
// como citar um boato bem escrito.

import { writeSync } from "node:fs";
import { readInput } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { classifica, tipoDaAcao } from "./lib/externa.mjs";

const INDISPONIVEL =
  "[notebooklm indisponivel — responda sem esta fonte e diga isso explicitamente. " +
  "Resposta vazia da base NAO significa que o assunto nao esta documentado.]";

/** O texto que a ferramenta devolveu, seja qual for o formato. */
function respostaEmTexto(r) {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (typeof r === "object") {
    const partes = [r.stdout, r.stderr, r.output, r.content, r.text, r.result]
      .filter((x) => typeof x === "string");
    if (partes.length) return partes.join("\n");
    try { return JSON.stringify(r); } catch { return ""; }
  }
  return String(r);
}

// HTML de login no lugar de JSON e a assinatura classica de sessao morta numa
// biblioteca que fala com API nao documentada. Vem com status 200.
const CHEIRO_DE_QUEDA =
  /<!doctype html|accounts[.]google[.]com|sign in|401|403|unauthorized|authentication|expired|timed? ?out|econnrefused|connection refused/i;

readInput()
  .then((input) => {
    try {
      const cfg = loadConfig(input.cwd || process.cwd()).externa;
      if (!cfg?.enabled) return;

      const chamada = classifica(cfg, input.tool_name, input.tool_input);
      if (!chamada) return;
      if (tipoDaAcao(cfg, chamada.acao) !== "consulta") return;

      const texto = respostaEmTexto(input.tool_response).trim();
      const avisos = [];

      if (!texto || texto.length < 24 || CHEIRO_DE_QUEDA.test(texto.slice(0, 600))) {
        avisos.push(INDISPONIVEL);
      } else {
        const bytes = Buffer.byteLength(texto, "utf8");
        const teto = cfg.tetoRespostaBytes ?? 4000;
        if (bytes > teto) {
          avisos.push(
            `[core] A base externa devolveu ${(bytes / 1024).toFixed(1)} KB (teto: ${(teto / 1024).toFixed(1)} KB).\n` +
              `Isso nao custa uma vez: fica no contexto e e reprocessado em todo turno\n` +
              `seguinte — numa sessao de 75 turnos, 75 vezes. Destile agora para o que\n` +
              `a tarefa precisa, e nao repita o texto longo nas proximas mensagens.`
          );
        }
        avisos.push(
          "[core] Procedencia: isto e sintese de um modelo sobre fontes que voce nao\n" +
            "esta vendo — sem data, sem autoria e sem linha de codigo para conferir.\n" +
            "Ao usar numa decisao, diga de que fonte veio e de quando ela e (esta em\n" +
            `\`${cfg.indice}\`). Se a informacao for virar decisao do time, ela precisa\n` +
            "acabar num arquivo versionado — a base externa e indice de busca, nao\n" +
            "memoria: se ela sumisse hoje, so se perderia tempo de busca."
        );
      }

      if (!avisos.length) return;
      writeSync(1, JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: avisos.join("\n\n"),
        },
      }) + "\n");
    } catch { /* nunca derrubar a sessao por causa de um aviso */ }
  })
  .catch(() => {});
