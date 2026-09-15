// Autodeteccao de verificacao por linguagem.
//
// Principio: nunca exigir configuracao para funcionar, nunca falhar ruidosamente
// quando a ferramenta nao existe. Cada extensao tem uma lista de candidatos em
// ordem de preferencia; o runner tenta o primeiro que estiver instalado e para.
// Ferramenta ausente == hook silencioso, nao hook quebrado.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const has = (cwd, f) => existsSync(join(cwd, f));

function gemfileHas(cwd, gem) {
  try {
    return readFileSync(join(cwd, "Gemfile"), "utf8").includes(gem);
  } catch {
    return false;
  }
}

function hasEslintConfig(cwd) {
  return [
    "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
    ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml",
  ].some((f) => has(cwd, f));
}

/**
 * Candidatos de verificacao para um arquivo, do mais informativo ao mais basico.
 * O ultimo de cada lista e sempre um syntax-check da propria runtime: barato,
 * sem dependencia de tooling, e ja pega a classe de erro mais comum do agente.
 */
export function candidatesFor(file, cwd) {
  const ext = extname(file).toLowerCase();

  switch (ext) {
    case ".rb":
      return [
        gemfileHas(cwd, "rubocop") && ["bundle", ["exec", "rubocop", "--force-exclusion", "--format", "simple", file]],
        ["rubocop", ["--force-exclusion", "--format", "simple", file]],
        ["ruby", ["-c", file]],
      ].filter(Boolean);

    case ".ts": case ".tsx": case ".mts": case ".cts":
      // tsc --noEmit e de projeto inteiro e caro: pertence ao Stop, nao ao PostToolUse.
      return hasEslintConfig(cwd) ? [["npx", ["--no-install", "eslint", "--format", "unix", file]]] : [];

    case ".js": case ".jsx": case ".mjs": case ".cjs":
      return [
        hasEslintConfig(cwd) && ["npx", ["--no-install", "eslint", "--format", "unix", file]],
        ["node", ["--check", file]],
      ].filter(Boolean);

    case ".py":
      return [
        ["ruff", ["check", file]],
        ["python", ["-m", "py_compile", file]],
        ["python3", ["-m", "py_compile", file]],
      ];

    case ".go":
      return [["gofmt", ["-l", "-e", file]]];

    case ".php":
      return [["php", ["-l", file]]];

    case ".sh": case ".bash":
      return [
        ["shellcheck", ["-f", "gcc", file]],
        ["bash", ["-n", file]],
      ];

    case ".swift":
      // -parse faz so a analise sintatica: nao resolve imports nem compila.
      return [["swiftc", ["-parse", file]]];

    case ".kt": case ".kts":
      return [["ktlint", ["--log-level=error", file]]];

    case ".rs": case ".java": case ".cs": case ".scala":
      // Nao ha verificacao por ARQUIVO confiavel nestas linguagens: o
      // compilador precisa do projeto inteiro (crate, classpath, solution), e
      // rodar isso a cada edicao custaria minutos.
      //
      // O buraco e fechado no outro extremo: `stopVerify.projectCheck` roda o
      // build/typecheck completo UMA vez, antes de encerrar a sessao.
      return [];

    default:
      return [];
  }
}

/**
 * YAML quebrado e um dos erros mais caros e mais silenciosos: derruba CI,
 * compose e manifesto sem mensagem util. O Node nao tem parser YAML nativo,
 * entao dependemos do que a maquina ja tiver.
 */
export function yamlCandidates(file) {
  const checker = join(dirname(fileURLToPath(import.meta.url)), "yamlcheck.py");
  return [
    ["yq", ["eval", ".", file]],
    ["python", [checker, file]],
    ["python3", [checker, file]],
  ];
}

/**
 * JSON tem verificacao de graca dentro do proprio Node: sem spawn, sem tooling.
 * JSON quebrado e um dos erros mais comuns e mais silenciosos de agente.
 */
export function verifyJsonInline(file) {
  try {
    JSON.parse(readFileSync(file, "utf8"));
    return null;
  } catch (err) {
    return `JSON invalido em ${file}: ${err.message}`;
  }
}

const cacheBin = new Map();

/**
 * O binario existe nesta maquina?
 *
 * Perguntar ANTES de rodar, em vez de deduzir do resultado, e o unico jeito
 * confiavel. Rodar `rubocop` com `shell: true` numa maquina sem rubocop nao
 * produz ENOENT: o shell existe, executa, e devolve erro comum — indistinguivel
 * de "o linter reprovou o arquivo". O hook bloquearia toda edicao de .rb numa
 * maquina sem a ferramenta, que e o oposto da degradacao silenciosa.
 *
 * O exit code tambem nao serve: cmd.exe deveria devolver 9009 e devolve 1.
 */
function binExiste(cmd) {
  if (cacheBin.has(cmd)) return cacheBin.get(cmd);
  const r =
    process.platform === "win32"
      ? spawnSync("where", [cmd], { encoding: "utf8", timeout: 5000, windowsHide: true })
      : spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8", timeout: 5000 });

  // `where` pode devolver varios caminhos; o primeiro e o que seria executado.
  // Guardar o caminho RESOLVIDO permite rodar sem shell — e rodar sem shell e o
  // que faz um arquivo sob "C:\meu projeto\" ser verificado em vez de virar
  // dois argumentos. Com shell:true o Node junta argv sem aspas, e o linter
  // recebia "C:\meu" como alvo: reprovava com um erro que ninguem consegue
  // corrigir, bloqueando toda edicao de quem tem espaco no caminho.
  const caminho = r.status === 0 ? (r.stdout || "").split(/\r?\n/)[0].trim() : "";
  cacheBin.set(cmd, caminho || false);
  return caminho || false;
}

/**
 * Roda o primeiro candidato instalado. Retorna null se passou, se nada estava
 * instalado, ou se estourou o timeout; string com a saida se reprovou.
 */
export function runFirstAvailable(candidates, cwd, timeoutMs) {
  for (const [cmd, args] of candidates) {
    const caminho = binExiste(cmd);
    if (!caminho) continue; // nao instalado: tenta o proximo

    // SEM shell, e com o caminho resolvido: o Node passa cada argumento
    // separado, e um arquivo em "C:\meu projeto\" chega inteiro ao linter.
    // O caminho completo tambem resolve o .cmd/.bat do npm no Windows, que era
    // o motivo original do shell.
    const r = spawnSync(caminho, args, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf8",
      windowsHide: true,
    });

    if (r.error) return null;        // timeout ou falha de spawn: nao atrapalha
    if (r.status === 0) return null; // passou

    const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
    return out ? `${cmd}: ${out}` : null;
  }
  return null; // nenhuma ferramenta disponivel para esta extensao
}
