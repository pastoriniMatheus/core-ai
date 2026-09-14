#!/usr/bin/env node
// Configura o acesso ao tracker de um projeto.
//
//   echo "<token>" | node scripts/tracker-setup.mjs --projeto <dir> --tracker plane \
//                       --url https://plane.exemplo.com --workspace evolution [--projeto-id X]
//
//   node scripts/tracker-setup.mjs --projeto <dir> --testar     # so testa o que ja existe
//
// O token entra por STDIN, nunca por argumento: argv aparece em `ps`, fica no
// histórico do shell e vaza em log de CI.
//
// E o script TESTA a conexao antes de dizer que funcionou. Salvar credencial sem
// verificar produz a pior falha possivel: parece configurado, e o primeiro uso
// real falha no meio de outra tarefa.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};

const PROJETO = flag("projeto", process.cwd());
const SO_TESTAR = args.includes("--testar");

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const claudeDir = join(PROJETO, ".claude");
const corePath = join(claudeDir, "core.json");
const localPath = join(claudeDir, "settings.local.json");

// Cada tracker: como montar a URL de teste, que header usa, e o padrao que o
// portao de publicacao precisa reconhecer.
const TRACKERS = {
  plane: {
    nome: "Plane",
    envPadrao: "PLANE_API_TOKEN",
    header: (t) => ["X-API-Key: " + t],
    teste: (url, { workspace }) =>
      `${url.replace(/\/$/, "")}/api/v1/workspaces/${workspace}/projects/`,
    precisa: ["workspace"],
  },
  linear: {
    nome: "Linear",
    envPadrao: "LINEAR_API_KEY",
    header: (t) => ["Authorization: " + t, "Content-Type: application/json"],
    teste: () => "https://api.linear.app/graphql",
    metodo: "POST",
    corpo: '{"query":"{ viewer { id name } }"}',
    precisa: [],
  },
  jira: {
    nome: "Jira",
    envPadrao: "JIRA_API_TOKEN",
    header: (t, { email }) =>
      ["Authorization: Basic " + Buffer.from(`${email}:${t}`).toString("base64")],
    teste: (url) => `${url.replace(/\/$/, "")}/rest/api/3/myself`,
    precisa: ["email"],
  },
  github: {
    nome: "GitHub Issues",
    envPadrao: "GITHUB_TOKEN",
    header: (t) => ["Authorization: Bearer " + t],
    teste: () => "https://api.github.com/user",
    precisa: [],
  },
};

function erro(msg) {
  console.error(`\n  ERRO: ${msg}\n`);
  process.exit(1);
}

async function lerStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim();
}

/** Chama a API e devolve o status HTTP. curl porque nao exige dependencia. */
function testarConexao(url, headers, metodo = "GET", corpo = null) {
  const a = ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "20", "-X", metodo];
  for (const h of headers) a.push("-H", h);
  if (corpo) a.push("-d", corpo);
  a.push(url);
  const r = spawnSync("curl", a, { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (r.error) return { ok: false, motivo: `curl nao pode ser executado (${r.error.code})` };
  const status = parseInt((r.stdout || "").trim(), 10);
  return { ok: status >= 200 && status < 300, status };
}

// ---------------------------------------------------------------- so testar
if (SO_TESTAR) {
  const core = readJson(corePath);
  const local = readJson(localPath);
  const cfg = core?.publish;
  if (!cfg?.tracker) erro("este projeto nao tem tracker configurado. Rode sem --testar.");

  const t = TRACKERS[cfg.tracker];
  const token = local?.env?.[cfg.tokenEnv] || process.env[cfg.tokenEnv];
  if (!token) erro(`${cfg.tokenEnv} nao encontrado em .claude/settings.local.json nem no ambiente`);

  const r = testarConexao(t.teste(cfg.url, cfg), t.header(token, cfg), t.metodo || "GET", t.corpo);
  console.log(
    r.ok
      ? `\n  OK — ${t.nome} respondeu ${r.status}\n`
      : `\n  FALHOU — ${r.motivo || `HTTP ${r.status}`}\n`
  );
  process.exit(r.ok ? 0 : 1);
}

// ------------------------------------------------------------- configurar
const tracker = (flag("tracker") || "").toLowerCase();
if (!TRACKERS[tracker]) {
  erro(`--tracker precisa ser um de: ${Object.keys(TRACKERS).join(", ")}`);
}
const t = TRACKERS[tracker];

const extra = {};
for (const campo of t.precisa) {
  const v = flag(campo);
  if (!v) erro(`${t.nome} exige --${campo}`);
  extra[campo] = v;
}

const url = flag("url", "");
if (t.teste.length > 0 && !url && tracker !== "linear" && tracker !== "github") {
  erro(`--url e obrigatoria para ${t.nome}`);
}

// --- o token so entra se o REPOSITORIO se proteger sozinho -----------------
// Antes de pedir o token, nunca depois: um token commitado entra no historico e
// nao sai mais, mesmo apagando o arquivo no commit seguinte.
//
// E nao basta `check-ignore` dizer "ignorado": a regra pode vir do gitignore
// GLOBAL da maquina de quem configurou. Nesse caso o arquivo esta protegido
// aqui e desprotegido no clone de qualquer colega — que e exatamente onde o
// vazamento acontece sem ninguem ver. O .gitignore DO REPO tem de cobrir.
const dentroDeGit = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
  cwd: PROJETO, encoding: "utf8", windowsHide: true,
}).status === 0;

if (dentroDeGit) {
  const v = spawnSync("git", ["check-ignore", "-v", ".claude/settings.local.json"], {
    cwd: PROJETO, encoding: "utf8", windowsHide: true,
  });
  // Formato: <fonte>:<linha>:<padrao>\t<arquivo>. Um split(":") simples quebra
  // no "C:" de um caminho Windows — a regex ancora no ":<numero>:" que separa.
  const fonte = ((v.stdout || "").match(/^(.+?):(\d+):/)?.[1] || "").replace(/^"|"$/g, "").replace(/\\/g, "\\");
  const ignorado = v.status === 0;
  const pelaMaquina = ignorado && !/(^|[\\/])\.gitignore$/.test(fonte);

  if (!ignorado) {
    erro(
      ".claude/settings.local.json NAO esta ignorado neste repositorio.\n" +
      "  Acrescente a linha abaixo ao .gitignore e rode de novo:\n\n" +
      "      .claude/settings.local.json\n"
    );
  }
  if (pelaMaquina) {
    erro(
      "o arquivo so esta ignorado por uma regra GLOBAL desta maquina:\n" +
      `      ${fonte}\n\n` +
      "  No clone de um colega sem essa regra, o token seria commitavel.\n" +
      "  Acrescente a linha ao .gitignore DO REPOSITORIO e rode de novo:\n\n" +
      "      .claude/settings.local.json\n"
    );
  }
}

const token = await lerStdin();
if (!token) erro("nenhum token recebido pelo stdin. Use:  echo \"<token>\" | node ...");

// --- testar ANTES de gravar ------------------------------------------------
console.log(`\n  Testando ${t.nome}...`);
const r = testarConexao(t.teste(url, extra), t.header(token, extra), t.metodo || "GET", t.corpo);
if (!r.ok) {
  erro(
    `${t.nome} respondeu ${r.motivo || "HTTP " + r.status}.\n` +
    "  Nada foi gravado. Confira a URL, o token e as permissoes dele."
  );
}
console.log(`  OK — respondeu ${r.status}\n`);

// --- gravar ----------------------------------------------------------------
mkdirSync(claudeDir, { recursive: true });

const local = readJson(localPath) || {};
local.env = { ...(local.env || {}), [t.envPadrao]: token };
writeFileSync(localPath, JSON.stringify(local, null, 2) + "\n");

const core = readJson(corePath) || {};
core.publish = {
  ...(core.publish || {}),
  tracker,
  url: url || undefined,
  ...extra,
  tokenEnv: t.envPadrao,
  trackerPatterns: [
    ...new Set([
      ...(core.publish?.trackerPatterns || []),
      ...(url ? [url.replace(/^https?:\/\//, "").replace(/\./g, "[.]").replace(/\/$/, "")] : []),
      `mcp__[^ ]*${tracker}`,
    ]),
  ],
};
writeFileSync(corePath, JSON.stringify(core, null, 2) + "\n");

console.log(`  .claude/settings.local.json   ${t.envPadrao}  (fora do git)`);
console.log(`  .claude/core.json             tracker, url e trackerPatterns  (versionavel)\n`);
console.log(`  O portao de publicacao agora reconhece comandos do ${t.nome}:`);
console.log(`  mover card exige sua permissao, e o estado final continua sendo`);
console.log(`  movido a mao por quem revisa.\n`);
console.log(`  Reteste quando quiser:  node scripts/tracker-setup.mjs --projeto "${PROJETO}" --testar\n`);
