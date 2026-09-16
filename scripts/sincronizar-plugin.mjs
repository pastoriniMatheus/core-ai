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
//
// A LISTA E DERIVADA, nunca escrita a mao. Uma lista manual e a mesma armadilha
// que este projeto ja pisou duas vezes — o instalador com a relacao de hooks
// fixa, e os tres comandos com `{{CORE_ROOT}}` por resolver. Nos dois casos o
// codigo andou e a lista ficou, e ninguem soube ate quebrar na maquina de
// outra pessoa. Aqui a lista sai de quem realmente chama: os comandos, mais o
// fecho transitivo dos imports entre scripts.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(ROOT, "plugins", "core", "scripts");
const VERIFICAR = process.argv.includes("--verificar");

const ler = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

/**
 * Os scripts que algum comando OU skill do plugin invoca.
 *
 * As duas pastas, e nao so commands/: skill tambem manda rodar script — a
 * `atacar-card` chama o tracker em tres pontos. Derivar so de commands/ deixava
 * `tracker.mjs` como orfao aparente e, pior, deixaria um script novo citado so
 * por skill de fora do plugin. E a mesma assimetria de sempre: um caminho
 * coberto, outro aberto.
 */
function citadosPeloPlugin() {
  const texto = ["commands", "skills"].flatMap((sub) => {
    const dir = join(ROOT, "plugins", "core", sub);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: true })
      .filter((f) => String(f).endsWith(".md"))
      .map((f) => ler(join(dir, String(f))));
  }).join("\n");
  return new Set(
    [...texto.matchAll(/AGENT_CORE_ROOT\/scripts\/([a-z-]+\.mjs)/g)].map((m) => m[1])
  );
}

/**
 * Fecho transitivo: um script espelhado que importa outro leva o outro junto.
 *
 * Sem isto, `externa.mjs` viajaria sozinho e quebraria no primeiro uso dentro
 * do plugin, porque ele importa `raiz.mjs` — o script que descobre onde o
 * nucleo esta nos dois layouts. Falha de import so aparece em tempo de
 * execucao, na maquina de quem instalou, e nao aqui.
 */
function comDependencias(iniciais) {
  const fila = [...iniciais];
  const vistos = new Set();
  while (fila.length) {
    const nome = fila.shift();
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    const src = ler(join(ROOT, "scripts", nome));
    for (const m of src.matchAll(/from\s+["']\.\/([a-z-]+\.mjs)["']/g)) fila.push(m[1]);
  }
  return [...vistos].sort();
}

const ESPELHADOS = comDependencias(citadosPeloPlugin());

mkdirSync(DESTINO, { recursive: true });

const divergentes = [];
for (const nome of ESPELHADOS) {
  const origem = join(ROOT, "scripts", nome);
  if (!existsSync(origem)) { divergentes.push(`${nome}: citado por um comando, mas nao existe em scripts/`); continue; }

  const conteudo = readFileSync(origem, "utf8");
  const alvo = join(DESTINO, nome);
  const atual = existsSync(alvo) ? readFileSync(alvo, "utf8") : null;

  if (atual === conteudo) continue;
  if (VERIFICAR) { divergentes.push(nome); continue; }
  writeFileSync(alvo, conteudo);
}

// O caminho oposto, e o que a lista manual nunca pegava: uma copia que ficou no
// plugin depois de o script sumir de /scripts, ou de deixar de ser chamada por
// qualquer comando. Ela continua sendo instalada, continua sendo invocavel, e
// aponta para um mundo que nao existe mais.
const orfaos = readdirSync(DESTINO)
  .filter((f) => f.endsWith(".mjs") && !ESPELHADOS.includes(f));
for (const f of orfaos) {
  if (VERIFICAR) divergentes.push(`${f}: no plugin, mas nenhum comando nem skill o chama`);
}

if (VERIFICAR) {
  if (divergentes.length) {
    console.error(`\n  ${divergentes.length} script(s) fora de sincronia com o plugin:`);
    for (const d of divergentes) console.error(`    ${d}`);
    console.error(`\n  Rode: node scripts/sincronizar-plugin.mjs\n`);
    process.exit(1);
  }
  console.log(`  plugin em dia: ${ESPELHADOS.length} scripts espelhados`);
} else {
  if (orfaos.length) console.log(`  ${orfaos.length} orfao(s) no plugin: ${orfaos.join(", ")}`);
  console.log(`  plugins/core/scripts/  ${ESPELHADOS.length} scripts espelhados  (${ESPELHADOS.join(", ")})`);
}
