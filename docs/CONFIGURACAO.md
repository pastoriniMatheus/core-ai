# Referência de configuração

Tudo vive em `.claude/core.json`, por projeto. **Toda opção tem default**:
um projeto sem esse arquivo funciona, e um arquivo parcial herda o resto —
o time só escreve o que quer mudar.

<!-- GERADO por scripts/gerar-referencia.mjs a partir de lib/config.mjs.
     Não edite à mão: a próxima geração sobrescreve. Para mudar um texto
     daqui, mude o comentário no código — é de lá que ele vem. -->

## `verify`

*verificação a cada edição*

| Opção | Default | O que é |
|---|---|---|
| `enabled` | `true` | Verifica o arquivo escrito, a cada edicao. Desligue num repositorio de terceiro que voce so foi ler. |
| `timeoutMs` | `12000` (12s) | Timeout curto de proposito: hook lento destroi o ganho de tempo que ele deveria proteger. Verificacao de arquivo e barata; typecheck de projeto inteiro pertence ao Stop, nao ao PostToolUse. |
| `byExtension` | `null` | Sobrescreve a autodeteccao por extensao. `null` usa o que detect.mjs descobre sozinho; `{".rb": [["rubocop", "{file}"]]}` forca um comando. |

## `depGuard`

*dependência nova*

| Opção | Default | O que é |
|---|---|---|
| `enabled` | `true` | Para o agente uma vez antes de adicionar dependencia. Nao proibe: forca subir a escada e justificar. |
| `patterns` | 13 padrão(ões) | Comandos que introduzem uma dependencia NOVA. Escritos sem nenhuma barra invertida de proposito: estes padroes atravessam shell, JSON e heredoc, e cada camada pode comer um escape. " +" no lugar de "\s+" e "[^ ]" no lugar de "\S" sao imunes a isso. O sufixo " +[^ ]" e o que separa `npm install` (restaura o lockfile, passa) de `npm install lodash` (adiciona dependencia, bloqueia). |

## `stopVerify`

*prova antes de encerrar*

| Opção | Default | O que é |
|---|---|---|
| `enabled` | `true` | Impede encerrar a sessao com codigo alterado e nenhum teste rodado depois. E a guarda que transforma "acho que esta pronto" em evidencia. |
| `testPatterns` | 19 padrão(ões) | Se houve edicao de codigo e nada nesta lista rodou depois, o Stop bloqueia. |
| `projectCheck` | `[]` vazio | Verificacao CARA, de projeto inteiro, rodada UMA vez antes de encerrar. E aqui que Rust, Java, C# e o typecheck de TS sao cobertos: o post-edit-verify nao consegue checar essas linguagens por arquivo, entao o custo e pago uma vez no fim em vez de a cada edicao. Vazio por default: um comando errado aqui bloqueia toda sessao. O /core-setup preenche com o que o projeto realmente usa. Exemplos: ["cargo check", "npx tsc --noEmit", "go build ./...", "mvn -q compile"] |
| `projectCheckTimeoutMs` | `120000` (120s) | Teto do projectCheck. Estourar NAO e aprovacao: o Stop bloqueia dizendo que a verificacao nao terminou. |
| `codeExtensions` | 18 padrão(ões) | Extensoes que contam como "codigo" para exigir prova. |

## `checkpoint`

*retomar de onde parou*

| Opção | Default | O que é |
|---|---|---|
| `enabled` | `true` | Grava onde a sessao parou, para a proxima retomar sem reler tudo. |
| `validoPorHoras` | `168` | Quanto tempo um checkpoint ainda vale a pena mostrar. Depois disso o trabalho provavelmente seguiu por outro caminho, e um retrato velho atrapalha mais do que ajuda. |
| `cardPattern` | `"(^|[^A-Za-z0-9])([A-Z]{2,10}-[0-9]+)([^A-Za-z0-9]|$)"` | Formato do identificador de card, para achar o que estava em foco. Sem barra invertida de proposito: "\b" e "\d" num literal de string perdem um nivel de escape com facilidade — "\b" chega como backspace, e o padrao para de casar em silencio. "[0-9]" e "[^A-Za-z0-9]" dizem o mesmo e atravessam shell, JSON e editor sem se desfazer. |
| `comentarNoCard` | `false` | Comentar no card ao fim da sessao. DESLIGADO por padrao: um comentario automatico por sessao vira ruido no tracker do time, e ruido faz ninguem ler o que importa. Ligue quando o time trabalhar cards longos, em varias sessoes, com mais de uma pessoa acompanhando. |

## `graph`

*grafo de código*

| Opção | Default | O que é |
|---|---|---|
| `enabled` | `true` | Avisa antes de consultar um grafo desatualizado — um mapa velho produz resposta confiante e errada, que e o erro mais caro que existe. |
| `staleAfterCommits` | `25` | A partir de quantos commits atras do HEAD o grafo deixa de ser confiavel e a consulta passa a avisar. |

## `externa`

*a base de conhecimento externa*

| Opção | Default | O que é |
|---|---|---|
| `enabled` | `true` | A base de conhecimento externa (NotebookLM e afins). O agente CONSULTA; quem alimenta e humano. A inversao e deliberada: o pedido original era "ensinar o agente a mandar so o que compensa", mas "compensa" e julgamento probabilistico, e a tese deste projeto e que julgamento nao vira garantia por estar escrito no prompt. Tirar o verbo do agente e mais determinista do que ensina-lo a julgar — a forma mais forte de um hook e a ausencia da ferramenta. O que se perde e pouco: alimentar e raro. O que se evita nao tem botao de desfazer — conteudo enviado para um servidor do Google, sob a conta de alguem, nao volta. |
| `binarios` | 1 padrão(ões) | Como a CLI aparece num comando de shell. O portao so olha comandos que batem aqui: sem isto ele inspecionaria TODO comando Bash da sessao, e uma guarda cara em todo comando e uma guarda que alguem desliga. A CLI, e nao o MCP, e o cliente recomendado: as 38 ferramentas MCP do notebooklm-py medem 12.629 tokens de system prompt em TODA sessao — 13,6x o plugin inteiro do nucleo (~928) — enquanto a CLI custa zero. |
| `servidores` | 1 padrão(ões) | Se alguem ligar o MCP assim mesmo, o portao continua valendo. Casado contra o NOME DO SERVIDOR (`mcp__notebooklm__chat_ask` -> `notebooklm`), nunca contra a acao: um servidor chamado "notes" nao vira base externa por ter ferramenta de nome parecido. |
| `rotasIndiretas` | 2 padrão(ões) | As rotas que chegam na base SEM passar pela CLI nem pelo MCP. Este projeto ja errou seis vezes do mesmo jeito: um caminho coberto e outro aberto. Bash coberto, MCP aberto. Edit coberto, escrita por shell aberta. curl ao tracker coberto, o proprio script do nucleo aberto. Aqui os caminhos sao tres, e nenhum passa pelos `binarios`: - um interpretador importando a biblioteca (`python -c "import notebooklm..."`, `uv run --with notebooklm-py ...`) - HTTP direto ao servidor local, se o time levantou o container: um `curl 127.0.0.1:9420/mcp` executa a ferramenta sem o portao ver nada - HTTP direto ao proprio notebooklm.google.com Rota indireta NAO e classificada: e negada, e a mensagem manda usar a CLI. Isso e deliberado — o portao so pode autorizar o que consegue ler, e nao ha como ler uma acao dentro de um corpo JSON arbitrario com confianca. A porta 9420 e a default do notebooklm-mcp. Servidor em outra porta: acrescente o padrao aqui, no core.json do projeto. |
| `consulta` | 14 padrão(ões) | Consultar nao exporta arquivo nenhum: passa livre. Casado contra o comando sem o binario (`notebooklm source list` -> `source list`) e contra a acao MCP (`chat_ask`). Acao DESCONHECIDA nao entra aqui: versao nova da biblioteca traz comando novo, e o default seguro e exigir autorizacao, nao liberar. |
| `proibidas` | 10 padrão(ões) | Bloqueio SEM escape, como o estado final de um card. Tres familias, cada uma por um motivo diferente: compartilhar torna publico um notebook que pode ter material interno, e o agente nao tem motivo nenhum para faze-lo; apagar destroi conhecimento que alguem reuniu a mao; gerar resumo, audio e nota produzidos por modelo viram FONTE, e a consulta seguinte le o palpite do agente como se fosse a documentacao do fornecedor. E o loop de auto-contaminacao: a base deixa de conter so o que alguem de fora escreveu. `auth logout` entra porque derruba a sessao — em modo equipe, de todo mundo — e so um humano com navegador a reconstroi. |
| `sempreUsuario` | 1 padrão(ões) | O proprio script do nucleo TEM de passar pelo portao. `externa.mjs enviar` e quem EMITE a autorizacao de envio, depois de checar as quatro portas. Se o agente puder roda-lo, ele assina a propria licenca: roda `consultei` duas vezes para abrir a porta REPETIDO, roda `enviar --sem-rede` para pular a checagem de URL publica, e sai com um token valido. As portas continuam existindo e deixam de significar alguma coisa. E exatamente a falha que o `publish.sempreTracker` ja corrigiu uma vez: uma ferramenta que contorna a propria guarda e o jeito mais facil de furar o sistema inteiro. Sempre ativo, sem escape — o usuario roda no terminal dele, ou com o prefixo `!` na sessao. |
| `staging` | `".claude/externa"` | Onde o material a enviar precisa estar antes de subir. Allowlist de ORIGEM, e ela vence a blocklist: nada sobe de dentro da arvore do repositorio, nem com autorizacao. Uma lista de arquivos proibidos sempre tem um furo que ninguem pensou; uma pasta unica de onde as coisas podem sair nao tem. E deixa a pergunta "posso mandar isso?" virar "isso esta na pasta de staging?", que e comando, nao julgamento. |
| `indice` | `"docs/base-externa.md"` | O indice VERSIONADO do que existe na base e por que. Sem ele a base vira oraculo paralelo: ninguem sabe o que tem la dentro, de quando e, nem se ainda vale. Com ele, "alguem devia atualizar" vira comparacao de datas — que o portao consegue fazer. |
| `validadeDias` | `180` | Depois disso uma fonte esta vencida e a CONSULTA e negada, nao apenas avisada. Fonte velha responde com confianca sobre o que nao existe mais: e o mapa velho do Graphify, pior, porque aqui nao ha `git log` medindo o atraso. |
| `tetoFontes` | `50` | Teto de fontes na base. Cheia, `source add` e negado — o que forca curadoria em vez de acumulo. Uma base que so cresce e uma base que ninguem poda, e o custo de podar cresce junto. |
| `portas` | objeto | As portas do "compensa mandar", em comando em vez de julgamento. GRANDE: material menor que isto o subagente le direto, mais barato do que indexar e manter. REPETIDO: a segunda consulta ao mesmo material e o gatilho; a primeira nunca indexa, le e segue — e a porta que mais economiza, porque mata o acumulo especulativo. |
| `segredoCaminhos` | 10 padrão(ões) | Bloqueio SEM escape: caminhos que nunca saem da maquina. Diferente da escada de dependencia, aqui nao ha resposta "sim". A escada as vezes termina em instalar o pacote; vazar credencial nunca termina bem. `settings.local.json` esta na lista porque e do proprio nucleo: e onde mora o token do tracker do time. Sem nenhuma barra invertida solta, como o resto do arquivo: estes padroes atravessam shell, JSON e heredoc, e cada camada pode comer um escape. |
| `segredoConteudo` | 9 padrão(ões) | Bloqueio SEM escape: formatos de segredo dentro do proprio conteudo. Um arquivo de nome inocente com uma chave dentro vaza igual. |
| `piiPatterns` | 2 padrão(ões) | Bloqueio SEM escape: dado pessoal. So os formatos BRASILEIROS pontuados, de proposito — CPF sem pontuacao e onze digitos, e onze digitos aparecem em id, timestamp e hash o tempo todo. Falso positivo aqui custa caro porque o bloqueio nao tem escape. Cartao (Luhn) e "tres ou mais e-mails distintos" nao sao regex: estao em lib/externa.mjs, onde da para contar e validar. |
| `tokenWindowMs` | `300000` (300s) | Quanto tempo a autorizacao de envio vale. Mesma janela do portao de publicacao: uma autorizacao esquecida de ontem nao autoriza nada hoje. Diferente do publish-ok, este token NOMEIA o que autoriza: ele guarda o caminho do arquivo liberado, e o portao compara. Um token generico o agente cria sozinho; um token que nomeia o arquivo so sai de quem rodou as portas. |
| `tetoRespostaBytes` | `4000` (4 KB) | Teto de bytes de uma resposta antes de o aviso de custo aparecer. Uma resposta nao custa uma vez: ela fica no contexto e e reprocessada em TODO turno seguinte. Neste projeto ja foram medidos 8.551.717 tokens de entrada contra 202.465 de saida numa sessao — 42x. 4KB colados no turno 10 de uma sessao de 75 nao custam 4KB. |

## `publish`

*o portão de publicação*

| Opção | Default | O que é |
|---|---|---|
| `enabled` | `true` | O portao de publicacao: PR e movimento de card exigem sua autorizacao, toda vez. Ver pre-publish-guard.mjs. |
| `prPatterns` | 6 padrão(ões) | Comandos que tornam o trabalho visivel para o time. |
| `trackerPatterns` | `[]` vazio | Chamadas que mexem no estado de um card. Vazio no nucleo de proposito: cada equipe usa um tracker. Preencha na camada do projeto — sao regex testadas contra o comando inteiro, entao a URL da API costuma bastar. Exemplos: "api.linear.app", "plane[.]exemplo[.]com/api", "/rest/api/3/issue" |
| `sempreTracker` | 1 padrão(ões) | O proprio script do nucleo TEM de passar pelo portao. Ele fala com a API do tracker sem a URL aparecer no comando, entao `trackerPatterns` nao o alcanca — e uma ferramenta que contorna a propria guarda e o jeito mais facil de furar o sistema inteiro. Sempre ativo, nao configuravel. |
| `mcpPrPatterns` | 2 padrão(ões) | Um hook so de Bash deixaria passar livre qualquer tracker acessado por MCP — que e o caminho preferido. Estes padroes casam contra "<nome da ferramenta> <argumentos em JSON>". |
| `mcpTrackerPatterns` | 2 padrão(ões) | O mesmo para as ferramentas que mexem em card. Casa contra o nome da ferramenta MCP, e nao contra uma URL — no MCP nao ha comando de shell. |
| `mcpEscrita` | 1 padrão(ões) | Ler NAO e publicar. Os padroes acima casam o nome do TRACKER, nao a acao — entao `list_work_items` e `retrieve_work_item` eram barrados junto com `update_work_item`. O portao existe para impedir que trabalho saia sem autorizacao; barrar consulta nao protege nada e torna o tracker inutil, que e o caminho mais curto para o time desligar o nucleo inteiro. Casado contra o verbo no FIM do nome (`mcp__plane__list_work_items` -> `list_work_items`), nao contra o nome todo: um servidor chamado "list-manager" nao deve liberar suas escritas. A isencao so vale para acao que NAO contenha nenhum verbo de escrita. Casar so o prefixo deixava `get_or_update_work_item` e `search_and_update_issue` passarem pelo portao INTEIRO — inclusive pelo bloqueio de estado final, que o projeto chama de inviolavel. Um nome composto nao vira leitura por comecar com "get". |
| `mcpLeitura` | 1 padrão(ões) | Verbos que comecam uma acao de leitura. So isentam quando a acao inteira tambem nao casa `mcpEscrita`. |
| `mcpComentario` | 1 padrão(ões) | Comentar registra contexto, nao muda o estado do trabalho — e por isso passa mesmo tendo "create" no nome. Mas so quando for SO comentar: `update_issue_comment_and_state` mexe no estado e nao entra aqui. Acoes de comentario, que passam mesmo tendo "create" no nome. |
| `mcpMexeNoEstado` | 1 padrão(ões) | O que desqualifica uma acao de comentario: se mexe no estado, nao passa. |
| `reviewState` | `"In Review"` | Nome dos estados, so para a mensagem do bloqueio ficar na lingua do time. |
| `doneState` | `"Done"` | O estado final. Citado na mensagem do bloqueio sem escape, junto com `forbiddenStates`, que e quem de fato decide o que e barrado. |
| `forbiddenStates` | 6 padrão(ões) | Estados que o agente NUNCA move, nem com autorizacao: quem revisa move a mao. Diferente do resto do portao, este bloqueio nao tem escape. |
| `baseBranch` | `"develop"` | Base das PRs deste projeto. Citada na mensagem do bloqueio, para o agente nao assumir "main". |
| `escape` | `"CORE_PUBLISH_OK=1"` | Marcador que o agente so usa DEPOIS de ter perguntado e recebido um sim. |
| `escapeHint` | `"CORE_PUBLISH_OK=1"` | O que a mensagem de bloqueio manda o agente usar. Separado de `escape` para poder mudar o texto sem mudar o que e aceito. |
| `tokenWindowMs` | `300000` (300s) | Em MCP nao ha onde prefixar o marcador: a autorizacao vira um arquivo one-shot (.claude/core-state/publish-ok), consumido no uso e valido apenas dentro desta janela — um token esquecido de ontem nao autoriza nada. |

## Desligar uma guarda

Cada uma tem interruptor próprio. Desligue **só a que atrapalha**, e só no
projeto onde atrapalha:

```json
{ "depGuard": { "enabled": false } }
```

Antes de desligar, desconfie da configuração: um bloqueio indevido costuma
ser opção faltando, não guarda errada. Um `stopVerify` que barra depois de
você ter testado quase sempre significa que o comando de teste do projeto
não está em `testPatterns`.

O único bloqueio **sem** interruptor é mover um card para o estado final:
fechar um card é o julgamento de quem revisou, e autorização não transfere
julgamento.
