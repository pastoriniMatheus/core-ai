#!/usr/bin/env node
// Gera docs/CONFIGURACAO.md a partir de lib/config.mjs.
//   node scripts/gerar-referencia.mjs
//
// A referência é DERIVADA do código, nunca escrita à mão. Uma opção nova passa
// a existir na documentação no mesmo commit em que passa a existir no núcleo —
// que é a única forma de uma referência não envelhecer.
//
// As descrições vêm dos comentários que já estão lá: o comentário que explica
// uma escolha para quem lê o código é o mesmo texto que serve a quem configura.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "../plugins/core/hooks/lib/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTE = join(ROOT, "plugins", "core", "hooks", "lib", "config.mjs");
const linhas = readFileSync(FONTE, "utf8").split("\n");

/**
 * O bloco de comentário imediatamente acima de uma chave.
 *
 * Os comentários do config.mjs explicam POR QUE cada default é o que é — e
 * essa é exatamente a informação que falta a quem vai mudar o valor.
 */
function comentarioDe(chave, nivel) {
  const alvo = new RegExp(`^\\s{${nivel}}${chave}:`);
  const i = linhas.findIndex((l) => alvo.test(l));
  if (i === -1) return "";

  // Comentario na propria linha: `byExtension: null, // null = autodeteccao`
  const emLinha = linhas[i].match(/\/\/\s?(.+)$/);

  const acc = [];
  for (let j = i - 1; j >= 0; j--) {
    const t = linhas[j].trim();
    if (t.startsWith("//")) { acc.unshift(t.replace(/^\/\/\s?/, "")); continue; }
    break;
  }
  const bloco = acc.join(" ").replace(/\s+/g, " ").trim();
  return bloco || (emLinha ? emLinha[1].trim() : "");
}

const valor = (v) => {
  if (Array.isArray(v)) return v.length ? `${v.length} padrão(ões)` : "`[]` vazio";
  if (v === null) return "`null`";
  if (typeof v === "object") return "";
  if (typeof v === "number" && v > 1000) {
    return v >= 3600000 ? `\`${v}\` (${Math.round(v / 3600000)}h)` : `\`${v}\` (${Math.round(v / 1000)}s)`;
  }
  return `\`${JSON.stringify(v)}\``;
};

const TITULOS = {
  verify: "verify — verificação a cada edição",
  depGuard: "depGuard — dependência nova",
  stopVerify: "stopVerify — prova antes de encerrar",
  checkpoint: "checkpoint — retomar de onde parou",
  graph: "graph — grafo de código",
  publish: "publish — o portão de publicação",
};

const out = [];
out.push("# Referência de configuração");
out.push("");
out.push("Tudo vive em `.claude/core.json`, por projeto. **Toda opção tem default**:");
out.push("um projeto sem esse arquivo funciona, e um arquivo parcial herda o resto —");
out.push("o time só escreve o que quer mudar.");
out.push("");
out.push("<!-- GERADO por scripts/gerar-referencia.mjs a partir de lib/config.mjs.");
out.push("     Não edite à mão: a próxima geração sobrescreve. Para mudar um texto");
out.push("     daqui, mude o comentário no código — é de lá que ele vem. -->");
out.push("");

for (const [secao, opcoes] of Object.entries(DEFAULTS)) {
  out.push(`## \`${secao}\``);
  out.push("");
  const intro = comentarioDe(secao, 2);
  if (intro) { out.push(intro); out.push(""); }
  else if (TITULOS[secao]) { out.push(`*${TITULOS[secao].split(" — ")[1]}*`); out.push(""); }

  out.push("| Opção | Default | O que é |");
  out.push("|---|---|---|");
  for (const [chave, v] of Object.entries(opcoes)) {
    if (chave.startsWith("//")) continue;
    const desc = comentarioDe(chave, 4) || "—";
    out.push(`| \`${chave}\` | ${valor(v) || "objeto"} | ${desc} |`);
  }
  out.push("");
}

out.push("## Desligar uma guarda");
out.push("");
out.push("Cada uma tem interruptor próprio. Desligue **só a que atrapalha**, e só no");
out.push("projeto onde atrapalha:");
out.push("");
out.push("```json");
out.push('{ "depGuard": { "enabled": false } }');
out.push("```");
out.push("");
out.push("Antes de desligar, desconfie da configuração: um bloqueio indevido costuma");
out.push("ser opção faltando, não guarda errada. Um `stopVerify` que barra depois de");
out.push("você ter testado quase sempre significa que o comando de teste do projeto");
out.push("não está em `testPatterns`.");
out.push("");
out.push("O único bloqueio **sem** interruptor é mover um card para o estado final:");
out.push("fechar um card é o julgamento de quem revisou, e autorização não transfere");
out.push("julgamento.");

writeFileSync(join(ROOT, "docs", "CONFIGURACAO.md"), out.join("\n") + "\n");

const total = Object.values(DEFAULTS).reduce((n, o) => n + Object.keys(o).length, 0);
console.log(`  docs/CONFIGURACAO.md   ${Object.keys(DEFAULTS).length} seções, ${total} opções`);
