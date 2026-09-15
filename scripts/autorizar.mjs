#!/usr/bin/env node
// Libera UMA publicação por MCP.
//   node scripts/autorizar.mjs [--projeto <dir>]
//
// Em Bash o agente prefixa o comando com o marcador. Numa chamada MCP não há
// onde prefixar — o schema da ferramenta é fixo — então a autorização vira um
// arquivo, consumido no uso e válido por poucos minutos.
//
// Existe como script, e não como `mkdir && touch`, porque a pasta precisa
// nascer protegida: ela guarda conteúdo de sessão, e depender do .gitignore do
// projeto estar certo é a aposta que este núcleo recusa.
//
// O marcador significa "eu perguntei e o usuário disse sim". Criá-lo sem ter
// perguntado é mentir para a única salvaguarda que existe.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirEstado } from "../plugins/core/hooks/lib/estado.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--projeto");
const projeto = i === -1 ? process.cwd() : args[i + 1];

const dir = dirEstado(projeto);
writeFileSync(join(dir, "publish-ok"), new Date().toISOString() + "\n");

console.log("\n  Autorizada UMA publicacao. Vale alguns minutos e e consumida no uso.\n");
void dirname(fileURLToPath(import.meta.url));
