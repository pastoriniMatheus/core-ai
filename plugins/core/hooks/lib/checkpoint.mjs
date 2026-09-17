// O que a sessão fez, em forma de retomada.
//
// Uma sessão que termina no meio não deixa rastro além do transcript, e o
// transcript é longo demais para servir de ponto de partida. Duas semanas
// depois, "onde eu tinha parado" custa uma leitura inteira do que já foi feito
// — quando não custa refazer.
//
// O checkpoint responde três coisas, que são as que se perdem primeiro: o que
// estava sendo feito, até onde chegou, e o que ficou aberto.

import { readFileSync, statSync, openSync, readSync, closeSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, basename } from "node:path";
import { ehShell } from "./escrita-shell.mjs";

const MAX_TAIL_BYTES = 4 * 1024 * 1024;

function readTail(path) {
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
 * Identificadores de card citados na sessão, do mais recente ao mais antigo.
 *
 * O padrão traz delimitadores como grupos em vez de `\b` — um `\b` num literal
 * de string perde o escape com facilidade e vira backspace, e aí o padrão para
 * de casar sem avisar. Por isso o identificador é procurado em QUALQUER grupo
 * capturado, e não numa posição fixa.
 */
export function cardsCitados(bruto, padrao) {
  const re = new RegExp(padrao || "(^|[^A-Za-z0-9])([A-Z]{2,10}-[0-9]+)([^A-Za-z0-9]|$)", "g");
  const ehCard = /^[A-Z]{2,10}-[0-9]+$/;
  const vistos = [];
  for (const m of bruto.matchAll(re)) {
    const id = m.slice(1).find((g) => g && ehCard.test(g)) || (ehCard.test(m[0]) ? m[0] : null);
    if (id && !vistos.includes(id)) vistos.push(id);
  }
  // O último citado é quase sempre o que estava em foco no fim da sessão.
  return vistos.reverse();
}

const git = (args, cwd) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 5000, windowsHide: true });
  return r.status === 0 ? (r.stdout || "").trim() : "";
};

/**
 * Monta o checkpoint a partir do transcript.
 *
 * Deliberadamente conservador sobre o que conta como "trabalho": uma sessão que
 * só leu arquivos não gera checkpoint nenhum. Checkpoint em toda sessão é ruído,
 * e ruído em ferramenta de retomada faz ninguém ler o que importa.
 */
export function montar({ transcriptPath, cwd, cfg = {} }) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;

  const bruto = readTail(transcriptPath);
  const linhas = bruto.split("\n");

  const editados = new Set();
  const testes = [];
  const pedidos = [];
  // Só o que foi CONVERSADO entra na busca por card. Varrer o transcript inteiro
  // acha o identificador em caminho de arquivo — um diretório temporário
  // chamado "...-ACME-0042-..." vira "card ACME-0042", e o checkpoint abre a
  // próxima sessão apontando para um card que não existe.
  const conversa = [];
  let ultimoTexto = "";
  let fase = null;

  const ehCodigo = (f) =>
    f && (cfg.codeExtensions || []).includes(extname(f).toLowerCase());
  const ehTeste = (c) =>
    c && (cfg.testPatterns || []).some((p) => c.toLowerCase().includes(p.toLowerCase()));

  for (const linha of linhas) {
    if (!linha.trim()) continue;
    let ev;
    try { ev = JSON.parse(linha); } catch { continue; }
    const msg = ev?.message;
    const content = msg?.content;
    if (!Array.isArray(content)) {
      // Uma mensagem de usuário em texto puro é o pedido dela.
      if (msg?.role === "user" && typeof content === "string" && content.trim()) {
        pedidos.push(content.trim());
        conversa.push(content);
      }
      continue;
    }

    if (msg.role === "user" && !content.some((b) => b?.type === "tool_result")) {
      const t = content.filter((b) => b?.type === "text").map((b) => b.text).join(" ").trim();
      if (t) { pedidos.push(t); conversa.push(t); }
    }

    if (msg.role === "assistant") {
      for (const b of content) {
        if (b?.type === "text" && b.text?.trim()) {
          ultimoTexto = b.text.trim();
          conversa.push(b.text);
          // O marcador da skill `fase`, em texto puro. A retomada da proxima
          // sessao ganha "em que fase eu estava" sem custar nada a mais.
          const m = b.text.match(/^\s*\[fase\]\s+(EXPLORAR|ALINHAR|IMPLEMENTAR|PROVAR)\b/mi);
          if (m) fase = m[1].toUpperCase();
        }
        if (b?.type !== "tool_use") continue;
        const f = b.input?.file_path;
        if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(b.name) && ehCodigo(f)) {
          editados.add(f);
        }
        if (ehShell(b.name) && ehTeste(b.input?.command)) testes.push(b.input.command);
      }
    }
  }

  const vivos = [...editados].filter((f) => existsSync(f));
  // Sessão sem edição de código não tem o que retomar.
  if (!vivos.length) return null;

  const cards = cardsCitados(conversa.join("\n"), cfg.cardPattern);

  return {
    em: new Date().toISOString(),
    card: cards[0] || null,
    fase,
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"], cwd) || null,
    ultimoCommit: git(["log", "-1", "--format=%h %s"], cwd) || null,
    naoCommitado: git(["status", "--short"], cwd).split("\n").filter(Boolean).length,
    arquivos: vivos.slice(-12).map((f) => basename(f)),
    testouDepois: testes.length > 0,
    ultimoTeste: testes[testes.length - 1] || null,
    pedido: pedidos[0]?.slice(0, 300) || null,
    ondeParou: ultimoTexto.slice(0, 600) || null,
  };
}

/** O checkpoint como texto, para um humano ou para o agente da próxima sessão. */
export function emTexto(c) {
  const l = [];
  l.push(`Sessão anterior: ${new Date(c.em).toLocaleString("pt-BR")}`);
  if (c.fase) l.push(`Fase: ${c.fase}`);
  if (c.card) l.push(`Card: ${c.card}`);
  if (c.branch) l.push(`Branch: ${c.branch}`);
  if (c.ultimoCommit) l.push(`Último commit: ${c.ultimoCommit}`);
  if (c.naoCommitado) l.push(`Alterações não commitadas: ${c.naoCommitado} arquivo(s)`);
  l.push(`Arquivos tocados: ${c.arquivos.join(", ")}`);
  l.push(
    c.testouDepois
      ? `Teste rodado: ${c.ultimoTeste}`
      : `SEM PROVA — nenhum teste rodou depois da última edição`
  );
  if (c.pedido) l.push(`\nPedido original:\n  ${c.pedido}`);
  if (c.ondeParou) l.push(`\nOnde parou:\n  ${c.ondeParou.replace(/\n/g, "\n  ")}`);
  return l.join("\n");
}
