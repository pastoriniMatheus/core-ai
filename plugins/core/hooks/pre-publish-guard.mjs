#!/usr/bin/env node
// CAMADA 0 - PreToolUse(Bash | mcp__*) - o portao de publicacao
//
// Publicar e irreversivel do ponto de vista social: uma PR aberta fica visivel
// para o time inteiro sob o nome do usuario, e um card movido para revisao puxa
// o tempo de outra pessoa. Duas regras que costumam viver como texto no prompt
// viram aqui uma parada obrigatoria:
//
//   1. NUNCA abrir PR ou mover card sem permissao explicita do usuario.
//      Por PR e por card, toda vez. Um "pode" de ontem nao vale para hoje.
//
//   2. NUNCA publicar trabalho cujo caminho real nao foi exercitado.
//      Suite verde nao e "testado" — e um subconjunto do que o usuario vai rodar.
//
// COBRE OS DOIS CAMINHOS. Um hook so de Bash deixaria passar livre qualquer
// tracker acessado por MCP — e MCP e o caminho preferido. Aqui, tanto o comando
// de shell quanto a chamada de ferramenta MCP sao inspecionados.

import { existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { run, pass, denyTool } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { estadoDaProva } from "./lib/transcript.mjs";
import { dirEstado } from "./lib/estado.mjs";

// Um padrao malformado na configuracao nao pode derrubar a checagem inteira.
// Sem o try, `padroes.some` lancava no primeiro invalido e io.mjs engolia —
// o portao morria em silencio, e de forma DEPENDENTE DA ORDEM: com o padrao
// bom antes, passava nos testes; com ele depois, a guarda sumia em producao.
const bate = (padroes, texto) =>
  (padroes || []).some((p) => {
    try { return new RegExp(p, "i").test(texto); }
    catch { return false; } // padrao invalido: ignora este, segue nos outros
  });

/**
 * Autorizacao one-shot para chamadas MCP.
 *
 * Em Bash o agente prefixa o comando com o marcador. Numa chamada MCP nao ha
 * onde prefixar: o schema da ferramenta e fixo. Entao a autorizacao vira um
 * arquivo, criado logo antes, valido por poucos minutos e CONSUMIDO no uso —
 * uma autorizacao, uma publicacao, que e a semantica de "por PR e por card".
 */
function consomeAutorizacao(cwd, janelaMs) {
  const path = join(cwd, ".claude", "core-state", "publish-ok");
  if (!existsSync(path)) return false;
  try {
    const idadeMs = Date.now() - statSync(path).mtimeMs;
    unlinkSync(path); // consome sempre, mesmo vencido: token nao se reaproveita
    return idadeMs <= janelaMs;
  } catch {
    return false;
  }
}

run(async (input) => {
  const cfg = loadConfig(input.cwd);
  if (!cfg.publish.enabled) pass();

  const tool = input.tool_name || "";
  const ehMcp = tool.startsWith("mcp__");

  // Bash olha o comando. MCP olha o nome da ferramenta mais os argumentos:
  // `mcp__plane__update_issue {"state":"Done"}` vira um texto so, e os mesmos
  // padroes valem para os dois caminhos.
  const texto = ehMcp
    ? `${tool} ${JSON.stringify(input.tool_input || {})}`
    : input.tool_input?.command || "";
  if (!texto) pass();

  // A acao vem do fim do nome da ferramenta — `mcp__plane__list_work_items` ->
  // `list_work_items` — para que o nome do SERVIDOR nunca decida se e leitura.
  //
  // Uma acao so e leitura quando NAO contem verbo de escrita nenhum. Casar so o
  // prefixo deixava `get_or_update_work_item` passar como leitura, e com isso
  // ele atravessava o portao inteiro, inclusive o bloqueio de estado final.
  const acao = ehMcp ? (tool.split("__").pop() || "") : "";
  const leitura = bate(cfg.publish.mcpLeitura, acao) && !bate(cfg.publish.mcpEscrita, acao);
  // Comentar passa mesmo com "create" no nome — desde que nao toque no estado.
  const comentario =
    bate(cfg.publish.mcpComentario, acao) && !bate(cfg.publish.mcpMexeNoEstado, acao);
  const soLeitura = ehMcp && (leitura || comentario);

  const ehPR = bate(cfg.publish.prPatterns, texto) || (ehMcp && bate(cfg.publish.mcpPrPatterns, texto));
  const ehTracker =
    bate(cfg.publish.sempreTracker, texto) ||
    (cfg.publish.trackerPatterns.length && bate(cfg.publish.trackerPatterns, texto)) ||
    (ehMcp && bate(cfg.publish.mcpTrackerPatterns, texto));

  // ------------------------------------------------- bloqueio sem escape
  // Fechar um card e o julgamento de quem revisou o trabalho, e essa pessoa
  // nao e o agente. Este e o unico bloqueio do nucleo que nao aceita
  // autorizacao: nem o usuario pedindo torna a acao do agente.
  // O delimitador final aceita fim de string: num comando de shell o estado é o
  // último argumento (`move PROJ-540 Done`) e não há caractere depois dele —
  // exigir um deixava o bloqueio mais importante do núcleo passar batido.
  const estadoProibido = cfg.publish.forbiddenStates.map((s) => `["' :=]${s}(["',}]|\\s|$)`);
  if (ehTracker && bate(estadoProibido, texto)) {
    denyTool(
      `[core] Este comando parece mover um card para "${cfg.publish.doneState}".\n\n` +
        `Fechar um card e o julgamento de quem revisou o trabalho — nunca do agente,\n` +
        `e nunca do autor. Quem revisa move a mao, depois de olhar.\n\n` +
        `Este bloqueio nao tem escape: se o trabalho esta pronto, o card vai para\n` +
        `"${cfg.publish.reviewState}" com o link da PR no comentario, e para por ai.`
    );
  }

  // A isencao de leitura vem DEPOIS do bloqueio de estado final, de proposito:
  // aquele bloqueio nao tem escape, e "e leitura" nao pode virar um.
  if (soLeitura) pass();

  if (!ehPR && !ehTracker) pass();

  // ----------------------------------------------------------- autorizado?
  if (!ehMcp && new RegExp(cfg.publish.escape).test(texto)) pass();
  if (ehMcp && consomeAutorizacao(input.cwd, cfg.publish.tokenWindowMs)) pass();

  // ---------------------------------------------------- estado da prova
  let prova = null;
  if (input.transcript_path && existsSync(input.transcript_path)) {
    prova = estadoDaProva(input.transcript_path, cfg.stopVerify, input.cwd);
  }

  const linhas = [];
  const alvo = ehPR ? "abrir/alterar uma PR" : "mover o card no tracker";
  linhas.push(`[core] Portao de publicacao: \`${texto.slice(0, 160)}\``);
  linhas.push("");

  if (prova?.editouCodigo && !prova.provado) {
    const lista = prova.arquivos.slice(-8).map((f) => `     - ${f}`).join("\n");
    linhas.push("  [x] PROVA AUSENTE — codigo alterado e nenhum teste rodou depois:");
    linhas.push(lista);
    linhas.push("");
  } else if (prova?.provado) {
    linhas.push("  [ok] Um teste rodou depois da ultima edicao.");
    linhas.push("       Isso NAO substitui exercitar o caminho real (tela, endpoint, fluxo).");
    linhas.push("");
  }

  linhas.push(`  Antes de ${alvo}, confirme com o usuario. Por PR e por card, toda vez.`);
  if (prova && !prova.falouDepois) {
    linhas.push("  O usuario nao falou desde a ultima edicao — ninguem autorizou esta publicacao.");
  }
  linhas.push("");

  linhas.push("  Antes de pedir a permissao, tenha:");
  linhas.push("    - o caminho REAL exercitado, nao so a suite unitaria");
  linhas.push("    - contraprova: o teste falha sem o fix e passa com ele");
  linhas.push("    - o que ficou de fora dito explicitamente");
  if (ehPR && cfg.publish.baseBranch) linhas.push(`    - base da PR: \`${cfg.publish.baseBranch}\``);
  if (ehTracker) {
    linhas.push("    - comentario no card com o link CLICAVEL da PR");
    linhas.push(`    - card vai para "${cfg.publish.reviewState}", NUNCA direto para "${cfg.publish.doneState}"`);
  }
  linhas.push("");
  linhas.push("  Pare, relate o que foi verificado e o que segue aberto, e pergunte.");
  linhas.push("");

  if (ehMcp) {
    linhas.push("  Com a autorizacao em maos, libere UMA publicacao e repita a chamada:");
    linhas.push("");
    // A pasta e criada AQUI, ja protegida: assim a mensagem volta a ser um
    // comando que funciona em qualquer instalacao. Apontar para um script em
    // scripts/ quebrava na instalacao por plugin, que nao carrega essa pasta.
    try { dirEstado(input.cwd); } catch { /* sem permissao: o comando abaixo avisa */ }
    linhas.push("    touch .claude/core-state/publish-ok");
    linhas.push("");
    linhas.push("  O token vale uma vez so e vence em poucos minutos.");
  } else {
    linhas.push(`  Com a autorizacao em maos, reexecute prefixado com ${cfg.publish.escapeHint}`);
  }

  denyTool(linhas.join("\n"));
}, { aoFalhar: "bloqueia" });
