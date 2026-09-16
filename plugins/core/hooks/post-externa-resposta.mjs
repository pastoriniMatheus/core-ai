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

import { writeSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readInput } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { classifica, tipoDoComando } from "./lib/externa.mjs";

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

// HTML no lugar de JSON, ou a pagina de login: a assinatura classica de sessao
// morta numa biblioteca que fala com API nao documentada. Vem com status 200.
const HTML_OU_LOGIN = /<!doctype html|<html[ >]|accounts[.]google[.]com\//i;

// Falha de transporte. So conta em resposta CURTA, e e por isso que existe uma
// segunda lista: palavras como "authentication", "401" e "expired" aparecem o
// tempo todo numa resposta LEGITIMA — a base externa guarda manual de
// integracao, e manual de integracao fala de autenticacao o capitulo inteiro.
//
// Marcar essa resposta como "indisponivel" produziria exatamente a alucinacao
// por omissao que este hook existe para impedir, so que ao contrario: o agente
// descartaria uma resposta boa e responderia sem ela.
const FALHA_DE_TRANSPORTE =
  /econnrefused|connection refused|enotfound|etimedout|traceback [(]most recent|socket hang up|getaddrinfo/i;
const CURTA = 400;

// A mensagem que a propria CLI imprime quando nao ha sessao. Capturada de uma
// execucao real:
//
//   Not logged in.
//   Checked locations: ...
//   Options to authenticate:
//     1. Run: notebooklm login
//
// Ela nao e curta o bastante para cair no teste de tamanho, nao e HTML, e nao
// tem assinatura de transporte — passava como se fosse resposta. Sao frases da
// ferramenta, especificas o bastante para nao colidirem com prosa de manual.
const SEM_SESSAO =
  /not logged in|run: ?notebooklm login|notebooklm auth check|no valid authentication|authentication (required|expired|failed)/i;

/**
 * Esta e a primeira consulta a base nesta sessao?
 *
 * O `session_id` vem no evento. Guardar qual sessao ja recebeu o carimbo custa
 * um arquivo de uma linha em `.claude/core-state/`, que ja e ignorado pelo git.
 * Sem `session_id` — evento de formato antigo — devolve `true`: perder o
 * carimbo e pior do que repeti-lo.
 */
function primeiraDaSessao(input) {
  const id = input.session_id;
  if (!id) return true;
  try {
    const p = join(input.cwd || process.cwd(), ".claude", "core-state", "externa-carimbo");
    if (existsSync(p) && readFileSync(p, "utf8").trim() === String(id)) return false;
    writeFileSync(p, String(id) + "\n");
    return true;
  } catch {
    return true;
  }
}

readInput()
  .then((input) => {
    try {
      const cfg = loadConfig(input.cwd || process.cwd()).externa;
      if (!cfg?.enabled) return;

      const chamada = classifica(cfg, input.tool_name, input.tool_input);
      if (!chamada) return;
      if (tipoDoComando(cfg, chamada.acoes).tipo !== "consulta") return;

      const texto = respostaEmTexto(input.tool_response).trim();
      const avisos = [];

      const caiu =
        !texto ||
        texto.length < 24 ||
        HTML_OU_LOGIN.test(texto.slice(0, 600)) ||
        SEM_SESSAO.test(texto) ||
        (texto.length < CURTA && FALHA_DE_TRANSPORTE.test(texto));

      if (caiu) {
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
        // O carimbo de procedencia UMA VEZ por sessao.
        //
        // Sao ~430 bytes de texto identico. Emitido em toda consulta, uma sessao
        // com vinte delas carrega 8,6 KB repetidos — reprocessados em todo turno
        // seguinte, que e exatamente o argumento dos 42x que o proprio carimbo
        // usa para pedir destilacao. Um aviso de custo que custa e o pior tipo
        // de aviso.
        //
        // Os outros dois avisos continuam saindo sempre: "indisponivel" e o teto
        // de bytes dependem DESTA resposta, e carregam informacao nova a cada
        // chamada.
        if (primeiraDaSessao(input)) avisos.push(
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
