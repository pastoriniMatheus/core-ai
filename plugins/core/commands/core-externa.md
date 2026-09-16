---
description: Configura a base de conhecimento externa (NotebookLM) — local ou equipe, staging, índice e o servidor de teste em Docker. Rode uma vez por projeto.
argument-hint: [--servidor]
---

Deixe a base de conhecimento externa pronta neste projeto.

A base externa é **opcional** e está declaradamente fora do caminho crítico: o
núcleo funciona inteiro sem ela. Ela serve a um caso só — material de terceiro,
grande e estável, que ninguém vai versionar: manual de integração, norma, guia
de migração.

## 1. Diagnostique antes de perguntar

```bash
node $AGENT_CORE_ROOT/scripts/externa.mjs estado --projeto "."
```

Isso responde sozinho o que a CLI já tem, se há sessão válida, se o staging e o
índice existem, e se há Docker na máquina. Nada disso se pergunta.

## 2. A pergunta que decide tudo

Há uma escolha de topologia — **local** ou **equipe** — mas ela não é a primeira
pergunta, e enquadrá-la como "onde roda?" leva à resposta errada. A escolha real
é de **modelo de credencial**, e a pergunta é esta:

> **Esta conta Google é descartável e dedicada — sem Drive nem Gmail
> corporativo, e fora do SSO da empresa?**

O arquivo de autenticação do NotebookLM é uma credencial de **conta inteira**,
durável. Não é um token de escopo limitado que se revoga sozinho.

- **Não** → o modo equipe é **recusado**, não apenas desaconselhado. Siga em
  local, que é o default e o que se testa primeiro.
- **Sim** → pergunte então se o uso é individual ou compartilhado.

Só depois disso, e só se a resposta foi "sim", a segunda pergunta:

| | Quando |
|---|---|
| **local** | uma pessoa, uma máquina. É o default, e é onde começar sempre |
| **equipe** | várias pessoas — e aceitando o que está no passo 4 |

## 3. Prepare

```bash
node $AGENT_CORE_ROOT/scripts/externa.mjs preparar --projeto "." --modo local
```

Isso cria a pasta de staging `.claude/externa/` (com `.gitignore` próprio),
escreve o índice versionado `docs/base-externa.md`, acrescenta ao `.gitignore`
do repositório as linhas que impedem a credencial de ser commitada, e liga a
seção `externa` no `.claude/core.json`.

Depois, a única etapa que **não** automatiza — e que é do usuário, não sua:

```bash
notebooklm login          # abre um navegador de verdade
notebooklm auth check --test
```

Se o `auth check` não imprimir OK, **pare aí**. Nada a jusante funciona, e o
jeito mais comum de perder a tarde é depurar container quando o problema é
autenticação.

## 4. Modo equipe: o que precisa estar dito antes

A biblioteca não foi feita para multi-tenant, e as consequências são
operacionais, não teóricas:

- **a sessão é única e mutuamente exclusiva.** Enquanto o servidor roda, se
  alguém abrir `notebooklm.google.com` logado nessa conta, derruba todos os
  clientes. O sintoma é o pior possível: falha intermitente, 1 em 5 chamadas,
  sem padrão e sem mensagem que diga o que houve.
- **a quota é da conta, não do dev.** Um agente em laço queima a do time inteiro,
  e o próximo recebe erro sem relação com o que fez.
- **a concorrência de chat é ~3.** Sem fila, o excedente vira 429.
- **não há atribuição.** Todas as ações saem como uma identidade só.

Daí a regra do modo equipe: **N leitores, 1 curador.** Quem envia é o curador, da
máquina dele. E o `master_token.json` nunca sai do servidor — ninguém recebe cópia
"para depurar"; recebe bearer, que se revoga sozinho.

## 5. Servidor de teste, se `$ARGUMENTS` pedir

```bash
node $AGENT_CORE_ROOT/scripts/externa.mjs servidor preparar --projeto "."
node $AGENT_CORE_ROOT/scripts/externa.mjs servidor subir --projeto "."
```

Sobe um container publicando **só em 127.0.0.1**. Leia
`.claude/externa-servidor/LEIA.md` antes: há exatamente um erro grave possível
ali, ele é silencioso, e está explicado lá.

## 6. Diga o que passou a valer

Em poucas linhas, e sem enfeitar:

- **o agente consulta; quem alimenta é o usuário.** Não é limitação técnica: é
  a decisão de desenho. "Mande só o que compensa" é julgamento, e julgamento não
  vira garantia por estar escrito no prompt — então o verbo saiu do agente.
- **quatro portas** decidem o que pode subir, todas por comando: FORA, GRANDE,
  REPETIDO, ESTÁVEL. O gatilho é a **segunda** consulta ao mesmo material.
- **bloqueio sem escape** para credencial, dado pessoal, arquivo versionado,
  compartilhamento, exclusão e qualquer coisa gerada por modelo.
- **fonte vencida barra a consulta**, não avisa — e `docs/base-externa.md` diz
  quais são e de quando.
- **o cliente é a CLI, não o MCP.** Ligar o servidor MCP põe 38 ferramentas no
  system prompt de toda sessão: 12.629 tokens, 13,6× o plugin inteiro do núcleo,
  pagos em todo turno inclusive nos que nunca tocam a base.

Não faça commit. `docs/base-externa.md` e `.claude/core.json` são compartilhados
com a equipe — mostre o diff e pergunte.

<!-- agent-core -->
