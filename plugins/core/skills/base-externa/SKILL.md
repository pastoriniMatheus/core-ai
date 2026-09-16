---
name: base-externa
description: Use ao consultar ou cogitar alimentar uma base de conhecimento externa (NotebookLM). Decide quando consultar vale mais que ler direto, o que pode subir e o que nunca sobe, e como citar a resposta sem trocar fato versionado por sintese.
---

# A base externa é índice de busca, não memória

O invariante que amarra tudo o que vem abaixo:

> **Se a base externa sumisse hoje, a equipe não perderia nada além de tempo de
> busca.**

Se apagá-la doeria, alguém pôs lá dentro algo que devia estar no repositório —
e isso é detectável olhando `docs/base-externa.md`. A base guarda material de
**terceiro**, grande e estável, que ninguém vai versionar. Não guarda o que a
equipe sabe.

## A ordem de consulta

O agente já tem três fontes mais baratas e mais confiáveis. A base externa entra
**abaixo das três**, nunca como atalho:

| Pergunta | Fonte | Por quê |
|---|---|---|
| "quem chama isto?", "o que quebra?" | grafo de código | relação, com verdade de código |
| "onde está `X`?" | busca textual | lexical, instantânea, local |
| "como este projeto faz Y?" | `CONTEXT.md`, `docs/`, o próprio código | versionado, com data e autoria |
| "o que a norma/o fornecedor exige?" | **base externa** | material de fora, grande demais para o repo |

Uma consulta à base custa segundos e volta como prosa sintetizada. Isso muda o
comportamento, não só o relógio: quem esperou vinte segundos tende a **aceitar**
o que recebeu em vez de investigar, porque investigar custa mais vinte. Ferramenta
lenta vence ferramenta certa por atrito — por isso a ordem acima é fixa.

## Consultar

```bash
notebooklm ask "<a pergunta>"
```

Rode **em subagente** sempre que a resposta puder ser longa. Não é preciosismo:
uma resposta não custa o que ela mede. Ela fica no contexto e é reprocessada em
**todo turno seguinte** — neste projeto já se mediram 8.551.717 tokens de
entrada contra 202.465 de saída numa sessão só. Um texto de 1.500 tokens colado
no turno 20 de uma sessão de 75 custa 82.500. O subagente lê inteiro e devolve
destilado.

Ao usar a resposta, **carimbe a procedência**:

> Segundo *<fonte>*, enviada em *<data>* — confirme na URL antes de decidir.

Isso não é formalidade. A resposta é síntese de um modelo sobre fontes que
ninguém está vendo, sem data e sem autoria no repositório. Citá-la dentro de uma
decisão sem dizer de onde veio é citar um boato bem escrito.

E se a resposta vier vazia: **vazio não é "não está documentado"**. É quase
sempre a sessão do Google tendo morrido. O hook `post-externa-resposta` troca o
vazio por um aviso explícito justamente porque essa confusão produz alucinação
por omissão — dita com confiança.

## Registrar o que você consultou fora

Quando você ler material externo para responder alguma coisa — a documentação de
um fornecedor, uma norma, o guia de migração de um framework:

```bash
node $AGENT_CORE_ROOT/scripts/externa.mjs consultei <URL> "<o que precisava>"
```

Se isso falhar com *Cannot find module*, a variável está defasada — ela vem de um
arquivo que o Claude Code lê antes dos hooks, e o cache do plugin é versionado
por diretório. O caminho certo aparece no início da sessão; use-o.

Uma linha, e ela é o que faz a porta REPETIDO existir. Sem esse registro,
"vale a pena indexar isto?" volta a ser palpite.

## As quatro portas

**Você não envia.** O portão bloqueia, e está certo em bloquear: enviar é
irreversível e sai sob a conta de alguém. Falso positivo custa um prompt; falso
negativo é permanente.

O que você faz é **propor** — e só quando as quatro portas passam. Todas
verificáveis por comando, nenhuma por opinião:

| Porta | Exige | Verifica-se com |
|---|---|---|
| **FORA** | escrito por terceiro, com URL pública citável | `git ls-files` não acha, e a URL abre sem login |
| **GRANDE** | ≥ 195 KB (200.000 bytes) | `wc -c` |
| **REPETIDO** | ≥ 2 consultas **já registradas** | `docs/base-externa.md` |
| **ESTÁVEL** | nenhum commit nosso muda o conteúdo | decorre de FORA |

Falhou uma porta, não sobe. Sem nota de corte e sem "mas é importante".

**O gatilho é a segunda consulta ao mesmo material.** A primeira nunca indexa:
leia e siga. É a porta que mais economiza, porque mata o acúmulo especulativo —
o hábito de mandar para lá tudo que "pode ser útil depois".

Quando as quatro passarem, diga ao usuário: a origem, o tamanho, as duas
consultas que já aconteceram, a validade sugerida. E **pare**. Quem executa é
ele:

```bash
node $AGENT_CORE_ROOT/scripts/externa.mjs enviar <arquivo> --origem <URL>
```

## O que vale e o que não vale

**Vale** — externo, grande, estável, reusado:

- manual de integração de terceiro (NF-e/SEFAZ, gateway de pagamento, ERP)
- guias de migração e release notes da versão-alvo, durante a migração
- texto legal e normativo: LGPD e resoluções da ANPD, PCI-DSS, WCAG
- help center **público** e termos de uso do produto do cliente
- especificação de protocolo ou norma técnica extensa

**Não vale** — e os dois primeiros são os que mais parecem razoáveis:

- `CONTEXT.md`, `docs/`, skills e ADRs do próprio repositório: duplicar cria uma
  segunda autoridade, que desatualiza no primeiro commit
- trecho de código do cliente "só para o agente entender a arquitetura"
- decisão de arquitetura tomada hoje: isso é conhecimento do time e vai para o
  repositório via `extrair-skill`
- README de 30 KB, ou doc que você leu uma vez: subagente lendo direto sai mais
  barato que indexar e manter
- qualquer material na **primeira** consulta
- doc de terceiro que muda toda semana: fonte velha responde com confiança sobre
  o que não existe mais
- log, stack trace, export de CI, planilha, dump de banco

**Nunca** — e aqui o portão bloqueia sem escape:

- credencial de qualquer tipo, PII (CPF, CNPJ, cartão, lista de e-mails),
  conteúdo não publicado do cliente, artefato de produção
- **nada gerado por modelo**: resumo, áudio, nota. Vira fonte, e a consulta
  seguinte lê o palpite do agente como se fosse a documentação do fornecedor.
  É o loop de auto-contaminação, e ele não dá sinal de que começou.

## Podar

Fonte vencida **barra a consulta**, não avisa. É deliberado: um aviso que aparece
em toda consulta vira ruído em duas semanas, e a fonte continua velha. O bloqueio
tem conserto de um comando, e acontece no máximo duas vezes por ano.

Quando ele aparecer, a pergunta não é "como destravo?" — é **"esta fonte ainda
merece estar aqui?"**. Na dúvida, tire: reenviar é barato, e uma base menor é
uma base em que se confia.
