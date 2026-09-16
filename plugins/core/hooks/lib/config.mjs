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

  externa: {
    // A base de conhecimento externa (NotebookLM e afins).
    //
    // O agente CONSULTA; quem alimenta e humano. A inversao e deliberada: o
    // pedido original era "ensinar o agente a mandar so o que compensa", mas
    // "compensa" e julgamento probabilistico, e a tese deste projeto e que
    // julgamento nao vira garantia por estar escrito no prompt. Tirar o verbo
    // do agente e mais determinista do que ensina-lo a julgar — a forma mais
    // forte de um hook e a ausencia da ferramenta.
    //
    // O que se perde e pouco: alimentar e raro. O que se evita nao tem botao de
    // desfazer — conteudo enviado para um servidor do Google, sob a conta de
    // alguem, nao volta.
    enabled: true,

    // Como a CLI aparece num comando de shell. O portao so olha comandos que
    // batem aqui: sem isto ele inspecionaria TODO comando Bash da sessao, e uma
    // guarda cara em todo comando e uma guarda que alguem desliga.
    //
    // A CLI, e nao o MCP, e o cliente recomendado: as 38 ferramentas MCP do
    // notebooklm-py medem 12.629 tokens de system prompt em TODA sessao —
    // 13,6x o plugin inteiro do nucleo (~928) — enquanto a CLI custa zero.
    binarios: ["(^| |/|[\\\\])notebooklm(-mcp|-server)?([.](exe|cmd|bat))?( |$)"],

    // Se alguem ligar o MCP assim mesmo, o portao continua valendo. Casado
    // contra o NOME DO SERVIDOR (`mcp__notebooklm__chat_ask` -> `notebooklm`),
    // nunca contra a acao: um servidor chamado "notes" nao vira base externa
    // por ter ferramenta de nome parecido.
    servidores: ["^(notebooklm|nblm|notebook[_-]?lm)"],

    // As rotas que chegam na base SEM passar pela CLI nem pelo MCP.
    //
    // Este projeto ja errou seis vezes do mesmo jeito: um caminho coberto e
    // outro aberto. Bash coberto, MCP aberto. Edit coberto, escrita por shell
    // aberta. curl ao tracker coberto, o proprio script do nucleo aberto.
    //
    // Aqui os caminhos sao tres, e nenhum passa pelos `binarios`:
    //   - um interpretador importando a biblioteca (`python -c "import
    //     notebooklm..."`, `uv run --with notebooklm-py ...`)
    //   - HTTP direto ao servidor local, se o time levantou o container: um
    //     `curl 127.0.0.1:9420/mcp` executa a ferramenta sem o portao ver nada
    //   - HTTP direto ao proprio notebooklm.google.com
    //
    // Rota indireta NAO e classificada: e negada, e a mensagem manda usar a CLI.
    // Isso e deliberado — o portao so pode autorizar o que consegue ler, e nao
    // ha como ler uma acao dentro de um corpo JSON arbitrario com confianca.
    //
    // A porta 9420 e a default do notebooklm-mcp. Servidor em outra porta:
    // acrescente o padrao aqui, no core.json do projeto.
    rotasIndiretas: [
      // Instalar NAO e usar. `uv tool install "notebooklm-py[browser]"` e o que
      // o /core-ferramentas roda, e barra-lo quebrava a propria instalacao da
      // ferramenta que esta feature existe para usar.
      "(^| )(python3?|py|uv|uvx|pipx|poetry|pdm|hatch|conda)( |$)(?![^|;&]*(install|add|sync|lock|remove|uninstall|pip))[^|;&]*notebooklm",
      "(^| )(curl|wget|http|httpie|Invoke-RestMethod|Invoke-WebRequest|iwr)( |$)[^|;&]*(:9420|notebooklm[.]google[.]com)",
    ],

    // Consultar nao exporta arquivo nenhum: passa livre.
    //
    // Casado contra o comando sem o binario (`notebooklm source list` ->
    // `source list`) e contra a acao MCP (`chat_ask`). Acao DESCONHECIDA nao
    // entra aqui: versao nova da biblioteca traz comando novo, e o default
    // seguro e exigir autorizacao, nao liberar.
    consulta: [
      "^(ask|suggest-prompts|suggest-next-steps|history|status|clear|doctor|completion|list|summary|metadata)( |$)",
      "^source +(list|get|search|fulltext|books|guide|stale|wait)( |$)",
      "^note +(list|get)( |$)",
      "^artifact +(list|get|get-prompt|choices|suggestions|poll|wait|export)( |$)",
      "^(label +(list|sources)|collection +(list|notebooks))( |$)",
      "^share +(status|view-level)( |$)",
      "^research +(status|wait)( |$)",
      "^(profile +list|language +(get|list)|agent +show|skill +(list|show|status))( |$)",
      "^auth +(check|inspect)( |$)",
      // `login` abre o navegador para o USUARIO autenticar: nao exporta nada
      // do projeto. Barra-lo seria barrar o primeiro passo que o proprio
      // diagnostico do nucleo manda dar — guarda que impede a configuracao e
      // guarda que alguem desliga. `__ajuda` e `notebooklm --version`.
      "^login( |$)",
      "^__ajuda$",
      "^(chat_ask|chat_start|chat_status|chat_cancel|suggest_prompts)$",
      "^(notebook_list|notebook_describe|server_info|share_status|research_status)$",
      "^(source_list|source_read|source_wait|source_list_play_books|studio_list|studio_status)$",
    ],

    // Bloqueio SEM escape, como o estado final de um card.
    //
    // Tres familias, cada uma por um motivo diferente:
    //
    //   compartilhar  torna publico um notebook que pode ter material interno,
    //                 e o agente nao tem motivo nenhum para faze-lo;
    //   apagar        destroi conhecimento que alguem reuniu a mao;
    //   gerar         resumo, audio e nota produzidos por modelo viram FONTE, e
    //                 a consulta seguinte le o palpite do agente como se fosse a
    //                 documentacao do fornecedor. E o loop de auto-contaminacao:
    //                 a base deixa de conter so o que alguem de fora escreveu.
    //
    // `auth logout` entra porque derruba a sessao — em modo equipe, de todo
    // mundo — e so um humano com navegador a reconstroi.
    proibidas: [
      "^share +(add|public|remove|update)( |$)",
      "^(delete|copy)( |$)",
      "^(source|note|artifact|label|collection|profile) +(delete|delete-by-title|clean)( |$)",
      "^note +(save|create)( |$)",
      "^generate +",
      "^research +(discover|import|cancel)( |$)",
      "^auth +logout( |$)",
      "^share_(set_access|set_user|remove_user)$",
      "^(notebook|source|studio)_delete$",
      "^(note_save|studio_generate|research_start|research_import)$",
    ],

    // O proprio script do nucleo TEM de passar pelo portao.
    //
    // `externa.mjs enviar` e quem EMITE a autorizacao de envio, depois de checar
    // as quatro portas. Se o agente puder roda-lo, ele assina a propria licenca:
    // roda `consultei` duas vezes para abrir a porta REPETIDO, roda `enviar
    // --sem-rede` para pular a checagem de URL publica, e sai com um token
    // valido. As portas continuam existindo e deixam de significar alguma coisa.
    //
    // E exatamente a falha que o `publish.sempreTracker` ja corrigiu uma vez:
    // uma ferramenta que contorna a propria guarda e o jeito mais facil de furar
    // o sistema inteiro. Sempre ativo, sem escape — o usuario roda no terminal
    // dele, ou com o prefixo `!` na sessao.
    sempreUsuario: ["externa[.]mjs[^|;&]* enviar( |$)"],

    // A caderneta deste projeto no NotebookLM.
    //
    // A CLI exige saber QUAL caderneta em quase todo comando — sem isso ela
    // responde "No notebook specified", e o erro nao tem nada a ver com sessao
    // nem com permissao. Guardar o id aqui tira a pergunta do caminho.
    //
    // E um identificador, nao um segredo: quem nao tem a credencial da conta
    // nao abre a caderneta com ele. Por isso mora no arquivo versionado, junto
    // com o resto da configuracao que a equipe compartilha.
    notebook: "",

    // Onde o material a enviar precisa estar antes de subir.
    //
    // Allowlist de ORIGEM, e ela vence a blocklist: nada sobe de dentro da
    // arvore do repositorio, nem com autorizacao. Uma lista de arquivos
    // proibidos sempre tem um furo que ninguem pensou; uma pasta unica de onde
    // as coisas podem sair nao tem. E deixa a pergunta "posso mandar isso?"
    // virar "isso esta na pasta de staging?", que e comando, nao julgamento.
    staging: ".claude/externa",

    // O indice VERSIONADO do que existe na base e por que.
    //
    // Sem ele a base vira oraculo paralelo: ninguem sabe o que tem la dentro,
    // de quando e, nem se ainda vale. Com ele, "alguem devia atualizar" vira
    // comparacao de datas — que o portao consegue fazer.
    indice: "docs/base-externa.md",

    // Depois disso uma fonte esta vencida e a CONSULTA e negada, nao apenas
    // avisada. Fonte velha responde com confianca sobre o que nao existe mais:
    // e o mapa velho do Graphify, pior, porque aqui nao ha `git log` medindo o
    // atraso.
    validadeDias: 180,

    // Teto de fontes na base. Cheia, `source add` e negado — o que forca
    // curadoria em vez de acumulo. Uma base que so cresce e uma base que
    // ninguem poda, e o custo de podar cresce junto.
    tetoFontes: 50,

    // As portas do "compensa mandar", em comando em vez de julgamento.
    // GRANDE: material menor que isto o subagente le direto, mais barato do
    // que indexar e manter. REPETIDO: a segunda consulta ao mesmo material e o
    // gatilho; a primeira nunca indexa, le e segue — e a porta que mais
    // economiza, porque mata o acumulo especulativo.
    portas: { bytesMinimos: 200000, consultasMinimas: 2 },

    // Bloqueio SEM escape: caminhos que nunca saem da maquina.
    //
    // Diferente da escada de dependencia, aqui nao ha resposta "sim". A escada
    // as vezes termina em instalar o pacote; vazar credencial nunca termina
    // bem. `settings.local.json` esta na lista porque e do proprio nucleo: e
    // onde mora o token do tracker do time.
    //
    // Sem nenhuma barra invertida solta, como o resto do arquivo: estes padroes
    // atravessam shell, JSON e heredoc, e cada camada pode comer um escape.
    segredoCaminhos: [
      "[.]env(?![.](example|sample|template|dist))([^a-zA-Z0-9]|$)",
      "settings[.]local[.]json",
      "(master_token|storage_state|credentials|service[-_]account)[a-z0-9_-]*[.]json",
      "id_(rsa|dsa|ecdsa|ed25519)",
      "[.](pem|key|p12|pfx|ppk|jks|keystore|kdbx)([^a-zA-Z0-9]|$)",
      "[.](npmrc|pypirc|netrc|pgpass)([^a-zA-Z0-9]|$)",
      "[.](ssh|aws|gnupg)[/\\\\]",
      "[.]kube[/\\\\]config",
      "[.](sql|dump|bak)([^a-zA-Z0-9]|$)",
      "(^|[/\\\\])(secrets?|backups?)[/\\\\]",
    ],

    // Bloqueio SEM escape: formatos de segredo dentro do proprio conteudo.
    // Um arquivo de nome inocente com uma chave dentro vaza igual.
    segredoConteudo: [
      "-----BEGIN [A-Z ]*PRIVATE KEY",
      "AKIA[0-9A-Z]{16}",
      "(^|[^A-Za-z0-9])(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}",
      "github_pat_[A-Za-z0-9_]{20,}",
      "xox[baprs]-[A-Za-z0-9-]{10,}",
      // A fronteira da esquerda nao e enfeite: sem ela, `sk-` casava dentro de
      // palavra inglesa comum — `risk-assessment-methodology`,
      // `task-management-system`, `disk-usage-monitoring`. Tres bloqueios SEM
      // ESCAPE em nomes de arquivo perfeitamente normais.
      "(^|[^A-Za-z0-9])sk-(proj-|svcacct-|admin-)?[A-Za-z0-9]{20,}",
      "AIza[0-9A-Za-z_-]{35}",
      // Exige valor longo E com digito. Documentacao de terceiro mostra
      // `client_secret: <sua-chave-aqui>` o tempo todo, e isso e o caso de uso
      // central desta feature — barrar sem escape um manual por ele explicar o
      // proprio formato seria absurdo.
      "(client_secret|api[_-]?secret)[^A-Za-z0-9]{1,4}(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{24,}",
      "(postgres|postgresql|mysql|mongodb|redis|amqp)([+][a-z]+)?://[^ :@]+:[^ @]+@",
    ],

    // Bloqueio SEM escape: dado pessoal. So os formatos BRASILEIROS pontuados,
    // de proposito — CPF sem pontuacao e onze digitos, e onze digitos aparecem
    // em id, timestamp e hash o tempo todo. Falso positivo aqui custa caro
    // porque o bloqueio nao tem escape.
    //
    // Cartao (Luhn) e "tres ou mais e-mails distintos" nao sao regex: estao em
    // lib/externa.mjs, onde da para contar e validar.
    piiPatterns: [
      "[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}",
      "[0-9]{2}[.][0-9]{3}[.][0-9]{3}/[0-9]{4}-[0-9]{2}",
    ],

    // Quanto tempo a autorizacao de envio vale. Mesma janela do portao de
    // publicacao: uma autorizacao esquecida de ontem nao autoriza nada hoje.
    //
    // Diferente do publish-ok, este token NOMEIA o que autoriza: ele guarda o
    // caminho do arquivo liberado, e o portao compara. Um token generico o
    // agente cria sozinho; um token que nomeia o arquivo so sai de quem rodou
    // as portas.
    tokenWindowMs: 300000,

    // Teto de bytes de uma resposta antes de o aviso de custo aparecer.
    //
    // Uma resposta nao custa uma vez: ela fica no contexto e e reprocessada em
    // TODO turno seguinte. Neste projeto ja foram medidos 8.551.717 tokens de
    // entrada contra 202.465 de saida numa sessao — 42x. 4KB colados no turno
    // 10 de uma sessao de 75 nao custam 4KB.
    tetoRespostaBytes: 4000,
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
    // A isencao so vale para acao que NAO contenha nenhum verbo de escrita.
    // Casar so o prefixo deixava `get_or_update_work_item` e
    // `search_and_update_issue` passarem pelo portao INTEIRO — inclusive pelo
    // bloqueio de estado final, que o projeto chama de inviolavel. Um nome
    // composto nao vira leitura por comecar com "get".
    mcpEscrita: [
      "(^|[_-])(update|create|delete|remove|add|set|patch|put|post|move|transition|assign|close|reopen|archive|link|upload|import|sync|edit|modify|change|write|apply|submit|approve|merge)([_-]|$)",
    ],
    // Verbos que comecam uma acao de leitura. So isentam quando a acao inteira
    // tambem nao casa `mcpEscrita`.
    mcpLeitura: [
      "^(list|get|retrieve|fetch|read|search|find|query|count|describe|show|view|export)([_-]|$)",
    ],

    // Comentar registra contexto, nao muda o estado do trabalho — e por isso
    // passa mesmo tendo "create" no nome. Mas so quando for SO comentar:
    // `update_issue_comment_and_state` mexe no estado e nao entra aqui.
    // Acoes de comentario, que passam mesmo tendo "create" no nome.
    mcpComentario: ["(^|[_-])comments?([_-]|$)"],
    // O que desqualifica uma acao de comentario: se mexe no estado, nao passa.
    mcpMexeNoEstado: ["(^|[_-])(state|status|transition|close|reopen|move|assign|archive)([_-]|$)"],

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

/**
 * Listas que um projeto pode ESTENDER, mas nunca encurtar.
 *
 * Toda outra opcao continua sendo substituida pelo projeto — e assim tem de
 * ser: um time precisa poder trocar `testPatterns` pelo comando de teste dele.
 *
 * Estas nao. Sao as listas cujo encolhimento apaga um bloqueio SEM ESCAPE, e
 * apaga em silencio: `{"externa": {"proibidas": ["^share_set_access$"]}}` num
 * core.json parece estar acrescentando uma proibicao e na verdade remove todas
 * as outras — some `share public`, somem os `delete`, some o `generate`. O
 * arquivo fica com cara de mais rigoroso e o sistema fica mais permissivo, que
 * e a pior combinacao possivel.
 *
 * O mesmo vale ao contrario para `consulta`: substituir a lista faz TODA
 * consulta virar envio, e ai o portao barra a ferramenta inteira.
 */
const SOMENTE_ACRESCENTA = new Set([
  "externa.proibidas", "externa.consulta", "externa.segredoCaminhos",
  "externa.segredoConteudo", "externa.piiPatterns", "externa.binarios",
  "externa.rotasIndiretas", "externa.servidores", "externa.sempreUsuario",
  "publish.forbiddenStates", "publish.sempreTracker",
]);

function deepMerge(base, override, caminho = "") {
  if (!override || typeof override !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(override)) {
    const aqui = caminho ? `${caminho}.${k}` : k;

    // Onde o default e uma LISTA, `null` nao e um valor: e um engano.
    //
    // O core.json e escrito a mao, e `"testPatterns": null` — para "desligar"
    // — atravessava o merge e virava o valor efetivo. O primeiro hook a fazer
    // `cfg.testPatterns.some(...)` lancava TypeError, e como as guardas rodam
    // com `aoFalhar: "bloqueia"`, o engano de digitacao virava BLOQUEIO DE
    // TUDO, com uma mensagem que nao apontava para o core.json.
    //
    // Achado por uma sessao real do Claude Code, e nao pelos testes: os testes
    // escreviam core.json bem-formado. Lista vazia continua valendo — `[]` diz
    // "nenhum padrao" de propria vontade; `null` nunca quis dizer nada.
    if (v == null && Array.isArray(base?.[k])) continue;

    if (Array.isArray(v) && Array.isArray(base?.[k]) && SOMENTE_ACRESCENTA.has(aqui)) {
      out[k] = [...new Set([...base[k], ...v])];
      continue;
    }
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && base?.[k] && typeof base[k] === "object"
        ? deepMerge(base[k], v, aqui)
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
