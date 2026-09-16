#!/usr/bin/env node
// Instala e configura as ferramentas externas que o núcleo recebe.
//
//   node scripts/ferramentas.mjs                        # só relata o que falta
//   node scripts/ferramentas.mjs --instalar
//   node scripts/ferramentas.mjs --instalar --graphify local   (padrão)
//   node scripts/ferramentas.mjs --instalar --graphify mcp --mcp-url https://host:8080
//   node scripts/ferramentas.mjs --projeto <dir> --grafo        # constrói o grafo do projeto
//
// Sem --instalar, nada é executado: só o diagnóstico e os comandos que seriam
// rodados. Instalar coisas na máquina de alguém é decisão de quem usa.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const INSTALAR = args.includes("--instalar");
const PROJETO = flag("projeto", process.cwd());
const MODO_GRAFO = (flag("graphify", "local") || "local").toLowerCase();
const MCP_URL = flag("mcp-url", "");
const SO_GRAFO = args.includes("--grafo");

const c = { ok: "\x1b[32m", warn: "\x1b[33m", dim: "\x1b[2m", bold: "\x1b[1m", off: "\x1b[0m" };

function temBin(bin) {
  const r = spawnSync(`${bin} --version`, { encoding: "utf8", timeout: 8000, shell: true, windowsHide: true });
  return r.status === 0 && Boolean((r.stdout || "").trim());
}

function rodar(cmd, { silencioso = false } = {}) {
  if (!silencioso) console.log(`${c.dim}    $ ${cmd}${c.off}`);
  const r = spawnSync(cmd, { encoding: "utf8", shell: true, timeout: 600000, stdio: silencioso ? "pipe" : "inherit", windowsHide: true });
  return r.status === 0;
}

const pluginHabilitado = (prefixo) => {
  const r = spawnSync("claude plugin list", { encoding: "utf8", shell: true, timeout: 20000, windowsHide: true });
  return (r.stdout || "").includes(prefixo);
};

// ---------------------------------------------------- catálogo de ferramentas
//
// Cada entrada diz: como detectar, como instalar, e — o mais importante — a
// armadilha que o README da ferramenta não avisa.
const FERRAMENTAS = [
  {
    id: "ponytail",
    nome: "Ponytail",
    papel: "escrever o mínimo de código",
    detecta: () => pluginHabilitado("ponytail"),
    instala: () => {
      const ok = rodar("claude plugin marketplace add https://github.com/DietrichGebert/ponytail.git")
        && rodar("claude plugin install ponytail@ponytail");
      return ok;
    },
    nota: "os números publicados (-54% linhas) foram medidos com ele sozinho, não empilhado",
  },
  {
    id: "graphify",
    nome: "Graphify",
    papel: "grafo de código: quem chama o quê, o que quebra se mudar",
    detecta: () => temBin("graphify"),
    requer: [{ bin: "uv", como: "https://docs.astral.sh/uv/getting-started/installation/" }],
    instala: () => rodar("uv tool install graphifyy"),
    nota: "sem `graphify hook install`, o grafo envelhece e passa a responder com confiança sobre estrutura que não existe mais",
  },
  {
    id: "notebooklm",
    nome: "notebooklm-py",
    papel: "base de conhecimento externa (material de terceiro, grande)",
    opcional: true,
    detecta: () => temBin("notebooklm"),
    requer: [{ bin: "uv", como: "https://docs.astral.sh/uv/getting-started/installation/" }],
    // `[browser]` e nao `[mcp]`: o cliente e a CLI. Ligar o servidor MCP poe 38
    // ferramentas no system prompt de TODA sessao — ~12.600 tokens medidos, 13x
    // o plugin inteiro do nucleo — pagos em todo turno inclusive nos que nunca
    // tocam a base. A CLI faz o mesmo por zero.
    instala: () => rodar('uv tool install "notebooklm-py[browser]"'),
    nota: "biblioteca não-oficial sobre API não documentada do Google, e a credencial é de CONTA INTEIRA: use conta descartável. Depois de instalar, rode `/core-externa` — instalar sem as guardas é a parte perigosa sem a parte útil",
  },
];

// mattpocock/skills NÃO entra: o núcleo passou a cobrir o mesmo terreno com
// `fase`, `atacar-card` e `entregar-trabalho`, escritas a partir das skills do
// próprio time. Instalar por cima criaria duas autoridades de processo — o erro
// que o doctor.mjs acusa e que este projeto existe para eliminar.

// ------------------------------------------------------- construir o grafo
if (SO_GRAFO) {
  if (!temBin("graphify")) {
    console.error("\n  graphify não está instalado. Rode:  node scripts/ferramentas.mjs --instalar\n");
    process.exit(1);
  }
  console.log(`\n  Construindo o grafo de ${PROJETO}...\n`);
  // --code-only: parsing local por tree-sitter, sem mandar nada para LLM nenhum.
  // Em projeto com contrato de cliente, é a diferença entre local e vazamento.
  const t0 = Date.now();
  if (!rodar(`graphify "${PROJETO}" --code-only`)) process.exit(1);

  // O extract sozinho para no meio: sem este passo não há GRAPH_REPORT.md nem
  // graph.html, e as comunidades ficam sem nome — a consulta então responde
  // qualquer coisa. Medido neste repositório: perguntar pelo portão de
  // publicação devolvia o arquivo de testes de aceitação. O grafo existia e não
  // servia, que é pior do que não existir, porque parece pronto.
  console.log(`\n  Nomeando comunidades e gerando o relatorio...\n`);
  if (!rodar(`graphify cluster-only "${PROJETO}"`)) process.exit(1);

  const seg = Math.round((Date.now() - t0) / 1000);
  console.log(`\n  ${c.ok}Grafo pronto em ${seg}s.${c.off}`);
  console.log(`  ${c.dim}graphify-out/  GRAPH_REPORT.md, graph.html, graph.json${c.off}`);
  if (seg > 90) {
    console.log(`\n  ${c.warn}${seg}s e lento para rodar a cada commit.${c.off}`);
    console.log(`  ${c.dim}E o numero que decide se o modo servidor MCP compensa.${c.off}`);
  }
  console.log("");
  process.exit(0);
}

// ------------------------------------------------------------- diagnóstico
console.log(`\n${c.bold}Ferramentas externas${c.off}`);
console.log(`${c.dim}O núcleo funciona sem todas elas. Cada uma acrescenta uma capacidade.${c.off}\n`);

const faltando = [];
for (const f of FERRAMENTAS) {
  const presente = f.detecta();
  const marca = presente ? `${c.ok}[ok]${c.off}  ` : `${c.dim}[--]${c.off}  `;
  console.log(`  ${marca}${f.nome.padEnd(14)} ${c.dim}${f.papel}${c.off}`);
  if (!presente) faltando.push(f);
}

console.log(`\n  ${c.dim}[--]  mattpocock     não entra: o núcleo já cobre com fase, atacar-card${c.off}`);
console.log(`  ${c.dim}                    e entregar-trabalho — duas autoridades se anulam${c.off}`);

if (!faltando.length) {
  console.log(`\n  ${c.ok}Tudo presente.${c.off}\n`);
} else if (!INSTALAR) {
  console.log(`\n${c.bold}  Para instalar:${c.off}  node scripts/ferramentas.mjs --instalar\n`);
  for (const f of faltando) console.log(`  ${c.warn}!${c.off} ${f.nome}: ${f.nota}`);
}

// -------------------------------------------------------------- instalação
if (INSTALAR && faltando.length) {
  for (const f of faltando) {
    if (f.opcional && !args.includes(`--${f.id}`)) {
      console.log(`\n  ${c.dim}${f.nome} pulado (opcional — acrescente --${f.id} para instalar)${c.off}`);
      continue;
    }
    const semRequisito = (f.requer || []).find((r) => !temBin(r.bin));
    if (semRequisito) {
      console.log(`\n  ${c.warn}${f.nome} exige ${semRequisito.bin}${c.off}  →  ${semRequisito.como}`);
      continue;
    }
    console.log(`\n${c.bold}  ${f.nome}${c.off}`);
    console.log(`  ${c.dim}${f.nota}${c.off}`);
    f.instala()
      ? console.log(`  ${c.ok}instalado${c.off}`)
      : console.log(`  ${c.warn}falhou — rode o comando à mão para ver o erro${c.off}`);
  }
}

// ---------------------------------------------------- Graphify: local ou MCP
if (MODO_GRAFO === "mcp" || temBin("graphify")) {
  console.log(`\n${c.bold}  Graphify: ${MODO_GRAFO === "mcp" ? "servidor MCP" : "local"}${c.off}`);

  if (MODO_GRAFO === "local") {
    // O hook post-commit é o que impede o pior erro do grafo: estar velho. Um
    // mapa desatualizado produz resposta confiante e errada, sem sinal nenhum.
    if (INSTALAR && existsSync(join(PROJETO, ".git"))) {
      rodar(`cd "${PROJETO}" && graphify hook install`);
    } else {
      console.log(`  ${c.dim}    graphify hook install   (reconstrói o grafo a cada commit)${c.off}`);
    }
    console.log(`  ${c.dim}    graphify . --code-only  (constrói agora, sem mandar nada para LLM)${c.off}`);
  } else {
    if (!MCP_URL) {
      console.log(`  ${c.warn}--mcp-url não informada.${c.off} O servidor ainda não existe — deixo a configuração pronta.`);
    }
    // A configuração fica escrita mesmo sem servidor no ar: quando ele subir,
    // é trocar a URL e nada mais precisa mudar no projeto.
    const localPath = join(PROJETO, ".claude", "settings.local.json");
    mkdirSync(join(PROJETO, ".claude"), { recursive: true });
    const local = (() => { try { return JSON.parse(readFileSync(localPath, "utf8")); } catch { return {}; } })();
    local.mcpServers = {
      ...(local.mcpServers || {}),
      graphify: {
        type: "http",
        url: MCP_URL || "https://TROQUE-PELA-URL-DO-SERVIDOR:8080",
        headers: { "X-API-Key": "${GRAPHIFY_API_KEY}" },
      },
    };
    if (INSTALAR) {
      writeFileSync(localPath, JSON.stringify(local, null, 2) + "\n");
      console.log(`  ${c.ok}configuração escrita${c.off} em .claude/settings.local.json (fora do git)`);
    }
    console.log(`  ${c.dim}    no servidor:  python -m graphify.serve --transport http --host 0.0.0.0 --port 8080 --api-key <chave>${c.off}`);
    console.log(`  ${c.dim}    e o grafo precisa ser reconstruído a cada push por alguém — é a peça a mais que o modo local não tem${c.off}`);
  }
}

console.log("");
