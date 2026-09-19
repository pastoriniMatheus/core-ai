#!/usr/bin/env node
// Configura o acesso ao tracker de um projeto.
//
//   echo "<token>" | node scripts/tracker-setup.mjs --projeto <dir> --tracker plane \
//                       --url https://plane.exemplo.com --workspace <workspace> [--projeto-id X]
//
//   node scripts/tracker-setup.mjs --projeto <dir> --testar     # so testa o que ja existe
//   node scripts/tracker-setup.mjs --projeto <dir> --detectar   # o projeto ja tem MCP de tracker?
//
// Para testar, o token e procurado em tres lugares, nesta ordem:
//   1. .claude/settings.local.json   (o que o projeto declara)
//   2. o ambiente                    (o que a sessao herdou)
//   3. ~/.claude.json                (env de um servidor MCP deste projeto)
//
// O token entra por STDIN, nunca por argumento: argv aparece em `ps`, fica no
// histórico do shell e vaza em log de CI.
//
// E o script TESTA a conexao antes de dizer que funcionou. Salvar credencial sem
// verificar produz a pior falha possivel: parece configurado, e o primeiro uso
// real falha no meio de outra tarefa.

import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};

const PROJETO = flag("projeto", process.cwd());
const SO_TESTAR = args.includes("--testar");
const SO_DETECTAR = args.includes("--detectar");

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

/**
 * Terceiro lugar onde o token pode morar: o env de um servidor MCP, em
 * ~/.claude.json. Quem fala com o tracker por MCP nao tem copia da credencial
 * em .claude/ — e nao deveria ter mesmo: credencial em dois lugares e
 * credencial que se esquece de rotacionar. Sem esta busca, `--testar` acusa
 * token ausente num projeto cujo acesso ao tracker funciona perfeitamente, e
 * um diagnostico que mente sobre uma configuracao boa custa mais caro que a
 * ausencia dele.
 *
 * Procura so no escopo DESTE projeto e no global. Varrer os demais projetos
 * acharia a credencial de um tracker vizinho e testaria a conexao errada,
 * devolvendo um OK que nao prova nada sobre o projeto em questao.
 *
 * ALIASES: o nome da variavel no MCP raramente e o que este script padroniza.
 * O plane-mcp-server usa PLANE_API_KEY; nosso envPadrao e PLANE_API_TOKEN.
 * Procurar so pelo nome exato acha nada num projeto que funciona.
 */
const ALIASES = {
  PLANE_API_TOKEN: ["PLANE_API_KEY", "PLANE_TOKEN"],
  LINEAR_API_KEY: ["LINEAR_API_TOKEN", "LINEAR_KEY"],
  JIRA_API_TOKEN: ["JIRA_TOKEN", "ATLASSIAN_API_TOKEN"],
  GITHUB_TOKEN: ["GH_TOKEN", "GITHUB_API_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"],
};

/**
 * As chaves de `projects` no ~/.claude.json sao gravadas com BARRA NORMAL, ate
 * no Windows — mas `path.resolve` devolve contrabarra. Comparar os dois direto
 * nunca casa, e a busca por escopo de projeto vira um no-op silencioso.
 * Normalizar separador e caixa e o que faz a comparacao significar algo.
 */
const normalizar = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

function tokenDoMcp(nomeVar, projeto) {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const j = readJson(join(home, ".claude.json"));
  if (!j) return null;

  const chaves = new Set();
  const abs = resolve(projeto);
  chaves.add(abs);
  try { chaves.add(realpathSync(abs)); } catch { /* caminho pode nao existir */ }

  // Comparacao normalizada: as chaves gravadas usam "/" e a caixa pode diferir.
  const alvos = new Set([...chaves].map(normalizar));
  const escopos = Object.entries(j.projects || {})
    .filter(([k]) => alvos.has(normalizar(k)))
    .map(([, v]) => v);
  escopos.push(j); // mcpServers global, fora de qualquer projeto

  const nomes = [nomeVar, ...(ALIASES[nomeVar] || [])];
  for (const escopo of escopos) {
    for (const [nome, servidor] of Object.entries(escopo?.mcpServers || {})) {
      for (const variavel of nomes) {
        const valor = servidor?.env?.[variavel];
        if (valor) {
          return {
            valor,
            origem: `env do servidor MCP "${nome}" em ~/.claude.json` +
              (variavel !== nomeVar ? ` (variavel ${variavel})` : ""),
          };
        }
      }
    }
  }
  return null;
}

/**
 * O projeto ja fala com um tracker por MCP?
 *
 * Perguntar credencial a quem ja configurou tudo e a forma mais rapida de o
 * time concluir que a ferramenta nao entende o proprio ambiente. Ler antes de
 * perguntar vale mais aqui do que em qualquer outro ponto do setup.
 */
function mcpDoProjeto(projeto) {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const j = readJson(join(home, ".claude.json"));
  if (!j) return null;

  const abs = normalizar(resolve(projeto));
  const escopo = Object.entries(j.projects || {}).find(([k]) => normalizar(k) === abs)?.[1];

  for (const fonte of [escopo, j]) {
    for (const [nome, servidor] of Object.entries(fonte?.mcpServers || {})) {
      const env = servidor?.env || {};
      const tracker = ["plane", "linear", "jira", "github"].find(
        (t) => nome.toLowerCase().includes(t) ||
               Object.keys(env).some((k) => k.toLowerCase().startsWith(t))
      );
      if (tracker) return { nome, tracker, env: Object.keys(env), valores: env };
    }
  }
  return null;
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

// --------------------------------------------------------------- detectar
// Leitura pura: diz o que o projeto JA tem, para o comando nao perguntar o que
// ja esta configurado.
if (SO_DETECTAR) {
  const m = mcpDoProjeto(PROJETO);
  console.log(JSON.stringify(m ? { mcp: m.nome, tracker: m.tracker, env: m.env } : null, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- so testar
if (SO_TESTAR) {
  const core = readJson(corePath);
  const local = readJson(localPath);
  const cfg = core?.publish;
  if (!cfg?.tracker) erro("este projeto nao tem tracker configurado. Rode sem --testar.");

  const t = TRACKERS[cfg.tracker];

  // Ordem deliberada: o que o projeto declara vence o que a sessao herdou.
  let token = local?.env?.[cfg.tokenEnv];
  let origem = ".claude/settings.local.json";
  if (!token && process.env[cfg.tokenEnv]) {
    token = process.env[cfg.tokenEnv];
    origem = "ambiente";
  }
  if (!token) {
    const mcp = tokenDoMcp(cfg.tokenEnv, PROJETO);
    if (mcp) ({ valor: token, origem } = mcp);
  }
  if (!token) {
    erro(
      `${cfg.tokenEnv} nao encontrado em .claude/settings.local.json, no ambiente, ` +
        `nem no env de um servidor MCP em ~/.claude.json`
    );
  }

  const r = testarConexao(t.teste(cfg.url, cfg), t.header(token, cfg), t.metodo || "GET", t.corpo);
  console.log(
    r.ok
      ? `\n  OK — ${t.nome} respondeu ${r.status}   (token: ${origem})\n`
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

// GitHub Issues nao tem URL propria: o que identifica o tracker e o
// REPOSITORIO. Sem `publish.repo` o tracker.mjs nao acha o card; sem os
// padroes do `gh` o portao deixava `gh issue close` passar — o estado final,
// que e o unico bloqueio sem escape do nucleo, aberto pelo caminho mais comum.
// `gh issue comment` fica de fora de proposito: comentar nao muda estado.
const github = {};
if (tracker === "github") {
  const remoto = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: PROJETO, encoding: "utf8", windowsHide: true,
  }).stdout || "";
  const repo = remoto.trim().match(/github[.]com[:/]([^/]+\/[^/.\s]+)/)?.[1];
  if (!repo) erro("nao achei um remote do GitHub em `origin` — passe --repo owner/nome");
  github.repo = flag("repo", repo);
  github.doneState = "closed";
  github.forbiddenStates = ["close"]; // `gh issue close 12`: acrescenta aos padroes
  github.padroes = [
    "gh issue (edit|close|reopen|delete|transfer|lock|unlock|pin|unpin)",
    `api[.]github[.]com/repos/${github.repo.replace(/\./g, "[.]")}/issues`,
  ];
}

const core = readJson(corePath) || {};
core.publish = {
  ...(core.publish || {}),
  tracker,
  url: url || undefined,
  ...extra,
  tokenEnv: t.envPadrao,
  ...(github.repo ? { repo: github.repo, doneState: github.doneState, forbiddenStates: github.forbiddenStates } : {}),
  trackerPatterns: [
    ...new Set([
      ...(core.publish?.trackerPatterns || []),
      ...(url ? [url.replace(/^https?:\/\//, "").replace(/\./g, "[.]").replace(/\/$/, "")] : []),
      ...(github.padroes || []),
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
