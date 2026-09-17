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

import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

console.log("\n=== o plugin carrega os scripts que seus comandos chamam ===");
// O plugin so carrega commands/, hooks/, skills/ e scripts/. Um comando que
// invoque um script ausente dali quebra na instalacao por plugin — que e o
// caminho principal, o que o README manda usar.
{
  const r = spawnSync(process.execPath,
    [join(ROOT, "scripts", "sincronizar-plugin.mjs"), "--verificar"],
    { encoding: "utf8", timeout: 30000 });
  afirma("scripts do plugin em dia com /scripts", r.status === 0,
    (r.stderr || "").split("\n").filter((l) => l.trim()).slice(1, 4).join(" "));

  const textoComandos = readdirSync(join(ROOT, "plugins", "core", "commands"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => ler(join("plugins", "core", "commands", f)))
    .join("\n");
  const citados = [...new Set(
    [...textoComandos.matchAll(/AGENT_CORE_ROOT\/scripts\/([a-z-]+\.mjs)/g)].map((m) => m[1])
  )];
  const ausentes = citados.filter((f) => !existsSync(join(ROOT, "plugins", "core", "scripts", f)));
  afirma(`os ${citados.length} scripts citados pelos comandos viajam no plugin`, !ausentes.length,
    ausentes.length ? `faltam no plugin: ${ausentes.join(", ")}` : "");

  // O regex acima so enxerga quem JA usa a variavel. Um comando que chame o
  // script por outro caminho nao aparece como script ausente — nao aparece de
  // jeito nenhum. Foi esse ponto cego que deixou {{CORE_ROOT}} sobreviver em
  // tres comandos: o marcador so era resolvido pela copia do install, e a
  // instalacao por plugin recebia o texto cru. As duas checagens abaixo olham
  // o que sobra, em vez do que ja esta certo.
  const arquivosCmd = readdirSync(join(ROOT, "plugins", "core", "commands")).filter((f) => f.endsWith(".md"));

  const comMarcador = arquivosCmd.filter((f) => /\{\{[A-Z_]+\}\}/.test(ler(join("plugins", "core", "commands", f))));
  afirma("nenhum comando carrega marcador nao resolvido", !comMarcador.length,
    comMarcador.length ? `com {{...}}: ${comMarcador.join(", ")} — o plugin entrega o texto cru` : "");

  const foraDaConvencao = [...new Set(
    [...textoComandos.matchAll(/node\s+(\S*scripts\/[a-z-]+\.mjs)/g)]
      .map((m) => m[1]).filter((p) => !p.startsWith("$AGENT_CORE_ROOT/"))
  )];
  afirma("todo script chamado por comando passa por $AGENT_CORE_ROOT", !foraDaConvencao.length,
    foraDaConvencao.length ? `fora da convencao: ${foraDaConvencao.join(", ")}` : "");
}

console.log("\n=== os scripts funcionam nos DOIS layouts ===");
// A instalacao por plugin e o caminho principal — e o menos exercitado, porque
// quem desenvolve roda sempre do repositorio. Os dois layouts tem profundidade
// diferente, e um caminho relativo que acerta num erra no outro EM SILENCIO.
//
// Ja custou duas vezes: os comandos com {{CORE_ROOT}} por resolver, e o doctor
// exigindo um marketplace.json que so existe no repositorio — erro duro,
// permanente e inevitavel justamente no caminho que o README manda usar.
{
  const alvo = join(ROOT, "tests");
  for (const [layout, script] of [
    ["repositorio", join(ROOT, "scripts", "doctor.mjs")],
    ["plugin", join(ROOT, "plugins", "core", "scripts", "doctor.mjs")],
  ]) {
    const r = spawnSync(process.execPath, [script, alvo], { encoding: "utf8", timeout: 60000 });
    const linhaErro = (r.stdout || "").split("\n").find((l) => l.includes("[erro]")) || "";
    afirma(`doctor roda sem erro no layout ${layout}`, r.status === 0, linhaErro.trim());
  }

  const r = spawnSync(process.execPath,
    [join(ROOT, "plugins", "core", "scripts", "externa.mjs"), "estado", "--projeto", alvo],
    { encoding: "utf8", timeout: 90000 });
  afirma("externa.mjs acha o nucleo a partir do plugin", r.status === 0,
    (r.stderr || "").split("\n")[1] || "");
}

console.log("\n=== o compose do servidor e YAML valido ===");
// Duas vezes seguidas o arquivo gerado foi recusado pelo proprio compose, e nas
// duas o erro apontava uma coluna que nao explicava nada:
//
//   "missing a mount target"   um caminho do Windows comeca com "C:", e a
//                              sintaxe curta de volume divide por ":"
//   "mapping values are not    a mensagem do `:?` continha "rode: node ...",
//    allowed in this context"  e um ": " nao-citado e mapeamento para o YAML
//
// Gerar YAML por template de string e facil de fazer e facil de quebrar. Este
// teste le o que o script ESCREVE, e nao o que ele pretendia escrever.
{
  const tmp = join(ROOT, "tests", ".tmp-servidor");
  spawnSync(process.execPath, [join(ROOT, "scripts", "externa.mjs"), "servidor", "preparar", "--projeto", tmp],
    { encoding: "utf8", timeout: 60000 });
  const yml = ler(join("tests", ".tmp-servidor", ".claude", "externa-servidor", "docker-compose.yml"));
  afirma("o compose foi gerado", yml.length > 0);

  // Sem YAML parser no projeto: o que se verifica sao as duas armadilhas que
  // ja morderam, mais a promessa de seguranca que o arquivo faz.
  const linhaSource = yml.split("\n").find((l) => l.trim().startsWith("source:")) || "";
  afirma("o volume usa sintaxe longa e valor citado", /source: *"/.test(linhaSource), linhaSource.trim());
  afirma("a mensagem do :? nao tem dois-pontos", !/:[?][^"]*: /.test(linhaSource), linhaSource.trim());

  const portas = [...yml.matchAll(/^ *- *["']?([^"'\n]*:[0-9]+)["']?[ \t]*$/gm)].map((m) => m[1]);
  afirma("a porta e publicada so em loopback", portas.length > 0 && portas.every((p) => p.startsWith("127.0.0.1:")),
    portas.join(", "));
  afirma("o restart tem teto (nao esconde crash-loop)", /restart: on-failure/.test(yml));
  // A LINHA do comando, e nao o arquivo inteiro: o comentario ao lado explica
  // justamente por que o urlopen saiu, e um teste que casa a explicacao da
  // correcao acusa a correcao.
  const linhaTest = yml.split("\n").find((l) => l.trim().startsWith("test:")) || "";
  afirma("o healthcheck nao usa urlopen (que lanca em 401)", !/urlopen/.test(linhaTest), linhaTest.trim().slice(0, 80));

  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignora */ }
}

console.log("\n=== nenhum nome de cliente, projeto ou maquina em arquivo versionado ===");
// O nucleo e GENERICO: serve a qualquer projeto do usuario, e os projetos dele
// sao clientes diferentes. Um exemplo com o nome de um cliente vaza para o
// repositorio do outro, e um nome de usuario num comentario vira caminho de
// maquina num repo que se pretende compartilhar.
//
// A LISTA DO QUE E PROIBIDO NAO E VERSIONADA. Ela e, por definicao, a lista dos
// clientes e maquinas de quem mantem o nucleo — versiona-la seria cometer o
// erro que ela existe para impedir. Mora em `.claude/nomes-proibidos.local`,
// um regex por linha, ignorado pelo git. Sem o arquivo a checagem e pulada e
// diz isso; nao finge que passou.
{
  const localPath = join(ROOT, ".claude", "nomes-proibidos.local");
  if (!existsSync(localPath)) {
    console.log("  SKIP  nenhum nome especifico — sem .claude/nomes-proibidos.local (um regex por linha)");
  } else {
    const proibidos = readFileSync(localPath, "utf8").split("\n")
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => { try { return new RegExp(l, "i"); } catch { return null; } }).filter(Boolean);
    // Autoria e de proposito.
    const permitidos = new Set([".claude-plugin/marketplace.json", "plugins/core/.claude-plugin/plugin.json"]);
    const r = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
    const arquivos = (r.stdout || "").split("\n").filter((f) => f && !f.endsWith("manual.html") && !permitidos.has(f));
    const achados = [];
    for (const f of arquivos) {
      const txt = ler(f);
      for (const p of proibidos) {
        const m = txt.match(p);
        if (m) { achados.push(`${f}: ${m[0]}`); break; }
      }
    }
    afirma(`nenhum nome especifico (${proibidos.length} padroes locais)`, !achados.length, achados.slice(0, 6).join(" | "));
  }
}

console.log("\n=== deteccao de binario funciona nos dois sistemas ===");
// `command` e builtin do shell. `spawnSync("command", ["-v", x])` sem shell da
// ENOENT no Unix para QUALQUER binario — e quem confiar nisso conclui que nada
// esta instalado. Aconteceu em externa.mjs, testado so no Windows: no Linux o
// diagnostico dizia "CLI nao instalada" com ela no PATH, e `conferir` e
// `servidor subir` recusavam com instalacao sadia. Achado por um colaborador.
{
  // Estatico: a classe do erro nao pode voltar em NENHUM script. So codigo,
  // nao comentario — o comentario que explica o bug cita o padrao.
  const r = spawnSync("git", ["grep", "-n", "-E", 'spawnSync\\(\\s*"(command|type|hash|alias)"', "--", "*.mjs"],
    { cwd: ROOT, encoding: "utf8", timeout: 20000 });
  const linhas = (r.stdout || "").split("\n").filter((l) => {
    if (!l) return false;
    const codigo = l.split(":").slice(2).join(":").trim();
    return !codigo.startsWith("//") && !codigo.startsWith("*");
  });
  afirma("nenhum spawnSync de builtin de shell sem shell", !linhas.length, linhas.slice(0, 3).join(" | "));

  // Dinamico: a deteccao que o nucleo exporta acha o proprio node, aqui.
  const url = pathToFileURL(join(ROOT, "plugins", "core", "hooks", "lib", "detect.mjs")).href;
  const d = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { binExiste } from ${JSON.stringify(url)}; process.stdout.write(binExiste("node") ? "achou" : "NAO");`],
    { encoding: "utf8", timeout: 20000 });
  afirma("binExiste acha o node nesta plataforma", (d.stdout || "").trim() === "achou", (d.stderr || d.stdout || "").slice(0, 120));
}

console.log("\n=== âncoras de drift ===");

// Regras que vivem duplicadas DE PROPÓSITO — a skill precisa ser autocontida, o
// hook precisa explicar o bloqueio sem depender da skill, o comando de setup
// precisa dizer o que vai mudar. Duplicação deliberada tem um custo: uma cópia
// é reescrita e as outras não, e ninguém acusa. Cada âncora abaixo é uma frase
// que TEM de aparecer em todas as cópias do grupo. Mudou a regra? Mude as
// cópias juntas — e a âncora.
//
// Ideia portada do check-init-drift do bc-harness. A comparação normaliza
// acento, caixa, negrito e quebra de linha: a skill escreve "à mão" e o hook
// escreve "a mao", e a regra é a mesma.
const plano = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[*`_]/g, "").replace(/\s+/g, " ");
const ANCORAS = [
  { frase: "quem revisa move a mao, depois de olhar", arquivos: [
    "plugins/core/skills/entregar-trabalho/SKILL.md", "plugins/core/skills/atacar-card/SKILL.md",
    "plugins/core/commands/core-setup.md", "plugins/core/hooks/pre-publish-guard.mjs"] },
  { frase: "por PR e por card, toda vez", arquivos: [
    "plugins/core/skills/entregar-trabalho/SKILL.md", "plugins/core/skills/atacar-card/SKILL.md",
    "plugins/core/commands/core-init.md", "plugins/core/hooks/pre-publish-guard.mjs"] },
  { frase: "o agente consulta; quem alimenta e humano", arquivos: [
    "plugins/core/skills/base-externa/SKILL.md", "plugins/core/commands/core-externa.md",
    "scripts/externa.mjs", "plugins/core/hooks/pre-externa-guard.mjs"] },
  { frase: "credencial de conta inteira", arquivos: [
    "plugins/core/commands/core-externa.md", "plugins/core/commands/core-init.md", "scripts/externa.mjs"] },
  { frase: "conta google descartavel", arquivos: [
    "plugins/core/commands/core-externa.md", "plugins/core/commands/core-init.md", "scripts/externa.mjs"] },
];
for (const { frase, arquivos } of ANCORAS) {
  const faltam = arquivos.filter((a) => !plano(ler(a)).includes(plano(frase)));
  afirma(`"${frase}" em ${arquivos.length} cópias`, !faltam.length, `falta em: ${faltam.join(", ")}`);
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
