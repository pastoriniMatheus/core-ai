#!/usr/bin/env node
// Medicao de sessoes a partir dos transcripts locais do Claude Code.
//
//   node scripts/baseline.mjs                 # projeto atual, ultimos 7 dias
//   node scripts/baseline.mjs --days 30
//   node scripts/baseline.mjs --project "C:/caminho/do/projeto"
//   node scripts/baseline.mjs --save antes    # congela um retrato para comparar
//   node scripts/baseline.mjs --compare antes
//
// Por que isso existe: instalar quatro ferramentas de uma vez e sentir que
// melhorou nao e resultado, e vies de confirmacao. Sem um numero de antes, uma
// regressao passa despercebida e ninguem sabe qual mudanca causou o que.
//
// Nao ha preco embutido de proposito: tabela de preco muda e envelhece errado.
// O que importa para comparar antes/depois e a contagem por categoria.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const DAYS = parseInt(flag("days", "7"), 10);
const PROJECT = flag("project", process.cwd());
const SAVE = flag("save", null);
const COMPARE = flag("compare", null);

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

/** O Claude Code guarda transcripts num diretorio cujo nome e o caminho higienizado. */
function slugFor(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function findProjectDir(cwd) {
  if (!existsSync(PROJECTS_DIR)) return null;
  const slug = slugFor(cwd);
  const exact = join(PROJECTS_DIR, slug);
  if (existsSync(exact)) return exact;

  // O caminho pode ter sido normalizado de outro jeito: aceita o melhor sufixo.
  const tail = slug.split("-").filter(Boolean).slice(-3).join("-").toLowerCase();
  const match = readdirSync(PROJECTS_DIR).find((d) => d.toLowerCase().endsWith(tail));
  return match ? join(PROJECTS_DIR, match) : null;
}

const EMPTY = () => ({
  sessoes: 0,
  turnos: 0,
  inputNovo: 0,
  cacheEscrito: 0,
  cacheLido: 0,
  output: 0,
  duracaoMs: 0,
  ferramentas: {},
});

function analisar(dir, desdeMs) {
  const total = EMPTY();
  const porSessao = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    const path = join(dir, file);
    if (statSync(path).mtimeMs < desdeMs) continue;

    const s = EMPTY();
    let primeiro = null;
    let ultimo = null;

    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }

      if (ev.timestamp) {
        const t = Date.parse(ev.timestamp);
        if (!Number.isNaN(t)) {
          if (primeiro === null || t < primeiro) primeiro = t;
          if (ultimo === null || t > ultimo) ultimo = t;
        }
      }

      const u = ev?.message?.usage;
      if (u) {
        s.turnos++;
        s.inputNovo += u.input_tokens || 0;
        s.cacheEscrito += u.cache_creation_input_tokens || 0;
        s.cacheLido += u.cache_read_input_tokens || 0;
        s.output += u.output_tokens || 0;
      }

      const content = ev?.message?.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "tool_use") s.ferramentas[b.name] = (s.ferramentas[b.name] || 0) + 1;
        }
      }
    }

    if (!s.turnos) continue;
    s.duracaoMs = primeiro && ultimo ? ultimo - primeiro : 0;
    s.sessoes = 1;
    porSessao.push({ arquivo: file, ...s });

    total.sessoes++;
    total.turnos += s.turnos;
    total.inputNovo += s.inputNovo;
    total.cacheEscrito += s.cacheEscrito;
    total.cacheLido += s.cacheLido;
    total.output += s.output;
    total.duracaoMs += s.duracaoMs;
    for (const [k, v] of Object.entries(s.ferramentas)) {
      total.ferramentas[k] = (total.ferramentas[k] || 0) + v;
    }
  }

  return { total, porSessao };
}

const n = (x) => x.toLocaleString("pt-BR");
const min = (ms) => (ms / 60000).toFixed(1);

function imprimir(titulo, t) {
  const porSessao = (x) => (t.sessoes ? Math.round(x / t.sessoes) : 0);
  console.log(`\n${titulo}`);
  console.log("-".repeat(titulo.length));
  console.log(`  sessoes                 ${n(t.sessoes)}`);
  console.log(`  turnos                  ${n(t.turnos)}  (${porSessao(t.turnos)}/sessao)`);
  console.log(`  tempo total             ${min(t.duracaoMs)} min  (${min(t.duracaoMs / (t.sessoes || 1))} min/sessao)`);
  console.log(`  input novo              ${n(t.inputNovo)}  (${n(porSessao(t.inputNovo))}/sessao)`);
  console.log(`  cache escrito           ${n(t.cacheEscrito)}  (${n(porSessao(t.cacheEscrito))}/sessao)`);
  console.log(`  cache lido              ${n(t.cacheLido)}  (${n(porSessao(t.cacheLido))}/sessao)`);
  console.log(`  output                  ${n(t.output)}  (${n(porSessao(t.output))}/sessao)`);

  const top = Object.entries(t.ferramentas).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    console.log(`  ferramentas mais usadas`);
    for (const [name, count] of top) console.log(`      ${String(count).padStart(5)}  ${name}`);
  }
}

function delta(antes, agora) {
  const linha = (rotulo, a, b) => {
    const pa = antes.sessoes ? a / antes.sessoes : 0;
    const pb = agora.sessoes ? b / agora.sessoes : 0;
    if (!pa) return;
    const pct = ((pb - pa) / pa) * 100;
    const sinal = pct > 0 ? "+" : "";
    console.log(`  ${rotulo.padEnd(22)} ${n(Math.round(pa)).padStart(12)} -> ${n(Math.round(pb)).padStart(12)}   ${sinal}${pct.toFixed(1)}%`);
  };
  console.log("\nComparacao por sessao");
  console.log("---------------------");
  linha("turnos", antes.turnos, agora.turnos);
  linha("tempo (ms)", antes.duracaoMs, agora.duracaoMs);
  linha("input novo", antes.inputNovo, agora.inputNovo);
  linha("cache lido", antes.cacheLido, agora.cacheLido);
  linha("output", antes.output, agora.output);
  console.log("\n  Queda em turnos e tempo por sessao e o sinal de acerto.");
  console.log("  Queda em output sem queda em turnos pode ser so resposta mais curta.");
}

// ------------------------------------------------------------------- main
const dir = findProjectDir(PROJECT);
if (!dir) {
  console.error(`Nenhum transcript encontrado para: ${PROJECT}`);
  console.error(`Procurado em: ${PROJECTS_DIR}`);
  if (existsSync(PROJECTS_DIR)) {
    console.error(`\nProjetos disponiveis:`);
    for (const d of readdirSync(PROJECTS_DIR).slice(0, 20)) console.error(`  ${d}`);
  }
  process.exit(1);
}

const desde = Date.now() - DAYS * 86400000;
const { total } = analisar(dir, desde);

imprimir(`Ultimos ${DAYS} dias  -  ${dir}`, total);

const baselineDir = join(PROJECT, ".claude", "baseline");

if (SAVE) {
  mkdirSync(baselineDir, { recursive: true });
  const out = join(baselineDir, `${SAVE}.json`);
  writeFileSync(out, JSON.stringify({ gravadoEm: new Date().toISOString(), dias: DAYS, total }, null, 2));
  console.log(`\nRetrato salvo em ${out}`);
}

if (COMPARE) {
  const path = join(baselineDir, `${COMPARE}.json`);
  if (!existsSync(path)) {
    console.error(`\nRetrato "${COMPARE}" nao encontrado em ${baselineDir}`);
    process.exit(1);
  }
  const antes = JSON.parse(readFileSync(path, "utf8"));
  imprimir(`Retrato "${COMPARE}" (${antes.dias} dias, de ${antes.gravadoEm.slice(0, 10)})`, antes.total);
  delta(antes.total, total);
}
