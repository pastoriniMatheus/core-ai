---
name: mapear-codigo
description: Use antes de alterar codigo que voce ainda nao tem em contexto, ao investigar de onde vem um comportamento, ou ao avaliar o que quebra se algo mudar. Decide entre grafo de dependencias e busca textual, e evita a armadilha do mapa desatualizado.
---

# Grafo ou busca textual

Uma diretriz comum e "nunca use grep, sempre consulte o grafo". Ela e prejudicial:
faz o agente rodar uma ferramenta pesada para achar um literal, e cria uma
dependencia cega de um mapa que pode estar velho.

A regra correta e condicional.

## Qual ferramenta para qual pergunta

| A pergunta e... | Ferramenta | Por que |
|---|---|---|
| "onde esta a string `X`?" | busca textual | mais rapida e mais barata; o grafo nao acrescenta nada |
| "quem chama esta funcao?" | grafo | relacao, nao texto |
| "o que quebra se eu mudar isto?" | grafo | raio de impacto e exatamente o que o grafo modela |
| "como A se conecta a B?" | grafo (caminho mais curto) | busca textual nao atravessa arquivos |
| "quais arquivos tem este padrao?" | busca textual | e uma pergunta lexical |
| "qual o formato deste arquivo?" | leitura direta | nao precisa de mapa |

Resumo: **grafo para relacao, busca para texto, leitura para conteudo.**

## A armadilha do mapa velho

O pior erro de um mapa de codigo nao e a ausencia dele. E ter um desatualizado:
o agente responde com alta confianca sobre uma estrutura que nao existe mais.
Nao ha sinal de erro — a resposta parece certa.

Protecoes, em ordem de forca:

1. **Reconstrucao automatica.** `graphify hook install` liga rebuild em post-commit
   e post-checkout. Isso resolve o problema na raiz; tudo abaixo e paliativo.
2. **Guarda de frescor.** O hook de PreToolUse do core bloqueia consultas quando o
   grafo esta muitos commits atras do HEAD.
3. **Duvida saudavel.** Se o grafo aponta para um arquivo que nao existe ou uma
   assinatura que nao bate, o mapa esta velho — pare e reconstrua.

## Regra de higiene

`graphify-out/` **nunca** e versionado. E grande, muda a cada commit e produz
conflito de merge garantido em qualquer equipe. Ele e artefato regeneravel,
como `node_modules`.

## Antes de gastar a ferramenta

Se voce ja tem o arquivo em contexto, nao consulte nada. A ferramenta mais barata
e a que voce nao precisou chamar.
