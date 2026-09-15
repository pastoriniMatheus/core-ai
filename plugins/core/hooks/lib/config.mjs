// Configuracao por projeto: .claude/core.json
// Tudo tem default seguro. Um projeto sem core.json funciona; um projeto com
// core.json parcial herda o resto. O time so escreve o que quer mudar.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const DEFAULTS = {
  verify: {
    // Verifica o arquivo escrito, a cada edicao. Desligue num repositorio
    // de terceiro que voce so foi ler.
    enabled: true,
    // Timeout curto de proposito: hook lento destroi o ganho de tempo que ele
    // deveria proteger. Verificacao de arquivo e barata; typecheck de projeto
    // inteiro pertence ao Stop, nao ao PostToolUse.
    timeoutMs: 12000,
    // Sobrescreve a autodeteccao por extensao. `null` usa o que detect.mjs
    // descobre sozinho; `{".rb": [["rubocop", "{file}"]]}` forca um comando.
    byExtension: null,
  },

  depGuard: {
    // Para o agente uma vez antes de adicionar dependencia. Nao proibe:
    // forca subir a escada e justificar.
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
    // Impede encerrar a sessao com codigo alterado e nenhum teste rodado
    // depois. E a guarda que transforma "acho que esta pronto" em evidencia.
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
    // Teto do projectCheck. Estourar NAO e aprovacao: o Stop bloqueia
    // dizendo que a verificacao nao terminou.
    projectCheckTimeoutMs: 120000,

    // Extensoes que contam como "codigo" para exigir prova.
    codeExtensions: [
      ".rb", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go",
      ".rs", ".java", ".kt", ".php", ".cs", ".swift", ".ex", ".exs", ".scala",
    ],
  },

  checkpoint: {
    // Grava onde a sessao parou, para a proxima retomar sem reler tudo.
    enabled: true,

    // Quanto tempo um checkpoint ainda vale a pena mostrar. Depois disso o
    // trabalho provavelmente seguiu por outro caminho, e um retrato velho
    // atrapalha mais do que ajuda.
    validoPorHoras: 168,

    // Formato do identificador de card, para achar o que estava em foco.
    // Sem barra invertida de proposito: "\b" e "\d" num literal de string
    // perdem um nivel de escape com facilidade — "\b" chega como backspace, e o
    // padrao para de casar em silencio. "[0-9]" e "[^A-Za-z0-9]" dizem o mesmo
    // e atravessam shell, JSON e editor sem se desfazer.
    cardPattern: "(^|[^A-Za-z0-9])([A-Z]{2,10}-[0-9]+)([^A-Za-z0-9]|$)",

    // Comentar no card ao fim da sessao. DESLIGADO por padrao: um comentario
    // automatico por sessao vira ruido no tracker do time, e ruido faz ninguem
    // ler o que importa. Ligue quando o time trabalhar cards longos, em varias
    // sessoes, com mais de uma pessoa acompanhando.
    comentarNoCard: false,
  },

  graph: {
    // Avisa antes de consultar um grafo desatualizado — um mapa velho produz
    // resposta confiante e errada, que e o erro mais caro que existe.
    enabled: true,
    // A partir de quantos commits atras do HEAD o grafo deixa de ser
    // confiavel e a consulta passa a avisar.
    staleAfterCommits: 25,
  },

  publish: {
    // O portao de publicacao: PR e movimento de card exigem sua autorizacao,
    // toda vez. Ver pre-publish-guard.mjs.
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
    // O mesmo para as ferramentas que mexem em card. Casa contra o nome da
    // ferramenta MCP, e nao contra uma URL — no MCP nao ha comando de shell.
    mcpTrackerPatterns: [
      "mcp__[^ ]*(issue|card|ticket|task|work_item)",
      "mcp__[^ ]*(plane|linear|jira|asana|clickup)",
    ],

    // Ler NAO e publicar.
    //
    // Os padroes acima casam o nome do TRACKER, nao a acao — entao
    // `list_work_items` e `retrieve_work_item` eram barrados junto com
    // `update_work_item`. O portao existe para impedir que trabalho saia sem
    // autorizacao; barrar consulta nao protege nada e torna o tracker inutil,
    // que e o caminho mais curto para o time desligar o nucleo inteiro.
    //
    // Casado contra o verbo no FIM do nome (`mcp__plane__list_work_items` ->
    // `list_work_items`), nao contra o nome todo: um servidor chamado
    // "list-manager" nao deve liberar suas escritas.
    mcpLeitura: [
      "^(list|get|retrieve|fetch|read|search|find|query|count|describe|show|view|export)([_-]|$)",
      // Comentar tambem passa: registra contexto, nao muda o estado do trabalho.
      "comment",
    ],

    // Nome dos estados, so para a mensagem do bloqueio ficar na lingua do time.
    reviewState: "In Review",
    // O estado final. Citado na mensagem do bloqueio sem escape, junto com
    // `forbiddenStates`, que e quem de fato decide o que e barrado.
    doneState: "Done",

    // Estados que o agente NUNCA move, nem com autorizacao: quem revisa move a
    // mao. Diferente do resto do portao, este bloqueio nao tem escape.
    forbiddenStates: ["done", "concluido", "concluído", "finalizado", "completed", "closed"],

    // Base das PRs deste projeto. Citada na mensagem do bloqueio, para o
    // agente nao assumir "main".
    baseBranch: "develop",

    // Marcador que o agente so usa DEPOIS de ter perguntado e recebido um sim.
    escape: "CORE_PUBLISH_OK=1",
    // O que a mensagem de bloqueio manda o agente usar. Separado de
    // `escape` para poder mudar o texto sem mudar o que e aceito.
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
