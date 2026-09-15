#!/usr/bin/env node
// Preflight: o que este projeto precisa e a maquina nao tem.
//   node scripts/preflight.mjs [/caminho/do/projeto] [--json]
//
// Detecta a stack pelos arquivos de manifesto e confere se as ferramentas que
// ela exige estao instaladas. Rodado na primeira sessao de um projeto novo,
// evita a classe de erro mais irritante que existe: o agente tenta rodar a
// suite, o binario nao existe, e ele passa vinte minutos depurando o projeto
// quando o problema era a maquina.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const PROJECT = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) || process.cwd();
const JSON_OUT = process.argv.includes("--json");

const tem = (f) => existsSync(join(PROJECT, f));
const leia = (f) => { try { return readFileSync(join(PROJECT, f), "utf8"); } catch { return ""; } };

const cacheBin = new Map();
function binExiste(cmd) {
  if (cacheBin.has(cmd)) return cacheBin.get(cmd);
  const r =
    process.platform === "win32"
      ? spawnSync("where", [cmd], { encoding: "utf8", timeout: 5000, windowsHide: true })
      : spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8", timeout: 5000 });
  const ok = r.status === 0 && Boolean((r.stdout || "").trim());
  cacheBin.set(cmd, ok);
  return ok;
}

/**
 * Cada stack declara: como e detectada, os binarios que EXIGE, e os opcionais
 * que melhoram a verificacao sem serem obrigatorios.
 */
const STACKS = [
  {
    nome: "Go",
    detecta: () => tem("go.mod"),
    exige: [{ bin: "go", instala: "https://go.dev/dl/" }],
    opcional: [
      { bin: "gofmt", instala: "vem com o Go" },
      { bin: "golangci-lint", instala: "go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest" },
    ],
    check: ["go build ./...", "go vet ./..."],
    teste: "go test ./...",
  },
  {
    nome: "Node / TypeScript",
    detecta: () => tem("package.json"),
    exige: [{ bin: "node", instala: "https://nodejs.org" }],
    opcional: [{ bin: "npx", instala: "vem com o npm" }],
    check: () => (tem("tsconfig.json") ? ["npx tsc --noEmit"] : []),
    teste: () => {
      const pkg = leia("package.json");
      if (pkg.includes('"vitest"')) return "npx vitest run";
      if (pkg.includes('"jest"')) return "npx jest";
      return JSON.parse(pkg || "{}")?.scripts?.test ? "npm test" : null;
    },
  },
  {
    nome: "Ruby",
    detecta: () => tem("Gemfile"),
    exige: [{ bin: "ruby", instala: "https://www.ruby-lang.org" }, { bin: "bundle", instala: "gem install bundler" }],
    opcional: [{ bin: "rubocop", instala: "adicione ao Gemfile" }],
    check: [],
    teste: () => (leia("Gemfile").includes("rspec") ? "bundle exec rspec" : "bundle exec rake test"),
  },
  {
    nome: "Python",
    detecta: () => tem("pyproject.toml") || tem("requirements.txt"),
    exige: [{ bin: "python", instala: "https://python.org", alt: "python3" }],
    opcional: [{ bin: "ruff", instala: "uv tool install ruff" }, { bin: "pytest", instala: "pip install pytest" }],
    check: [],
    teste: "pytest",
  },
  {
    nome: "Rust",
    detecta: () => tem("Cargo.toml"),
    exige: [{ bin: "cargo", instala: "https://rustup.rs" }],
    opcional: [{ bin: "rustfmt", instala: "rustup component add rustfmt" }],
    check: ["cargo check"],
    teste: "cargo test",
  },
];

const resolve = (v) => (typeof v === "function" ? v() : v);

const detectadas = STACKS.filter((s) => s.detecta());
const faltando = [];
const avisos = [];
let checks = [];
let testes = [];

for (const s of detectadas) {
  for (const dep of s.exige) {
    if (!binExiste(dep.bin) && !(dep.alt && binExiste(dep.alt))) {
      faltando.push({ stack: s.nome, bin: dep.bin, instala: dep.instala });
    }
  }
  for (const dep of s.opcional) {
    if (!binExiste(dep.bin)) avisos.push({ stack: s.nome, bin: dep.bin, instala: dep.instala });
  }
  checks = checks.concat(resolve(s.check) || []);
  const t = resolve(s.teste);
  if (t) testes.push(t);
}

// Docker so entra se o projeto realmente depende dele.
if (tem("docker-compose.yml") || tem("compose.yml") || tem("docker-compose.yaml")) {
  if (!binExiste("docker")) faltando.push({ stack: "Docker", bin: "docker", instala: "https://docs.docker.com/get-docker/" });
}

const resultado = {
  projeto: PROJECT,
  stacks: detectadas.map((s) => s.nome),
  faltando,
  opcionaisAusentes: avisos,
  sugestao: { projectCheck: checks, teste: testes },
};

if (JSON_OUT) {
  console.log(JSON.stringify(resultado, null, 2));
  process.exit(faltando.length ? 1 : 0);
}

console.log(`\nPreflight — ${PROJECT}\n`);

if (!detectadas.length) {
  console.log("  Nenhuma stack conhecida detectada (sem go.mod, package.json, Gemfile, pyproject.toml ou Cargo.toml).");
  console.log("  O nucleo funciona assim mesmo; so nao tem o que verificar automaticamente.\n");
  process.exit(0);
}

console.log(`  Stack: ${resultado.stacks.join(", ")}\n`);

if (faltando.length) {
  console.log("  BLOQUEIA — ferramenta obrigatoria ausente:");
  for (const d of faltando) console.log(`    ${d.bin.padEnd(16)} ${d.instala}`);
  console.log("");
} else {
  console.log("  Todas as ferramentas obrigatorias estao instaladas.\n");
}

if (avisos.length) {
  console.log("  Opcional — melhora a verificacao, nao impede trabalhar:");
  for (const d of avisos) console.log(`    ${d.bin.padEnd(16)} ${d.instala}`);
  console.log("");
}

if (checks.length || testes.length) {
  console.log("  Sugestao para .claude/core.json:\n");
  console.log(
    JSON.stringify({ stopVerify: { projectCheck: checks, testPatterns: testes } }, null, 2)
      .split("\n").map((l) => "    " + l).join("\n")
  );
  console.log("");
}

process.exit(faltando.length ? 1 : 0);
