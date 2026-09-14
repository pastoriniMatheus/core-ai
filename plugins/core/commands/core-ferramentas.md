---
description: Instala e configura as ferramentas externas do núcleo (Ponytail, Graphify, notebooklm-py). Pergunta se o Graphify roda local ou por servidor MCP.
argument-hint: [--instalar]
---

Instale e configure as ferramentas que o núcleo recebe.

## 1. Diagnostique primeiro

```bash
node $AGENT_CORE_ROOT/scripts/ferramentas.mjs
```

Não instala nada — só relata o que existe, o que falta e a armadilha de cada uma.
Mostre o resultado ao usuário antes de qualquer instalação: mexer na máquina
dele é decisão dele.

## 2. Pergunte onde o Graphify roda

Esta é a única escolha que muda o resultado. Use uma pergunta de múltipla
escolha, com a recomendação primeiro:

**Local, com rebuild automático (recomendado)**
O grafo vive em `graphify-out/` do projeto, fora do git, e o hook post-commit o
reconstrói a cada commit. Zero infra para manter. Cada pessoa tem o seu.

**Servidor MCP**
Um servidor só, o time consulta por MCP. Compensa quando o build do grafo fica
lento num repositório grande — mas é mais uma peça para manter, e **alguém
precisa reconstruir o grafo a cada push**, senão o servidor serve um mapa velho
para todo mundo de uma vez.

> Se o usuário não tiver medido o tempo de build ainda, recomende **local**: a
> migração para MCP depois é barata, e decidir por servidor antes de ter o
> problema é criar manutenção para um problema hipotético.

Escolhido o modo:

```bash
node $AGENT_CORE_ROOT/scripts/ferramentas.mjs --instalar --graphify local
node $AGENT_CORE_ROOT/scripts/ferramentas.mjs --instalar --graphify mcp --mcp-url https://host:8080
```

No modo MCP sem servidor no ar, a configuração é escrita mesmo assim, com a URL
por preencher. Quando o servidor subir, é trocar a URL e nada mais muda.

## 3. Construa o grafo

```bash
node $AGENT_CORE_ROOT/scripts/ferramentas.mjs --projeto . --grafo
```

Usa `--code-only`: o parsing é local, por tree-sitter, e **nada sai da máquina**.
Sem esse flag, documentos e PDFs do repositório vão para o LLM configurado — o
que num projeto com contrato de cliente é a diferença entre local e vazamento.

Num repositório grande, **meça o tempo**. É o número que decide se o modo
servidor vale a pena, e ele só existe depois de rodar.

## 4. O notebooklm-py é opcional

Só instale se o usuário pedir (`--notebooklm`). É biblioteca não-oficial sobre
API não documentada do Google, exige `notebooklm login` e pode quebrar sem aviso.
Mantenha-o fora do caminho crítico: o repositório continua sendo a fonte de
verdade da equipe.

## O que NÃO instalar

**mattpocock/skills.** O núcleo passou a cobrir o mesmo terreno — `fase` faz o
alinhamento, `atacar-card` conduz a implementação, `entregar-trabalho` fecha a
entrega. As três foram escritas a partir das skills do próprio time.

Instalar por cima criaria **duas autoridades de processo disputando cada
decisão**, que é exatamente o erro que o `doctor.mjs` acusa e que este núcleo
existe para eliminar. Se o usuário insistir, instale — mas diga isso antes.

## Ao terminar

Diga em duas linhas o que passou a existir, e o que **ainda depende de ação
dele** — `notebooklm login`, subir o servidor MCP, construir o primeiro grafo.

Não faça commit. Configuração é decisão do usuário.

<!-- agent-core -->
