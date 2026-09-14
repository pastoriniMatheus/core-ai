#!/usr/bin/env node
// Suite de testes dos hooks da Camada 0.
//   node tests/hooks.test.mjs
//
// Um hook errado e pior que hook nenhum: ele bloqueia trabalho legitimo e o time
// desliga tudo na primeira semana. Estes testes existem para que qualquer ajuste
// nos padroes ou na deteccao seja verificado antes de chegar num projeto real.
//
// Sem dependencia externa: roda em qualquer maquina que tenha o Claude Code.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, utimesSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS = join(ROOT, "plugins", "core", "hooks");
const TMP = mkdtempSync(join(tmpdir(), "core-hooks-"));

let passed = 0;
let failed = 0;

/** Roda um hook e classifica a decisao: deny | block | pass. */
function decide(script, input) {
  const r = spawnSync(process.execPath, [join(HOOKS, script)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 30000,
  });
  if ((r.stdout || "").includes('"permissionDecision":"deny"')) return "deny";
  if (r.status === 2) return "block";
  return "pass";
}

function check(name, script, input, expected) {
  const got = decide(script, input);
  if (got === expected) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}  (esperado=${expected} obtido=${got})`);
  }
}

// ---------------------------------------------------------------- fixtures
const f = (name, content) => {
  const p = join(TMP, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
};

const badJson = f("bad.json", '{ "quebrado": ');
const goodJson = f("good.json", '{ "ok": true }');
const badJs = f("bad.js", "const x = 1;\nconsole.log(x\n");
const goodJs = f("good.js", "const x = 1;\nconsole.log(x);\n");
const txt = f("nota.txt", "sem verificador para esta extensao");

/** Monta um transcript JSONL no formato que o Claude Code grava. */
function transcript(name, calls) {
  const lines = calls.map((c) =>
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "tool_use", name: c.name, input: c.input }] },
    })
  );
  return f(name, lines.join("\n") + "\n");
}

// Arquivos REAIS: o filtro de "arquivo ainda existe" faz parte do contrato,
// entao um fixture com caminho ficticio testaria outra coisa.
const srcA = f("src/a.ts", "export const a = 1;\n");
const srcB = f("src/b.ts", "export const b = 2;\n");
const doc = f("src/README.md", "# doc\n");

const editouSemTestar = transcript("t1.jsonl", [
  { name: "Read", input: { file_path: srcA } },
  { name: "Edit", input: { file_path: srcA } },
]);

const editouETestou = transcript("t2.jsonl", [
  { name: "Edit", input: { file_path: srcA } },
  { name: "Bash", input: { command: "npx vitest run" } },
]);

const testouDepoisEditouDeNovo = transcript("t3.jsonl", [
  { name: "Edit", input: { file_path: srcA } },
  { name: "Bash", input: { command: "npx vitest run" } },
  { name: "Edit", input: { file_path: srcB } },
]);

const soLeitura = transcript("t4.jsonl", [
  { name: "Read", input: { file_path: srcA } },
  { name: "Grep", input: { pattern: "foo" } },
]);

const soDoc = transcript("t5.jsonl", [{ name: "Write", input: { file_path: doc } }]);

// ------------------------------------------------------------------- casos
console.log("\n=== dep guard: deve BLOQUEAR dependencia nova ===");
for (const cmd of [
  "npm install lodash",
  "npm i -D vitest",
  "yarn add react",
  "pnpm add zod",
  "bundle add rails",
  "gem install rubocop",
  "pip install requests",
  "poetry add httpx",
  "uv add pydantic",
  "cargo add serde",
  "go get github.com/x/y",
  "composer require monolog/monolog",
]) {
  check(cmd, "pre-bash-guard.mjs", { cwd: TMP, tool_input: { command: cmd } }, "deny");
}

console.log("\n=== dep guard: deve DEIXAR PASSAR ===");
for (const cmd of [
  "npm install", // restaura lockfile, nao adiciona nada
  "bundle install",
  "CORE_DEP_OK=1 npm install lodash", // escape apos subir a escada
  "git status",
  "npm run test",
  "bundle exec rspec",
  "go test ./...",
  "docker compose up -d",
]) {
  check(cmd, "pre-bash-guard.mjs", { cwd: TMP, tool_input: { command: cmd } }, "pass");
}

console.log("\n=== post-edit verify ===");
check("JSON quebrado bloqueia", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: badJson } }, "block");
check("JSON valido passa", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: goodJson } }, "pass");
check("JS com sintaxe quebrada bloqueia", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: badJs } }, "block");
check("JS valido passa", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: goodJs } }, "pass");
check("extensao sem verificador passa", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: txt } }, "pass");
check("sem file_path passa", "post-edit-verify.mjs", { cwd: TMP, tool_input: {} }, "pass");
check("entrada vazia passa", "post-edit-verify.mjs", {}, "pass");

console.log("\n=== stop verify ===");
check("editou codigo e nao testou -> bloqueia", "stop-verify.mjs", { cwd: TMP, transcript_path: editouSemTestar }, "block");
check("editou e testou depois -> passa", "stop-verify.mjs", { cwd: TMP, transcript_path: editouETestou }, "pass");
check("testou e editou de novo -> bloqueia", "stop-verify.mjs", { cwd: TMP, transcript_path: testouDepoisEditouDeNovo }, "block");
check("so leitura -> passa", "stop-verify.mjs", { cwd: TMP, transcript_path: soLeitura }, "pass");
check("so documentacao -> passa", "stop-verify.mjs", { cwd: TMP, transcript_path: soDoc }, "pass");
check("stop_hook_active evita loop", "stop-verify.mjs", { cwd: TMP, transcript_path: editouSemTestar, stop_hook_active: true }, "pass");
check("sem transcript passa", "stop-verify.mjs", { cwd: TMP }, "pass");

console.log("\n=== regressao: escrita por SHELL nao pode escapar ===");
// Encontrado rodando o nucleo numa sessao real: o agente resolveu a tarefa
// inteira por PowerShell, sem tocar em Edit/Write, e nenhum hook viu nada.
// Mesmo buraco que o portao tinha com MCP — um caminho coberto, o outro livre.
{
  const dir = join(TMP, "shell");
  mkdirSync(dir, { recursive: true });
  // Erro que `node --check` realmente pega. `export const x = (1;` NAO serve:
  // no Node 24 a deteccao ambigua de modulo aceita esse trecho, e o fixture
  // testaria o nada.
  writeFileSync(join(dir, "quebrado.js"), "const x = 1;\nconsole.log(x\n");
  writeFileSync(join(dir, "bom.js"), "export const x = 1;\n");
  writeFileSync(join(dir, "ruim.json"), '{ "aberto": ');

  const bash = (cmd) => ({ cwd: dir, tool_name: "Bash", tool_input: { command: cmd } });
  check("cat > arquivo quebrado -> bloqueia", "post-edit-verify.mjs", bash("cat > quebrado.js <<EOF"), "block");
  check("Set-Content em arquivo quebrado -> bloqueia", "post-edit-verify.mjs", bash("Set-Content -Path quebrado.js -Value $t"), "block");
  check("redirect para JSON invalido -> bloqueia", "post-edit-verify.mjs", bash("echo x > ruim.json"), "block");
  check("escrita em arquivo valido -> passa", "post-edit-verify.mjs", bash("cat > bom.js <<EOF"), "pass");
  check("comando sem escrita -> passa", "post-edit-verify.mjs", bash("npm test > /dev/null"), "pass");
  check("git status -> passa", "post-edit-verify.mjs", bash("git status"), "pass");

  // E o Stop tem de contar essa escrita como codigo alterado.
  const soShell = transcript("t8.jsonl", [
    { name: "Bash", input: { command: `cat > ${join(dir, "bom.js")} <<EOF` } },
  ]);
  const shellETestou = transcript("t9.jsonl", [
    { name: "Bash", input: { command: `cat > ${join(dir, "bom.js")} <<EOF` } },
    { name: "Bash", input: { command: "npx vitest run" } },
  ]);
  check("escreveu por shell e nao testou -> bloqueia", "stop-verify.mjs", { cwd: dir, transcript_path: soShell }, "block");
  check("escreveu por shell e testou -> passa", "stop-verify.mjs", { cwd: dir, transcript_path: shellETestou }, "pass");
}

console.log("\n=== regressao: arquivo apagado nao exige prova ===");
// Encontrado rodando o hook numa sessao REAL, nao aqui: um scratch criado e
// depois apagado ficava pendurado como "sem prova" pelo resto da sessao e
// bloqueava o encerramento. Arquivo que nao existe mais nao quebra nada.
{
  const apagado = join(TMP, "src", "sumiu.go"); // nunca criado: simula o apagado
  const soApagado = transcript("t6.jsonl", [{ name: "Write", input: { file_path: apagado } }]);
  const misto = transcript("t7.jsonl", [
    { name: "Write", input: { file_path: apagado } },
    { name: "Edit", input: { file_path: srcA } },
  ]);
  check("so arquivo apagado -> nao bloqueia", "stop-verify.mjs", { cwd: TMP, transcript_path: soApagado }, "pass");
  check("apagado + vivo -> bloqueia pelo vivo", "stop-verify.mjs", { cwd: TMP, transcript_path: misto }, "block");
}

console.log("\n=== portao de publicacao: PR ===");
const pub = (cmd, transcript) => ({
  cwd: TMP,
  transcript_path: transcript,
  tool_input: { command: cmd },
});

check("gh pr create sem prova -> nega", "pre-publish-guard.mjs", pub("gh pr create --fill", editouSemTestar), "deny");
check("gh pr create com prova -> nega mesmo assim (falta autorizacao)", "pre-publish-guard.mjs", pub("gh pr create --fill", editouETestou), "deny");
check("gh pr ready -> nega", "pre-publish-guard.mjs", pub("gh pr ready 42", editouETestou), "deny");
check("gh pr merge -> nega", "pre-publish-guard.mjs", pub("gh pr merge 42", editouETestou), "deny");
check("glab mr create -> nega", "pre-publish-guard.mjs", pub("glab mr create", editouETestou), "deny");
check("push --force -> nega", "pre-publish-guard.mjs", pub("git push --force origin x", editouETestou), "deny");
check("autorizado -> passa", "pre-publish-guard.mjs", pub("CORE_PUBLISH_OK=1 gh pr create --fill", editouETestou), "pass");
check("gh pr view (leitura) -> passa", "pre-publish-guard.mjs", pub("gh pr view 42", editouETestou), "pass");
check("gh pr list (leitura) -> passa", "pre-publish-guard.mjs", pub("gh pr list", editouETestou), "pass");
check("git push comum -> passa", "pre-publish-guard.mjs", pub("git push -u origin feature/x", editouETestou), "pass");
check("git commit -> passa", "pre-publish-guard.mjs", pub('git commit -m "wip"', editouETestou), "pass");

console.log("\n=== portao de publicacao: tracker (camada de projeto) ===");
// Um projeto real declara trackerPatterns no .claude/core.json; aqui simulamos isso.
mkdirSync(join(TMP, "com-tracker", ".claude"), { recursive: true });
writeFileSync(
  join(TMP, "com-tracker", ".claude", "core.json"),
  JSON.stringify({
    publish: { trackerPatterns: ["tracker[.]exemplo[.]com/api"], reviewState: "In Review", doneState: "Done" },
  })
);
const T2 = join(TMP, "com-tracker");
const trk = (cmd, transcript) => ({ cwd: T2, transcript_path: transcript, tool_input: { command: cmd } });

check(
  "mover para In Review -> nega (falta autorizacao)",
  "pre-publish-guard.mjs",
  trk(`curl -X PATCH tracker.exemplo.com/api/issues/1 -d '{"state":"In Review"}'`, editouETestou),
  "deny"
);
check(
  "mover para In Review autorizado -> passa",
  "pre-publish-guard.mjs",
  trk(`CORE_PUBLISH_OK=1 curl -X PATCH tracker.exemplo.com/api/issues/1 -d '{"state":"In Review"}'`, editouETestou),
  "pass"
);
check(
  "tracker nao declarado no nucleo -> passa",
  "pre-publish-guard.mjs",
  pub(`curl -X PATCH tracker.exemplo.com/api/issues/1 -d '{"state":"Done"}'`, editouETestou),
  "pass"
);

console.log("\n=== estado final: bloqueio SEM escape ===");
check(
  'mover para "Done" -> nega',
  "pre-publish-guard.mjs",
  trk(`curl -X PATCH tracker.exemplo.com/api/issues/1 -d '{"state":"Done"}'`, editouETestou),
  "deny"
);
check(
  'mover para "Done" COM autorizacao -> nega mesmo assim',
  "pre-publish-guard.mjs",
  trk(`CORE_PUBLISH_OK=1 curl -X PATCH tracker.exemplo.com/api/issues/1 -d '{"state":"Done"}'`, editouETestou),
  "deny"
);
check(
  'mover para "concluido" -> nega',
  "pre-publish-guard.mjs",
  trk(`curl -X PATCH tracker.exemplo.com/api/issues/1 -d '{"state":"concluido"}'`, editouETestou),
  "deny"
);

console.log("\n=== YAML ===");
const badYaml = f("bad.yml", "chave: valor\n  indentacao: errada\n\tcom-tab: 1\n");
const goodYaml = f("good.yml", "chave: valor\nlista:\n  - a\n  - b\n");
// Se nao houver yq nem PyYAML na maquina, ambos passam: degradacao silenciosa.
const temYamlTool =
  decide("post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: badYaml } }) === "block";
if (temYamlTool) {
  check("YAML quebrado bloqueia", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: badYaml } }, "block");
  check("YAML valido passa", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: goodYaml } }, "pass");
} else {
  console.log("  SKIP  nenhum validador de YAML instalado (yq/PyYAML) — degradou em silencio, que e o esperado");
  check("YAML sem validador nao quebra", "post-edit-verify.mjs", { cwd: TMP, tool_input: { file_path: badYaml } }, "pass");
}

console.log("\n=== portao de publicacao: MCP ===");
// Um hook so de Bash deixaria passar livre qualquer tracker acessado por MCP,
// que e justamente o caminho preferido.
const mcp = (nome, args, transcript = editouETestou, cwd = TMP) => ({
  cwd,
  transcript_path: transcript,
  tool_name: nome,
  tool_input: args,
});

check("mcp plane update_issue -> nega", "pre-publish-guard.mjs",
  mcp("mcp__plane__update_issue", { id: "CRM-1", state: "In Review" }), "deny");
check("mcp linear issue update -> nega", "pre-publish-guard.mjs",
  mcp("mcp__linear__update_issue", { id: "X", stateId: "review" }), "deny");
check("mcp github create_pull_request -> nega", "pre-publish-guard.mjs",
  mcp("mcp__github__create_pull_request", { title: "x", base: "main" }), "deny");
check("mcp de leitura -> passa", "pre-publish-guard.mjs",
  mcp("mcp__github__get_file_contents", { path: "README.md" }), "pass");
check("mcp sem relacao -> passa", "pre-publish-guard.mjs",
  mcp("mcp__chrome__navigate", { url: "https://exemplo.com" }), "pass");

// Done via MCP: bloqueio sem escape, igual ao caminho Bash.
check('mcp movendo para "Done" -> nega', "pre-publish-guard.mjs",
  mcp("mcp__plane__update_issue", { id: "CRM-1", state: "Done" }), "deny");

// Token one-shot: autoriza uma vez, e so uma.
{
  const dir = join(TMP, "mcp-token");
  mkdirSync(join(dir, ".claude", "core-state"), { recursive: true });
  writeFileSync(join(dir, ".claude", "core-state", "publish-ok"), "");
  check("com token -> passa", "pre-publish-guard.mjs",
    mcp("mcp__plane__update_issue", { id: "A", state: "In Review" }, editouETestou, dir), "pass");
  check("token foi consumido, 2a chamada -> nega", "pre-publish-guard.mjs",
    mcp("mcp__plane__update_issue", { id: "B", state: "In Review" }, editouETestou, dir), "deny");
}

// Token vencido nao autoriza.
{
  const dir = join(TMP, "mcp-token-velho");
  mkdirSync(join(dir, ".claude", "core-state"), { recursive: true });
  const tok = join(dir, ".claude", "core-state", "publish-ok");
  writeFileSync(tok, "");
  const antigo = new Date(Date.now() - 3600_000);
  utimesSync(tok, antigo, antigo);
  check("token de uma hora atras -> nega", "pre-publish-guard.mjs",
    mcp("mcp__plane__update_issue", { id: "C", state: "In Review" }, editouETestou, dir), "deny");
}

console.log("\n=== regressao: ferramenta ausente NAO pode bloquear ===");
// Com shell:true, um binario inexistente nao produz ENOENT — o shell executa e
// devolve erro comum, indistinguivel de "o linter reprovou". Sem a checagem
// previa de existencia, uma maquina sem rubocop bloquearia toda edicao de .rb.
const comFerramentaFalsa = join(TMP, "bin-falso", ".claude");
mkdirSync(comFerramentaFalsa, { recursive: true });
writeFileSync(
  join(comFerramentaFalsa, "core.json"),
  JSON.stringify({ verify: { byExtension: { ".xyz": [["ferramenta-que-nao-existe-abc", "{file}"]] } } })
);
const arqXyz = f("bin-falso/alvo.xyz", "conteudo qualquer");
check(
  "verificador inexistente -> passa (nao bloqueia)",
  "post-edit-verify.mjs",
  { cwd: join(TMP, "bin-falso"), tool_input: { file_path: arqXyz } },
  "pass"
);

console.log("\n=== deteccao de binario: os DOIS ramos ===");
// binExiste escolhe `where` no Windows e `sh -c command -v` no resto. So um dos
// ramos roda em cada maquina, entao o outro nunca seria exercitado. Aqui os dois
// sao testados sempre que o localizador existir — e o que impede a suite de
// passar no Windows e o hook quebrar no Mac de outra pessoa.
function localizador(qual, bin) {
  const r =
    qual === "where"
      ? spawnSync("where", [bin], { encoding: "utf8", timeout: 5000, windowsHide: true })
      : spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8", timeout: 5000 });
  return { disponivel: !r.error, achou: r.status === 0 && Boolean((r.stdout || "").trim()) };
}

for (const qual of ["where", "sh"]) {
  const presente = localizador(qual, "node");
  if (!presente.disponivel) {
    console.log(`  SKIP  ramo "${qual}" — localizador nao existe nesta maquina`);
    continue;
  }
  const ausente = localizador(qual, "binario-que-nao-existe-xyz");
  if (presente.achou && !ausente.achou) {
    passed++;
    console.log(`  PASS  ramo "${qual}" distingue binario presente de ausente`);
  } else {
    failed++;
    console.log(`  FAIL  ramo "${qual}" (node=${presente.achou} inexistente=${ausente.achou})`);
  }
}

console.log("\n=== check de projeto no Stop ===");
function projeto(nome, projectCheck) {
  const dir = join(TMP, nome, ".claude");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "core.json"), JSON.stringify({ stopVerify: { projectCheck } }));
  return join(TMP, nome);
}
const falha = process.platform === "win32" ? "cmd /c exit 1" : "sh -c 'exit 1'";
check(
  "projectCheck que falha bloqueia",
  "stop-verify.mjs",
  { cwd: projeto("pc-falha", [falha]), transcript_path: editouETestou },
  "block"
);
check(
  "projectCheck que passa nao bloqueia",
  "stop-verify.mjs",
  { cwd: projeto("pc-ok", ["node --version"]), transcript_path: editouETestou },
  "pass"
);
check(
  "projectCheck so roda se houve edicao de codigo",
  "stop-verify.mjs",
  { cwd: projeto("pc-idle", [falha]), transcript_path: soLeitura },
  "pass"
);
check(
  "comando inexistente no projectCheck nao bloqueia",
  "stop-verify.mjs",
  { cwd: projeto("pc-enoent", ["comando-que-nao-existe-xyz"]), transcript_path: editouETestou },
  "block" // shell existe e devolve erro: reprova de verdade, e correto avisar
);

console.log("\n=== aviso de projeto nao configurado ===");
function avisa(cwd) {
  const r = spawnSync(process.execPath, [join(HOOKS, "session-start.mjs")], {
    input: JSON.stringify({ cwd, hook_event_name: "SessionStart" }),
    encoding: "utf8",
    timeout: 15000,
  });
  return (r.stdout || "").includes("additionalContext");
}
const semConfig = join(TMP, "sem-config");
mkdirSync(semConfig, { recursive: true });
if (avisa(semConfig)) { passed++; console.log("  PASS  projeto sem core.json -> avisa"); }
else { failed++; console.log("  FAIL  projeto sem core.json -> deveria avisar"); }

const configurado = join(TMP, "configurado", ".claude");
mkdirSync(configurado, { recursive: true });
writeFileSync(
  join(configurado, "core.json"),
  JSON.stringify({
    publish: { trackerPatterns: ["x[.]y/api"], baseBranch: "main" },
    stopVerify: { projectCheck: ["node --version"] },
  })
);
if (!avisa(join(TMP, "configurado"))) { passed++; console.log("  PASS  projeto configurado -> silencio"); }
else { failed++; console.log("  FAIL  projeto configurado -> nao deveria avisar"); }

console.log("\n=== regressao: instalador nao pode divergir do plugin ===");
// Ja aconteceu: o matcher ganhou `Bash` no hooks.json do plugin, o instalador
// tinha a lista duplicada e hardcoded, e a correcao existia no codigo sem nunca
// chegar aos projetos. Agora o instalador LE o hooks.json — este teste garante.
{
  const alvo = join(TMP, "divergencia");
  mkdirSync(alvo, { recursive: true });
  spawnSync(process.execPath, [join(ROOT, "scripts", "install.mjs"), alvo], { encoding: "utf8", timeout: 30000 });

  const plugin = JSON.parse(readFileSync(join(ROOT, "plugins", "core", "hooks", "hooks.json"), "utf8")).hooks;
  // Modo local poe os hooks no settings.local.json (fora do git). O
  // settings.json versionado fica sem caminho de maquina nenhum.
  let instalado = {};
  try { instalado = JSON.parse(readFileSync(join(alvo, ".claude", "settings.local.json"), "utf8")).hooks || {}; } catch { /* fica vazio */ }

  const assinatura = (grupos) => (grupos || []).map((g) => `${g.matcher || "*"}:${(g.hooks || []).length}`).join("|");

  for (const evento of Object.keys(plugin)) {
    const igual = assinatura(plugin[evento]) === assinatura(instalado[evento]);
    if (igual) {
      passed++;
      console.log(`  PASS  ${evento} instalado igual ao plugin`);
    } else {
      failed++;
      console.log(`  FAIL  ${evento} divergiu\n         plugin:  ${assinatura(plugin[evento])}\n         projeto: ${assinatura(instalado[evento])}`);
    }
  }

  // Hooks sem skills e meio sistema: o CLAUDE.md aponta para skills que nao
  // existiriam. O modo local so instalava hooks — isso passou despercebido ate
  // alguem perguntar "preciso habilitar alguma skill?".
  const noNucleo = readdirSync(join(ROOT, "plugins", "core", "skills"));
  const noProjeto = (() => { try { return readdirSync(join(alvo, ".claude", "skills")); } catch { return []; } })();
  const faltam = noNucleo.filter((s) => !noProjeto.includes(s));
  if (!faltam.length && noNucleo.length) {
    passed++;
    console.log(`  PASS  as ${noNucleo.length} skills chegaram ao projeto`);
  } else {
    failed++;
    console.log(`  FAIL  skills faltando no projeto: ${faltam.join(", ") || "(nenhuma skill no nucleo?)"}`);
  }

  const comandos = (() => { try { return readdirSync(join(alvo, ".claude", "commands")); } catch { return []; } })();
  if (comandos.length >= 3) {
    passed++;
    console.log(`  PASS  os comandos chegaram (${comandos.length})`);
  } else {
    failed++;
    console.log(`  FAIL  comandos faltando: so ${comandos.length} instalado(s)`);
  }

  // Um comando com placeholder nao resolvido manda o agente rodar um caminho falso.
  const naoResolvidos = comandos.filter((c) =>
    readFileSync(join(alvo, ".claude", "commands", c), "utf8").includes("{{")
  );
  if (!naoResolvidos.length) {
    passed++;
    console.log("  PASS  nenhum placeholder sobrou nos comandos");
  } else {
    failed++;
    console.log(`  FAIL  placeholder nao resolvido em: ${naoResolvidos.join(", ")}`);
  }

  // Nada que seja VERSIONADO pode carregar o caminho de uma maquina especifica:
  // no clone do colega, o hook aponta para um diretorio que nao existe e o
  // /core-doctor roda um caminho falso. Hooks e o valor da variavel vao para
  // settings.local.json, que fica fora do git.
  const raizDoNucleo = ROOT.split("\\").join("/");
  const versionados = [
    join(alvo, ".claude", "settings.json"),
    join(alvo, ".claude", "core.json"),
    ...comandos.map((c) => join(alvo, ".claude", "commands", c)),
    ...noProjeto.map((s) => join(alvo, ".claude", "skills", s, "SKILL.md")),
  ];
  const vazaram = versionados.filter((p) => {
    try { return readFileSync(p, "utf8").includes(raizDoNucleo); } catch { return false; }
  });
  if (!vazaram.length) {
    passed++;
    console.log("  PASS  nenhum caminho de maquina em arquivo versionado");
  } else {
    failed++;
    console.log(`  FAIL  caminho absoluto vazou para: ${vazaram.map((p) => p.split(/[\\/]/).pop()).join(", ")}`);
  }

  const local = (() => {
    try { return JSON.parse(readFileSync(join(alvo, ".claude", "settings.local.json"), "utf8")); } catch { return {}; }
  })();
  if (local.hooks && local.env?.AGENT_CORE_ROOT) {
    passed++;
    console.log("  PASS  hooks e AGENT_CORE_ROOT no settings.local.json");
  } else {
    failed++;
    console.log("  FAIL  settings.local.json sem hooks ou sem AGENT_CORE_ROOT");
  }
}

// ------------------------------------------------------------------ saida
console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed === 0 ? 0 : 1);
