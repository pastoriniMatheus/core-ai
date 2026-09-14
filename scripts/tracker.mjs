#!/usr/bin/env node
// Acesso ao tracker configurado pelo projeto — genérico por construção.
//
//   node scripts/tracker.mjs --projeto <dir> card CRM-540
//   node scripts/tracker.mjs --projeto <dir> mine
//   node scripts/tracker.mjs --projeto <dir> states
//   echo "texto" | node scripts/tracker.mjs --projeto <dir> comment CRM-540 -
//   node scripts/tracker.mjs --projeto <dir> move CRM-540 "In Review"
//
// A configuração vem de .claude/core.json (qual tracker, URL, workspace) e o
// token de .claude/settings.local.json. Nada aqui sabe o nome de nenhuma
// empresa: trocar de Plane para Linear é trocar uma linha de configuração.
//
// `move` existe mas é interceptado pelo portão de publicação: mover card exige
// autorização explícita, e o estado final é bloqueado sem escape.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const PROJETO = flag("projeto", process.cwd());
const posicionais = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--projeto");
const [comando, ...resto] = posicionais;

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

function erro(msg, dica = "") {
  console.error(`\n  ERRO: ${msg}${dica ? "\n  " + dica : ""}\n`);
  process.exit(1);
}

// ------------------------------------------------------------- configuração
const core = readJson(join(PROJETO, ".claude", "core.json"));
const cfg = core?.publish;
if (!cfg?.tracker) {
  erro("este projeto não tem tracker configurado.", "Rode /core-tracker no Claude Code.");
}

const local = readJson(join(PROJETO, ".claude", "settings.local.json"));
const token = local?.env?.[cfg.tokenEnv] || process.env[cfg.tokenEnv];
if (!token) {
  erro(`${cfg.tokenEnv} não encontrado.`, "Rode /core-tracker para configurar.");
}

const base = (cfg.url || "").replace(/\/$/, "");

async function api(url, { metodo = "GET", headers = {}, corpo = null } = {}) {
  const r = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...headers },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  if (!r.ok) {
    erro(
      `${cfg.tracker} respondeu HTTP ${r.status}`,
      typeof dados === "string" ? dados.slice(0, 200) : JSON.stringify(dados).slice(0, 200)
    );
  }
  return dados;
}

// ------------------------------------------------------------------- Plane
// O identificador humano ("CRM-540") não é a chave da API: o Plane guarda o
// prefixo no projeto e o número na issue. Resolver os dois é o que permite
// falar "CRM-540" em vez de colar um UUID.
const plane = {
  headers: { "X-API-Key": token },

  async projetos() {
    const d = await api(`${base}/api/v1/workspaces/${cfg.workspace}/projects/`, { headers: this.headers });
    return d.results || d;
  },

  async resolver(identificador) {
    const m = String(identificador).match(/^([A-Za-z]+)-(\d+)$/);
    if (!m) erro(`"${identificador}" não parece um identificador (esperado algo como CRM-540).`);
    const [, prefixo, numero] = m;

    const projetos = await this.projetos();
    const projeto = projetos.find((p) => (p.identifier || "").toUpperCase() === prefixo.toUpperCase());
    if (!projeto) {
      erro(
        `nenhum projeto com o prefixo "${prefixo}" no workspace ${cfg.workspace}.`,
        `Disponíveis: ${projetos.map((p) => p.identifier).filter(Boolean).join(", ")}`
      );
    }
    return { projeto, numero: Number(numero) };
  },

  async card(identificador) {
    const { projeto, numero } = await this.resolver(identificador);
    const url = `${base}/api/v1/workspaces/${cfg.workspace}/projects/${projeto.id}/issues/?expand=state,labels,assignees`;
    const d = await api(url, { headers: this.headers });
    const issues = d.results || d;
    const issue = issues.find((i) => i.sequence_id === numero);
    if (!issue) erro(`${identificador} não encontrado em ${projeto.name}.`);
    return { issue, projeto };
  },

  async estados(projetoId) {
    const d = await api(`${base}/api/v1/workspaces/${cfg.workspace}/projects/${projetoId}/states/`, { headers: this.headers });
    return d.results || d;
  },

  async comentar(identificador, texto) {
    const { issue, projeto } = await this.card(identificador);
    return api(
      `${base}/api/v1/workspaces/${cfg.workspace}/projects/${projeto.id}/issues/${issue.id}/comments/`,
      { metodo: "POST", headers: this.headers, corpo: { comment_html: `<p>${texto.replace(/\n/g, "<br>")}</p>` } }
    );
  },

  async mover(identificador, nomeEstado) {
    const { issue, projeto } = await this.card(identificador);
    const estados = await this.estados(projeto.id);
    const estado = estados.find((e) => e.name.toLowerCase() === nomeEstado.toLowerCase());
    if (!estado) {
      erro(`estado "${nomeEstado}" não existe.`, `Disponíveis: ${estados.map((e) => e.name).join(", ")}`);
    }
    return api(
      `${base}/api/v1/workspaces/${cfg.workspace}/projects/${projeto.id}/issues/${issue.id}/`,
      { metodo: "PATCH", headers: this.headers, corpo: { state: estado.id } }
    );
  },

  formatar({ issue, projeto }) {
    return [
      `${projeto.identifier}-${issue.sequence_id}  ${issue.name}`,
      `estado:     ${issue.state_detail?.name || issue.state || "?"}`,
      `prioridade: ${issue.priority || "nenhuma"}`,
      `projeto:    ${projeto.name}`,
      `url:        ${base}/${cfg.workspace}/projects/${projeto.id}/issues/${issue.id}`,
      "",
      issue.description_stripped || issue.description_html?.replace(/<[^>]+>/g, "") || "(sem descrição)",
    ].join("\n");
  },
};

// ------------------------------------------------------------------ Linear
const linear = {
  headers: { Authorization: token },

  async gql(query, variables = {}) {
    const d = await api("https://api.linear.app/graphql", {
      metodo: "POST", headers: this.headers, corpo: { query, variables },
    });
    if (d.errors) erro(d.errors.map((e) => e.message).join("; "));
    return d.data;
  },

  async card(id) {
    const d = await this.gql(
      `query($id:String!){ issue(id:$id){ identifier title description priority
         state{name} assignee{name} url } }`,
      { id }
    );
    if (!d.issue) erro(`${id} não encontrado.`);
    return d.issue;
  },

  async comentar(id, texto) {
    const issue = await this.card(id);
    return this.gql(
      `mutation($i:String!,$b:String!){ commentCreate(input:{issueId:$i,body:$b}){ success } }`,
      { i: issue.id || id, b: texto }
    );
  },

  formatar(i) {
    return [
      `${i.identifier}  ${i.title}`,
      `estado:     ${i.state?.name}`,
      `prioridade: ${i.priority ?? "nenhuma"}`,
      `url:        ${i.url}`,
      "",
      i.description || "(sem descrição)",
    ].join("\n");
  },
};

// ------------------------------------------------------------------ GitHub
const github = {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },

  async card(id) {
    const n = String(id).replace(/^#/, "");
    if (!cfg.repo) erro("GitHub Issues exige `publish.repo` (owner/nome) no core.json.");
    return api(`https://api.github.com/repos/${cfg.repo}/issues/${n}`, { headers: this.headers });
  },

  async comentar(id, texto) {
    const n = String(id).replace(/^#/, "");
    return api(`https://api.github.com/repos/${cfg.repo}/issues/${n}/comments`, {
      metodo: "POST", headers: this.headers, corpo: { body: texto },
    });
  },

  formatar(i) {
    return [
      `#${i.number}  ${i.title}`,
      `estado:  ${i.state}`,
      `labels:  ${(i.labels || []).map((l) => l.name).join(", ") || "nenhuma"}`,
      `url:     ${i.html_url}`,
      "",
      i.body || "(sem descrição)",
    ].join("\n");
  },
};

const IMPL = { plane, linear, github };
const impl = IMPL[cfg.tracker];
if (!impl) erro(`tracker "${cfg.tracker}" ainda não tem implementação de leitura.`);

// ------------------------------------------------------------------- main
async function lerStdin() {
  const c = [];
  for await (const p of process.stdin) c.push(p);
  return Buffer.concat(c).toString("utf8").trim();
}

const AJUDA = `
  card <ID>                busca e imprime o card
  comment <ID> <texto|->   comenta ("-" lê do stdin)
  move <ID> <estado>       move o card (o portão de publicação intercepta)
  states                   lista os estados do projeto
`;

try {
  switch (comando) {
    case "card": {
      if (!resto[0]) erro("informe o identificador.", "Ex: card CRM-540");
      console.log("\n" + impl.formatar(await impl.card(resto[0])) + "\n");
      break;
    }
    case "comment": {
      const [id, ...t] = resto;
      if (!id) erro("informe o identificador.");
      const texto = t.join(" ") === "-" || !t.length ? await lerStdin() : t.join(" ");
      if (!texto) erro("comentário vazio.");
      await impl.comentar(id, texto);
      console.log(`\n  comentário publicado em ${id}\n`);
      break;
    }
    case "move": {
      const [id, ...e] = resto;
      if (!id || !e.length) erro("uso: move <ID> <estado>");
      if (!impl.mover) erro(`mover card ainda não é suportado para ${cfg.tracker}.`);
      await impl.mover(id, e.join(" "));
      console.log(`\n  ${id} movido para "${e.join(" ")}"\n`);
      break;
    }
    case "states": {
      if (!impl.estados) erro(`listar estados ainda não é suportado para ${cfg.tracker}.`);
      const { projeto } = await impl.card(flag("ref") || resto[0] || "");
      console.log("\n  " + (await impl.estados(projeto.id)).map((e) => e.name).join("\n  ") + "\n");
      break;
    }
    default:
      console.log(`\n  tracker: ${cfg.tracker}${base ? "  " + base : ""}\n${AJUDA}`);
  }
} catch (e) {
  erro(e.message || String(e));
}
