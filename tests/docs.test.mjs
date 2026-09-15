#!/usr/bin/env node
// A documentação não pode envelhecer em silêncio.
//   node tests/docs.test.mjs
//
// Documentação envelhece porque a verdade muda num lugar e o texto fica no
// outro, sem nada reclamar. Este teste torna a divergência ruidosa: o que o
// disco tem e os documentos não citam, e o que os documentos prometem e o disco
// não tem.
//
// Não verifica se o texto está BOM — isso ninguém automatiza. Verifica se ele
// ainda descreve o que existe, que é onde a documentação apodrece primeiro.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };
const json = (p) => { try { return JSON.parse(ler(p)); } catch { return null; } };

let ok = 0;
let falhou = 0;
const afirma = (nome, cond, detalhe = "") => {
  if (cond) { ok++; console.log(`  PASS  ${nome}`); }
  else { falhou++; console.log(`  FAIL  ${nome}${detalhe ? "\n        " + detalhe : ""}`); }
};

// ------------------------------------------------------------ o que existe
const skills = readdirSync(join(ROOT, "plugins", "core", "skills"))
  .filter((d) => existsSync(join(ROOT, "plugins", "core", "skills", d, "SKILL.md")));
const comandos = readdirSync(join(ROOT, "plugins", "core", "commands"))
  .filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
const hooks = Object.keys(json("plugins/core/hooks/hooks.json")?.hooks || {});
const scripts = readdirSync(join(ROOT, "scripts")).filter((f) => f.endsWith(".mjs"));

const README = ler("README.md");
const MANUAL = ler("docs/manual.src.html");
const DOCS = readdirSync(join(ROOT, "docs")).filter((f) => f.endsWith(".md"))
  .map((f) => ler(join("docs", f))).join("\n");

console.log("\n=== o disco está documentado? ===");

const semDoc = skills.filter((s) => !README.includes(s));
afirma(`as ${skills.length} skills aparecem no README`, !semDoc.length,
  semDoc.length ? `faltam: ${semDoc.join(", ")}` : "");

const cmdSemDoc = comandos.filter((c) => !README.includes(`/${c}`));
afirma(`os ${comandos.length} comandos aparecem no README`, !cmdSemDoc.length,
  cmdSemDoc.length ? `faltam: ${cmdSemDoc.join(", ")}` : "");

const hooksSemDoc = hooks.filter((h) => !README.includes(h));
afirma(`os ${hooks.length} eventos de hook aparecem no README`, !hooksSemDoc.length,
  hooksSemDoc.length ? `faltam: ${hooksSemDoc.join(", ")}` : "");

// Um script que ninguém cita é um script que ninguém usa — ou documentação
// que esqueceu dele. Os dois casos merecem um olhar.
const scriptsSemDoc = scripts.filter((s) => !README.includes(s) && !DOCS.includes(s));
afirma(`os ${scripts.length} scripts são citados em algum documento`, !scriptsSemDoc.length,
  scriptsSemDoc.length ? `nunca citados: ${scriptsSemDoc.join(", ")}` : "");

console.log("\n=== a documentação promete o que existe? ===");

// O caminho oposto, e o mais perigoso: o texto manda rodar algo que sumiu.
const prometidos = [...new Set(
  [...README.matchAll(/`\/([a-z][a-z-]+)`/g)].map((m) => m[1])
)].filter((c) => !["plugin", "core"].includes(c));
const inexistentes = prometidos.filter((c) => !comandos.includes(c));
afirma("nenhum comando prometido no README sumiu do disco", !inexistentes.length,
  inexistentes.length ? `prometidos e ausentes: ${inexistentes.map((c) => "/" + c).join(", ")}` : "");

const scriptsCitados = [...new Set([...README.matchAll(/scripts\/([a-z-]+\.mjs)/g)].map((m) => m[1]))];
const scriptsFantasma = scriptsCitados.filter((s) => !scripts.includes(s));
afirma("nenhum script citado no README sumiu do disco", !scriptsFantasma.length,
  scriptsFantasma.length ? `citados e ausentes: ${scriptsFantasma.join(", ")}` : "");

console.log("\n=== o manual acompanha o README? ===");

// O manual é o que a equipe lê. Ele ficou seis rodadas atrás do README uma vez;
// esta checagem existe para que isso grite em vez de passar despercebido.
const manualSemSkill = skills.filter((s) => !MANUAL.includes(s));
afirma("as skills aparecem no manual", !manualSemSkill.length,
  manualSemSkill.length ? `faltam no manual: ${manualSemSkill.join(", ")}` : "");

const manualSemCmd = comandos.filter((c) => !MANUAL.includes(`/${c}`));
afirma("os comandos aparecem no manual", !manualSemCmd.length,
  manualSemCmd.length ? `faltam no manual: ${manualSemCmd.join(", ")}` : "");

console.log("\n=== a referência de configuração acompanha o código ===");
// Uma opção nova sem linha na referência é uma opção que só quem lê o código
// descobre. A referência é GERADA de lib/config.mjs — este teste garante que
// ela foi regenerada depois da última mudança.
{
  const REF = ler("docs/CONFIGURACAO.md");
  const cfg = ler("plugins/core/hooks/lib/config.mjs");

  const secoes = [...cfg.matchAll(/^ {2}([a-zA-Z]+): \{$/gm)].map((m) => m[1]);
  const opcoes = [...new Set([...cfg.matchAll(/^ {4}([a-zA-Z]+):/gm)].map((m) => m[1]))];

  const semSecao = secoes.filter((x) => !REF.includes("## `" + x + "`"));
  afirma(`as ${secoes.length} seções estão na referência`, !semSecao.length, semSecao.join(", "));

  const semOpcao = opcoes.filter((x) => !REF.includes("| `" + x + "` |"));
  afirma(`as ${opcoes.length} opções estão na referência`, !semOpcao.length,
    semOpcao.length ? `faltam: ${semOpcao.join(", ")} — rode: node scripts/gerar-referencia.mjs` : "");

  const semDescricao = (REF.match(/\| — \|/g) || []).length;
  afirma("nenhuma opção sem descrição", semDescricao === 0,
    semDescricao ? `${semDescricao} sem texto — acrescente o comentário em lib/config.mjs` : "");
}

console.log("\n=== versões coerentes ===");

// A versão é o único sinal que `claude plugin update` usa. Se os dois arquivos
// divergirem, o marketplace anuncia uma versão que o plugin não tem.
const vPlugin = json("plugins/core/.claude-plugin/plugin.json")?.version;
const vMarket = json(".claude-plugin/marketplace.json")?.plugins?.[0]?.version;
afirma("plugin.json e marketplace.json na mesma versão", vPlugin && vPlugin === vMarket,
  `plugin.json=${vPlugin}  marketplace.json=${vMarket}`);

console.log("\n=== integridade do manual ===");

const ids = [...MANUAL.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const dupes = [...new Set(ids.filter((i) => ids.filter((x) => x === i).length > 1))];
afirma("sem ids duplicados no manual", !dupes.length, dupes.join(", "));

const ancoras = [...MANUAL.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const orfas = ancoras.filter((a) => !ids.includes(a));
afirma("sem âncoras sem destino", !orfas.length, orfas.join(", "));

afirma("sections balanceadas",
  (MANUAL.match(/<section/g) || []).length === (MANUAL.match(/<\/section>/g) || []).length);

console.log(`\n${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
