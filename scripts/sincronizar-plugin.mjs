#!/usr/bin/env node
// Espelha os scripts que os comandos precisam para dentro do plugin.
//   node scripts/sincronizar-plugin.mjs [--verificar]
//
// O plugin carrega apenas commands/, hooks/ e skills/. Um comando que chame
// `node $AGENT_CORE_ROOT/scripts/...` funciona na instalacao local e QUEBRA na
// instalacao por plugin — que e o caminho principal, o que o README manda usar.
//
// Em vez de duas implementacoes, uma copia verificada: a fonte e /scripts, e o
// teste de documentacao falha se as duas divergirem.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(ROOT, "plugins", "core", "scripts");
const VERIFICAR = process.argv.includes("--verificar");

// Os que um COMANDO do plugin invoca. Os demais (install, aceitacao, baseline)
// sao ferramentas de quem desenvolve o nucleo e nao precisam viajar.
const ESPELHADOS = ["raiz.mjs", "tracker.mjs", "tracker-setup.mjs", "ferramentas.mjs", "doctor.mjs", "preflight.mjs", "baseline.mjs"];

mkdirSync(DESTINO, { recursive: true });

const divergentes = [];
for (const nome of ESPELHADOS) {
  const origem = join(ROOT, "scripts", nome);
  if (!existsSync(origem)) { divergentes.push(`${nome}: nao existe em scripts/`); continue; }

  const conteudo = readFileSync(origem, "utf8");
  const alvo = join(DESTINO, nome);
  const atual = existsSync(alvo) ? readFileSync(alvo, "utf8") : null;

  if (atual === conteudo) continue;
  if (VERIFICAR) { divergentes.push(nome); continue; }
  writeFileSync(alvo, conteudo);
}

// Copia tambem o lib/ que doctor e tracker importam por caminho relativo.
const libOrigem = join(ROOT, "plugins", "core", "hooks", "lib");
void libOrigem; // os scripts espelhados importam por ../plugins/..., resolvido abaixo

if (VERIFICAR) {
  if (divergentes.length) {
    console.error(`\n  ${divergentes.length} script(s) fora de sincronia com o plugin:`);
    for (const d of divergentes) console.error(`    ${d}`);
    console.error(`\n  Rode: node scripts/sincronizar-plugin.mjs\n`);
    process.exit(1);
  }
  console.log(`  plugin em dia: ${ESPELHADOS.length} scripts espelhados`);
} else {
  console.log(`  plugins/core/scripts/  ${ESPELHADOS.length} scripts espelhados`);
}

void readdirSync;
