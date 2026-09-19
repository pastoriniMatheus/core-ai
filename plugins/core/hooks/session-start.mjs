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
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
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

/**
 * Publica onde o nucleo esta, para os comandos acharem os scripts.
 *
 * Um comando e markdown: ele nao expande ${CLAUDE_PLUGIN_ROOT}. Mas ESTE hook e
 * invocado com esse caminho, entao ele sabe onde mora — e pode gravar o valor
 * onde o comando consegue ler. Sem isso, /core-tracker e /core-ferramentas
 * apontavam para um caminho que so existia na instalacao local, e quebravam
 * justamente na instalacao por plugin, que e o caminho principal.
 */
function publicaRaiz(cwd) {
  // hooks/session-start.mjs -> o nucleo e o diretorio acima de hooks/
  const nucleo = dirname(dirname(fileURLToPath(import.meta.url))).split("\\").join("/");
  const p = join(cwd, ".claude", "settings.local.json");
  let j = {};
  try { j = JSON.parse(readFileSync(p, "utf8")); } catch { /* arquivo novo */ }
  const gravado = j.env?.AGENT_CORE_ROOT;
  if (gravado === nucleo) return { nucleo, defasado: false };
  j.env = { ...(j.env || {}), AGENT_CORE_ROOT: nucleo };
  mkdirSync(join(cwd, ".claude"), { recursive: true });
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  // Escrever aqui NAO conserta esta sessao: o Claude Code ja leu o
  // settings.local.json antes de o hook rodar, entao o valor novo so vale a
  // partir da proxima. E o cache do plugin e versionado por diretorio
  // (core/0.5.0, core/0.6.0...), entao depois de um `plugin update` a variavel
  // aponta para a pasta da versao ANTERIOR — que pode nem conter o script que
  // o comando manda rodar. Medido: variavel em 0.5.0 com 0.5.1 instalado.
  //
  // Por isso quem estava defasado precisa saber AGORA, em contexto.
  return { nucleo, defasado: true, gravado };
}

function main(input) {
  const cwd = input.cwd || process.cwd();
  let raiz = null;
  try { raiz = publicaRaiz(cwd); } catch { /* sem permissao de escrita: segue */ }
  const cfgPath = join(cwd, ".claude", "core.json");
  const pendencias = [];
  const cfg = loadConfig(cwd);
  // Em `resume` o contexto da sessao continua: entregar o checkpoint dela mesma
  // e ruido. Mas a raiz e as pendencias valem igual — e foi por isso que o hook
  // passou a rodar em resume: quem trabalha por `claude --resume` durante dias
  // nunca via um `startup`, e `$AGENT_CORE_ROOT` ficou em 0.5.0 com 0.8.3
  // instalado. Medido neste repositorio.
  const retomada = input.source === "resume" ? null : checkpointRecente(cwd, cfg);

  if (!existsSync(cfgPath)) {
    pendencias.push("`.claude/core.json` nao existe — o nucleo esta rodando so com defaults");
  } else {
    // `cfg` ja veio de cima. Redeclarar aqui relia e reparseava o core.json no
    // caminho de inicializacao, e sombreava a variavel externa — invisivel hoje
    // porque os dois valores sao iguais, e uma armadilha para quem mexer depois.
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

  // O caminho do nucleo, quando a variavel de ambiente ainda nao o reflete.
  //
  // `$AGENT_CORE_ROOT` e como todo comando deste plugin aponta para os scripts.
  // Ela vem do `settings.local.json`, que o Claude Code le ANTES de os hooks
  // rodarem — e o cache do plugin e versionado por diretorio. Entao na primeira
  // sessao depois de uma atualizacao ela aponta para a pasta da versao
  // anterior, o comando falha com "Cannot find module", e o motivo nao aparece
  // em lugar nenhum.
  //
  // Dizer o caminho certo aqui resolve sem esperar a proxima sessao: o agente
  // le daqui, em vez da variavel.
  const avisoRaiz = raiz?.defasado
    ? [
        "O caminho do nucleo mudou nesta sessao (atualizacao do plugin, ou primeira vez).",
        "`$AGENT_CORE_ROOT` ainda tem o valor antigo" +
          (raiz.gravado ? " (`" + raiz.gravado + "`)" : " (ausente)") +
          " e so sera corrigida na proxima sessao.",
        "",
        "Ate la, use este caminho ao rodar qualquer script do nucleo:",
        "",
        "  " + raiz.nucleo,
        "",
      ].join("\n")
    : "";

  if (!pendencias.length && !retomada && !avisoRaiz) return;

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
    "rodar `/core-init` — ele detecta a stack, instala o que falta, configura e confere",
    "numa passada so. Nao interrompa o que ele pediu para fazer isso: mencione em",
    "uma linha e siga.",
  ].join("\n");

  const completo = [avisoRaiz, blocos.join("\n"), texto].filter(Boolean).join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: completo },
    })
  );
}

readInput()
  .then((input) => { try { main(input); } catch { /* nunca derrubar a sessao */ } })
  .catch(() => {});
