// Leitura do transcript da sessao.
//
// Compartilhado por stop-verify e pre-publish-guard: os dois precisam responder
// a mesma pergunta — "houve edicao de codigo sem prova depois?" — e uma unica
// implementacao evita que as duas respostas divirjam.

import { readFileSync, statSync, openSync, readSync, closeSync, existsSync, readdirSync } from "node:fs";
import { extname, join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { arquivosEscritosPorShell } from "./escrita-shell.mjs";

const MAX_TAIL_BYTES = 4 * 1024 * 1024; // transcripts longos: le so o final

export function readTail(path) {
  const size = statSync(path).size;
  if (size <= MAX_TAIL_BYTES) return readFileSync(path, "utf8");
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(MAX_TAIL_BYTES);
    readSync(fd, buf, 0, MAX_TAIL_BYTES, size - MAX_TAIL_BYTES);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * Eventos do transcript em ordem cronologica, normalizados para o que os hooks
 * precisam: tool calls e turnos reais do usuario.
 *
 * Um `tool_result` chega numa mensagem de role "user" mas NAO e o usuario
 * falando. Distinguir os dois e o que permite saber se houve uma pausa real
 * para pedir autorizacao.
 */
export function eventos(path) {
  const out = [];
  for (const line of readTail(path).split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }

    const msg = ev?.message;
    if (!msg) continue;
    const content = msg.content;

    if (msg.role === "assistant" && Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === "tool_use") out.push({ tipo: "tool", nome: b.name, input: b.input || {} });
      }
      continue;
    }

    if (msg.role === "user") {
      const ehResultado =
        Array.isArray(content) && content.some((b) => b?.type === "tool_result");
      if (!ehResultado) out.push({ tipo: "usuario" });
    }
  }
  return out;
}

const EDITORES = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

/**
 * Estado de prova da sessao.
 *
 *   editouCodigo   houve edicao de arquivo de codigo
 *   provado        um comando de teste rodou DEPOIS da ultima edicao
 *   arquivos       o que foi editado (para nomear no bloqueio)
 *   falouDepois    o usuario falou depois da ultima edicao — sinal (fraco) de
 *                  que houve uma pausa, nao prova de autorizacao
 */
export function estadoDaProva(path, cfg, cwd) {
  const evs = eventos(path);
  const ehCodigo = (f) => f && cfg.codeExtensions.includes(extname(f).toLowerCase());
  const ehTeste = (c) =>
    c && cfg.testPatterns.some((p) => c.toLowerCase().includes(p.toLowerCase()));

  let ultimaEdicao = -1;
  let ultimoTeste = -1;
  let ultimaFala = -1;
  const arquivos = new Set();

  evs.forEach((e, i) => {
    if (e.tipo === "usuario") { ultimaFala = i; return; }

    if (EDITORES.includes(e.nome) && ehCodigo(e.input.file_path)) {
      ultimaEdicao = i;
      arquivos.add(e.input.file_path);
    }

    if (e.nome === "Bash") {
      if (ehTeste(e.input.command)) ultimoTeste = i;

      // Escrita por shell conta como edicao. Sem isto, um agente que resolve a
      // tarefa por `cat >` ou `Set-Content` encerra a sessao sem nunca ter
      // provado nada — foi exatamente o que aconteceu numa sessao real.
      for (const alvo of arquivosEscritosPorShell(e.input.command)) {
        if (!ehCodigo(alvo)) continue;
        const caminho = isAbsolute(alvo) ? alvo : join(cwd || ".", alvo);
        ultimaEdicao = i;
        arquivos.add(caminho);
      }
    }
  });

  // Um arquivo criado e depois apagado nao precisa de prova: nao existe mais
  // para quebrar nada. Sem este filtro, um scratch temporario fica pendurado na
  // lista de "sem prova" pelo resto da sessao e so sai rodando a suite — um
  // bloqueio injusto, encontrado rodando o hook numa sessao de verdade.
  const vivos = [...arquivos].filter((f) => existsSync(f));

  return {
    editouCodigo: ultimaEdicao !== -1 && vivos.length > 0,
    provado: ultimoTeste > ultimaEdicao,
    falouDepois: ultimaFala > ultimaEdicao,
    arquivos: vivos,
  };
}

/**
 * O transcript da sessao corrente deste projeto.
 *
 * O Claude Code guarda cada sessao em ~/.claude/projects/<slug>/<id>.jsonl, e o
 * slug e o cwd com todo caractere nao alfanumerico trocado por "-":
 *   C:/Users/x/desktop/agente  ->  C--Users-x-desktop-agente
 *
 * Devolve o .jsonl mais recente desse diretorio, ou null. Quem chama de fora
 * de um hook (painel, statusline) nao recebe `transcript_path` no evento — e
 * isto que o substitui.
 */
export function transcriptDaSessao(cwd) {
  const slug = String(cwd || process.cwd()).replace(/[^A-Za-z0-9]/g, "-");
  const dir = join(homedir(), ".claude", "projects", slug);
  if (!existsSync(dir)) return null;
  let melhor = null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".jsonl")) continue;
    const p = join(dir, f);
    const m = statSync(p).mtimeMs;
    if (!melhor || m > melhor.m) melhor = { p, m };
  }
  return melhor?.p || null;
}
