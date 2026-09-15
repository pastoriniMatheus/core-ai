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
