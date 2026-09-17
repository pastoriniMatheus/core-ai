// O painel do nucleo: a sessao, visivel.
//
// O `doctor` torna a INSTALACAO visivel. Faltava tornar a SESSAO visivel: o
// usuario so descobria que o stop-verify ia bloquear quando ele bloqueava. Este
// modulo responde, a qualquer momento, o que os hooks vao responder no fim.
//
// Uma fonte, tres superficies. A fonte e o TRANSCRIPT — os hooks ja o leem, e
// nada aqui cria arquivo de estado nem hook novo. As superficies (comando,
// terminal ao lado, statusline) so chamam `retrato()` e escolhem `emLinha()`
// ou `emQuadro()`.
//
// Ideia portada do painel do bc-harness (ralph-watch): progresso que se le de
// texto puro, sem depender de ferramenta. Codigo nativo, em Node — os hooks do
// nucleo rodam onde o Claude Code roda, e o nucleo acabou de consertar um bug
// que so existia no Linux; bash-only reabriria esse caminho.

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { readTail, estadoDaProva } from "./transcript.mjs";
import { cardsCitados } from "./checkpoint.mjs";
import { lerIndice } from "./externa.mjs";

const FASES = ["EXPLORAR", "ALINHAR", "IMPLEMENTAR", "PROVAR"];

/**
 * O retrato da sessao.
 *
 *   fase        ultimo "[fase] NOME" escrito pelo assistente, ou null
 *   card        o card em foco, pelo mesmo criterio do checkpoint
 *   prova       o que o stop-verify vai ver: editou? provou? quais arquivos?
 *   bloqueios   os ultimos bloqueios dos hooks do nucleo, mais recente primeiro
 *   externa     fontes, vencidas, e quantas consultas houve nesta sessao
 */
export function retrato({ transcriptPath, cwd, cfg }) {
  const vazio = {
    fase: null, card: null, bloqueios: [],
    prova: { editouCodigo: false, provado: false, arquivos: [], falouDepois: false },
    externa: { fontes: 0, vencidas: 0, consultas: 0 },
    transcript: transcriptPath || null,
  };
  if (!transcriptPath || !existsSync(transcriptPath)) return vazio;

  const prova = estadoDaProva(transcriptPath, cfg.stopVerify, cwd);

  let fase = null;
  let consultas = 0;
  const bloqueios = [];
  const conversa = [];

  for (const linha of readTail(transcriptPath).split("\n")) {
    if (!linha.trim()) continue;
    let ev;
    try { ev = JSON.parse(linha); } catch { continue; }
    const msg = ev?.message;
    const content = msg?.content;
    const quando = ev?.timestamp || null;

    if (msg?.role === "user" && typeof content === "string") { conversa.push(content); continue; }
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (msg.role === "assistant" && b?.type === "text" && b.text) {
        conversa.push(b.text);
        // Marcador em texto puro, uma linha sozinha: "[fase] IMPLEMENTAR". E o
        // unico jeito de saber a fase que nao depende de ferramenta nenhuma.
        const m = b.text.match(/^\s*\[fase\]\s+(EXPLORAR|ALINHAR|IMPLEMENTAR|PROVAR)\b/mi);
        if (m) fase = m[1].toUpperCase();
      }
      if (msg.role === "assistant" && b?.type === "tool_use" && b.name === "Bash") {
        if (/(^|[\s;&|])notebooklm\s+ask\b/i.test(b.input?.command || "")) consultas++;
      }
      if (msg.role === "user" && b?.type === "text" && b.text) conversa.push(b.text);
      // Todo hook do nucleo prefixa a razao com "[core]", e ela e a PRIMEIRA
      // coisa no tool_result. Ancorar no inicio e o que separa um bloqueio de
      // um `cat` no proprio codigo do hook — ou de uma suite de teste que
      // imprime "[core]" no meio da saida. (`is_error` nao ajuda: a negativa
      // chega com is_error=false.)
      if (msg.role === "user" && b?.type === "tool_result") {
        const texto = typeof b.content === "string" ? b.content
          : Array.isArray(b.content) ? b.content.map((x) => x?.text || "").join("\n") : "";
        const m = texto.match(/^\s*\[core\]\s*([^\n]{0,110})/);
        if (m) bloqueios.push({ quando, texto: m[1].trim(), hook: hookDoTexto(m[1]) });
      }
    }
  }

  const cards = cardsCitados(conversa.join("\n"), cfg.checkpoint?.cardPattern);
  const idx = lerIndice(cwd, cfg.externa || {});

  return {
    fase,
    card: cards[0] || null,
    prova,
    bloqueios: bloqueios.slice(-5).reverse(),
    externa: { fontes: idx.fontes.length, vencidas: idx.vencidas.length, consultas },
    transcript: transcriptPath,
  };
}

/** Qual guarda falou, a partir da primeira frase do bloqueio. */
function hookDoTexto(t) {
  if (/Portao de publicacao|card|PR\b/i.test(t)) return "publish";
  if (/base externa|nao sai da maquina|Acao bloqueada/i.test(t)) return "externa";
  if (/Dependencia nova/i.test(t)) return "dep";
  if (/Verificacao reprovou|escrito por shell/i.test(t)) return "verify";
  if (/nenhum teste rodou/i.test(t)) return "stop";
  return "core";
}

// ------------------------------------------------------------- renderizacao

const hora = (iso) => {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return isNaN(d) ? "--:--" : d.toTimeString().slice(0, 5);
};

/** Uma linha, para a statusline. Sem cor: a statusline e do Claude Code. */
export function emLinha(r) {
  const p = [];
  p.push(r.fase || "sem fase");
  if (r.card) p.push(r.card);
  if (r.prova.editouCodigo) {
    p.push(r.prova.provado ? "prova ✓" : `prova ✗ ${r.prova.arquivos.length} arq`);
  }
  if (r.bloqueios[0]) p.push(`${r.bloqueios[0].hook} bloqueou ${hora(r.bloqueios[0].quando)}`);
  if (r.externa.vencidas) p.push(`externa ${r.externa.vencidas} vencida(s)`);
  return p.join(" · ");
}

/** O quadro, para o terminal. */
export function emQuadro(r, { cores = true, largura = 72 } = {}) {
  const c = cores
    ? { ok: "\x1b[32m", warn: "\x1b[33m", erro: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", off: "\x1b[0m" }
    : { ok: "", warn: "", erro: "", dim: "", bold: "", off: "" };
  const W = Math.max(48, largura);
  const largo = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length;
  const linha = (s) => `│ ${s}${" ".repeat(Math.max(0, W - 4 - largo(s)))} │`;
  const topo = `┌─ ${c.bold}nucleo${c.off} ${"─".repeat(Math.max(0, W - 11))}┐`;
  const base = `└${"─".repeat(W - 2)}┘`;
  const rot = (t) => `${c.dim}${t.padEnd(10)}${c.off}`;

  const L = [topo];
  L.push(linha(`${rot("fase")}${r.fase ? c.bold + r.fase + c.off : c.dim + "nao declarada" + c.off}`
    + `${" ".repeat(Math.max(1, 26 - (r.fase || "nao declarada").length))}${rot("card")}${r.card || c.dim + "—" + c.off}`));

  if (!r.prova.editouCodigo) {
    L.push(linha(`${rot("prova")}${c.dim}nenhuma edicao de codigo nesta sessao${c.off}`));
  } else if (r.prova.provado) {
    L.push(linha(`${rot("prova")}${c.ok}✓ teste rodou depois da ultima edicao${c.off}`));
  } else {
    const n = r.prova.arquivos.length;
    L.push(linha(`${rot("prova")}${c.erro}✗ ${n} arquivo(s) sem teste${c.off}   ${c.warn}→ o stop-verify vai bloquear${c.off}`));
    const nomes = r.prova.arquivos.slice(-6).map((f) => basename(f)).join("  ");
    L.push(linha(`${rot("")}${c.dim}${nomes.slice(0, W - 16)}${c.off}`));
  }

  if (r.bloqueios.length) {
    const b = r.bloqueios[0];
    L.push(linha(`${rot("bloqueios")}${hora(b.quando)} ${c.warn}${b.hook.padEnd(8)}${c.off} ${c.dim}${b.texto.slice(0, W - 32)}${c.off}`));
    if (r.bloqueios.length > 1) L.push(linha(`${rot("")}${c.dim}+${r.bloqueios.length - 1} anterior(es)${c.off}`));
  } else {
    L.push(linha(`${rot("bloqueios")}${c.dim}nenhum nesta sessao${c.off}`));
  }

  const e = r.externa;
  const venc = e.vencidas ? `${c.erro}${e.vencidas} vencida(s)${c.off}` : `${e.vencidas} vencidas`;
  L.push(linha(`${rot("externa")}${e.fontes} fonte(s) · ${venc} · ${e.consultas} consulta(s) nesta sessao`));

  L.push(base);
  return L.join("\n");
}

export { FASES };
