// Configuracao por projeto: .claude/core.json
// Tudo tem default seguro. Um projeto sem core.json funciona; um projeto com
// core.json parcial herda o resto. O time so escreve o que quer mudar.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const DEFAULTS = {
  verify: {
    enabled: true,
    // Timeout curto de proposito: hook lento destroi o ganho de tempo que ele
    // deveria proteger. Verificacao de arquivo e barata; typecheck de projeto
    // inteiro pertence ao Stop, nao ao PostToolUse.
    timeoutMs: 12000,
    byExtension: null, // null = autodeteccao (ver detect.mjs)
  },

  depGuard: {
    enabled: true,
    // Comandos que introduzem uma dependencia NOVA.
    //
    // Escritos sem nenhuma barra invertida de proposito: estes padroes
    // atravessam shell, JSON e heredoc, e cada camada pode comer um escape.
    // " +" no lugar de "\s+" e "[^ ]" no lugar de "\S" sao imunes a isso.
    //
    // O sufixo " +[^ ]" e o que separa `npm install` (restaura o lockfile,
    // passa) de `npm install lodash` (adiciona dependencia, bloqueia).
    patterns: [
      "npm +(i|install|add) +[^ ]",
      "yarn +add +[^ ]",
      "pnpm +(add|install) +[^ ]",
      "bun +add +[^ ]",
      "bundle +add +[^ ]",
      "gem +install +[^ ]",
      "pip3? +install +[^ ]",
      "poetry +add +[^ ]",
      "uv +add +[^ ]",
      "cargo +add +[^ ]",
      "go +get +[^ ]",
      "composer +require +[^ ]",
      "dotnet +add +package +[^ ]",
    ],
  },

  stopVerify: {
    enabled: true,
    // Se houve edicao de codigo e nada nesta lista rodou depois, o Stop bloqueia.
    testPatterns: [
      "rspec", "rake test", "minitest",
      "jest", "vitest", "playwright", "cypress", "npm test", "yarn test", "pnpm test",
      "pytest", "unittest", "tox",
      "go test", "cargo test", "mvn test", "gradle test", "phpunit", "dotnet test",
    ],
    // Verificacao CARA, de projeto inteiro, rodada UMA vez antes de encerrar.
    //
    // E aqui que Rust, Java, C# e o typecheck de TS sao cobertos: o
    // post-edit-verify nao consegue checar essas linguagens por arquivo, entao
    // o custo e pago uma vez no fim em vez de a cada edicao.
    //
    // Vazio por default: um comando errado aqui bloqueia toda sessao. O
    // /core-setup preenche com o que o projeto realmente usa.
    // Exemplos: ["cargo check", "npx tsc --noEmit", "go build ./...", "mvn -q compile"]
    projectCheck: [],
    projectCheckTimeoutMs: 120000,

    // Extensoes que contam como "codigo" para exigir prova.
    codeExtensions: [
      ".rb", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go",
      ".rs", ".java", ".kt", ".php", ".cs", ".swift", ".ex", ".exs", ".scala",
    ],
  },

  graph: {
    enabled: true,
    staleAfterCommits: 25,
  },

  publish: {
    // O portao de publicacao. Ver pre-publish-guard.mjs.
    enabled: true,

    // Comandos que tornam o trabalho visivel para o time.
    prPatterns: [
      "gh +pr +create",
      "gh +pr +ready",
      "gh +pr +merge",
      "gh +pr +edit",
      "glab +mr +create",
      "git +push +.*--force",
    ],

    // Chamadas que mexem no estado de um card. Vazio no nucleo de proposito:
    // cada equipe usa um tracker. Preencha na camada do projeto — sao regex
    // testadas contra o comando inteiro, entao a URL da API costuma bastar.
    // Exemplos: "api.linear.app", "plane[.]exemplo[.]com/api", "/rest/api/3/issue"
    trackerPatterns: [],

    // O proprio script do nucleo TEM de passar pelo portao. Ele fala com a API
    // do tracker sem a URL aparecer no comando, entao `trackerPatterns` nao o
    // alcanca — e uma ferramenta que contorna a propria guarda e o jeito mais
    // facil de furar o sistema inteiro. Sempre ativo, nao configuravel.
    sempreTracker: ["tracker[.]mjs[^|;&]* move "],

    // Um hook so de Bash deixaria passar livre qualquer tracker acessado por
    // MCP — que e o caminho preferido. Estes padroes casam contra
    // "<nome da ferramenta> <argumentos em JSON>".
    mcpPrPatterns: [
      "mcp__[^ ]*(pull_request|pullrequest|merge_request)[^ ]*(create|merge|ready|update)",
      "mcp__[^ ]*(create|merge)[^ ]*(pull_request|pullrequest|merge_request)",
    ],
    mcpTrackerPatterns: [
      "mcp__[^ ]*(issue|card|ticket|task|work_item)",
      "mcp__[^ ]*(plane|linear|jira|asana|clickup)",
    ],

    // Nome dos estados, so para a mensagem do bloqueio ficar na lingua do time.
    reviewState: "In Review",
    doneState: "Done",

    // Estados que o agente NUNCA move, nem com autorizacao: quem revisa move a
    // mao. Diferente do resto do portao, este bloqueio nao tem escape.
    forbiddenStates: ["done", "concluido", "concluído", "finalizado", "completed", "closed"],

    baseBranch: "develop",

    // Marcador que o agente so usa DEPOIS de ter perguntado e recebido um sim.
    escape: "CORE_PUBLISH_OK=1",
    escapeHint: "CORE_PUBLISH_OK=1",

    // Em MCP nao ha onde prefixar o marcador: a autorizacao vira um arquivo
    // one-shot (.claude/core-state/publish-ok), consumido no uso e valido
    // apenas dentro desta janela — um token esquecido de ontem nao autoriza nada.
    tokenWindowMs: 300000,
  },
};

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && base?.[k] && typeof base[k] === "object"
        ? deepMerge(base[k], v)
        : v;
  }
  return out;
}

export function loadConfig(cwd) {
  const path = join(cwd || process.cwd(), ".claude", "core.json");
  if (!existsSync(path)) return DEFAULTS;
  try {
    return deepMerge(DEFAULTS, JSON.parse(readFileSync(path, "utf8")));
  } catch {
    // core.json malformado nao pode derrubar os hooks: cai nos defaults.
    return DEFAULTS;
  }
}
