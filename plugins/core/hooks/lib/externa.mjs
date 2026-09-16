// A base de conhecimento EXTERNA: classificacao, procedencia e segredo.
//
// Separado do hook de proposito. O portao decide o que fazer; aqui mora o que
// nao cabe em regex — validar cartao por Luhn, contar e-mails distintos, ler o
// indice versionado, extrair caminhos de um comando de shell. Sao as perguntas
// que precisam de codigo, e sao justamente as que o modelo erraria julgando.

import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, isAbsolute, sep } from "node:path";
import { dirEstado } from "./estado.mjs";

/** Testa uma lista de padroes. Um padrao invalido nao derruba os outros. */
export const bate = (padroes, texto) =>
  (padroes || []).some((p) => {
    try { return new RegExp(p, "i").test(texto); } catch { return false; }
  });

// ------------------------------------------------------- vocabulario da CLI
//
// Estrutura, nao politica: por isso vive aqui e nao no core.json. Sao os grupos
// e comandos que o `notebooklm --help` publica. Sem esta lista nao da para
// achar a acao num comando com opcoes globais antes dela — `notebooklm
// --profile x ask "..."` — e um parser ingenuo diria que a acao e "x".
const GRUPOS = new Set([
  "source", "artifact", "note", "label", "collection", "share",
  "research", "profile", "agent", "skill", "language", "mcp", "auth",
]);
const TOPO = new Set([
  "ask", "list", "create", "copy", "delete", "rename", "summary", "metadata",
  "suggest-prompts", "suggest-next-steps", "configure", "history", "status",
  "clear", "doctor", "completion",
]);
// `generate audio` e `download report`: a acao so significa alguma coisa com o
// tipo junto.
const COM_TIPO = new Set(["generate", "download"]);

/** Divide um comando em tokens, respeitando aspas simples e duplas. */
export function tokens(cmd) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd || ""))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/**
 * A acao dentro de um comando da CLI: `source add`, `ask`, `generate audio`.
 *
 * Devolve "" quando nao reconhece — e quem chama trata desconhecido como ENVIO.
 * Versao nova da biblioteca traz comando novo, e o default seguro e pedir
 * autorizacao, nunca liberar.
 */
export function acaoDoComando(cmd) {
  const t = tokens(cmd);
  // Comeca depois do binario; antes dele pode haver `env X=1`, `uv run`, etc.
  let i = t.findIndex((x) => /(^|[/\\])notebooklm(-mcp)?([.](exe|cmd|bat))?$/i.test(x));
  if (i === -1) return "";
  for (let k = i + 1; k < t.length; k++) {
    const tok = t[k];
    if (tok.startsWith("-")) continue;
    const proximo = t.slice(k + 1).find((x) => !x.startsWith("-")) || "";
    if (GRUPOS.has(tok)) return `${tok} ${proximo}`.trim();
    if (COM_TIPO.has(tok)) return `${tok} ${proximo}`.trim();
    if (TOPO.has(tok)) return tok;
  }
  return "";
}

/**
 * O que esta chamada e, para o portao.
 *
 * Cobre os DOIS caminhos. A CLI e o cliente recomendado — o MCP custa 12.629
 * tokens de system prompt em toda sessao — mas quem ligar o MCP assim mesmo
 * continua passando por aqui. Ter um caminho coberto e outro aberto ja foi o
 * erro recorrente deste projeto seis vezes.
 */
export function classifica(cfg, toolName, toolInput) {
  const tool = toolName || "";
  if (tool.startsWith("mcp__")) {
    const partes = tool.split("__");
    const servidor = partes[1] || "";
    if (!bate(cfg.servidores, servidor)) return null;
    const acao = partes[partes.length - 1] || "";
    return { via: "mcp", acao, texto: `${tool} ${JSON.stringify(toolInput || {})}` };
  }
  const cmd = toolInput?.command || "";
  if (!cmd || !bate(cfg.binarios, cmd)) return null;
  return { via: "cli", acao: acaoDoComando(cmd), texto: cmd };
}

/** consulta | proibida | envio. Desconhecido cai em envio: falha fechado. */
export function tipoDaAcao(cfg, acao) {
  if (bate(cfg.proibidas, acao)) return "proibida";
  if (bate(cfg.consulta, acao)) return "consulta";
  return "envio";
}

// --------------------------------------------------------- segredo e PII

/** Luhn. Sozinho nao basta: 1 em 10 sequencias de 16 digitos passa. */
function luhn(d) {
  let soma = 0;
  let alterna = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alterna) { n *= 2; if (n > 9) n -= 9; }
    soma += n;
    alterna = !alterna;
  }
  return soma % 10 === 0;
}

// Prefixos de bandeira. E o que separa "cartao" de "um id de 16 digitos que
// por acaso passou no Luhn" — sem isto o bloqueio SEM ESCAPE dispararia em
// codigo normal, e um bloqueio sem escape com falso positivo e o jeito mais
// rapido de alguem desligar a guarda inteira.
const BANDEIRA = /^(4|5[1-5]|2[2-7]|3[47]|30[0-5]|3[68]|6011|65)/;

function achaCartao(texto) {
  const re = /(?:^|[^0-9])((?:[0-9][ -]?){12,18}[0-9])(?![0-9])/g;
  let m;
  while ((m = re.exec(texto))) {
    const d = m[1].replace(/[ -]/g, "");
    if (d.length >= 13 && d.length <= 19 && BANDEIRA.test(d) && luhn(d)) return d;
  }
  return null;
}

/** Tres ou mais e-mails distintos: deixou de ser contato, virou lista de pessoas. */
function achaListaDeEmails(texto) {
  const achados = new Set(
    (texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}/g) || []).map((e) => e.toLowerCase())
  );
  return achados.size >= 3 ? [...achados].slice(0, 3) : null;
}

/**
 * O que nunca sai da maquina. Devolve `{ classe, evidencia }` ou null.
 *
 * Diferente da escada de dependencia, aqui nao ha resposta "sim": a escada as
 * vezes termina em instalar o pacote, vazar credencial nunca termina bem.
 */
export function achaSegredo(cfg, texto) {
  if (!texto) return null;
  for (const p of cfg.segredoCaminhos || []) {
    try {
      const m = texto.match(new RegExp(p, "i"));
      if (m) return { classe: "caminho proibido", evidencia: m[0].slice(0, 60) };
    } catch { /* padrao invalido: segue nos outros */ }
  }
  for (const p of cfg.segredoConteudo || []) {
    try {
      const m = texto.match(new RegExp(p, "i"));
      // A evidencia e o FORMATO, nunca o valor: a mensagem do bloqueio vai
      // para o transcript, e um segredo citado no motivo do bloqueio vazou
      // do mesmo jeito.
      if (m) return { classe: "formato de segredo", evidencia: p };
    } catch { /* idem */ }
  }
  for (const p of cfg.piiPatterns || []) {
    try {
      if (new RegExp(p, "i").test(texto)) return { classe: "dado pessoal (CPF/CNPJ)", evidencia: p };
    } catch { /* idem */ }
  }
  if (achaCartao(texto)) return { classe: "numero de cartao (Luhn + bandeira)", evidencia: "13-19 digitos" };
  const emails = achaListaDeEmails(texto);
  if (emails) return { classe: "lista de pessoas (3+ e-mails distintos)", evidencia: `${emails.length}+ enderecos` };
  return null;
}

// ------------------------------------------------------------- procedencia

/** Caminhos de arquivo citados num comando ou num JSON de argumentos. */
export function caminhosCitados(texto) {
  const out = new Set();
  for (const t of tokens(texto)) {
    if (t.startsWith("-")) continue;
    if (/^https?:\/\//i.test(t)) continue;
    if (!/[/\\]/.test(t) && !/[.][A-Za-z0-9]{1,6}$/.test(t)) continue;
    out.add(t.replace(/^["']|["',}]+$/g, ""));
  }
  // Argumentos MCP chegam como JSON: os caminhos estao dentro das strings.
  for (const m of texto.matchAll(/"([^"]*[/\\][^"]*)"/g)) out.add(m[1]);
  return [...out];
}

/** O arquivo esta versionado neste repositorio? */
export function rastreado(arquivo, cwd) {
  const r = spawnSync("git", ["ls-files", "--error-unmatch", arquivo], {
    cwd: cwd || ".", encoding: "utf8", timeout: 5000, windowsHide: true,
  });
  return r.status === 0;
}

/** Esta dentro da pasta de staging? Allowlist de origem vence blocklist. */
export function dentroDoStaging(arquivo, cwd, staging) {
  try {
    const base = resolve(cwd || ".", staging);
    const alvo = isAbsolute(arquivo) ? resolve(arquivo) : resolve(cwd || ".", arquivo);
    return alvo === base || alvo.startsWith(base + sep);
  } catch {
    return false;
  }
}

// ------------------------------------------------------- indice versionado

/**
 * Le `docs/base-externa.md`: uma linha de tabela por fonte.
 *
 * | Fonte | Origem | Enviada em | Vale ate | Consultas |
 *
 * E o que transforma "alguem devia atualizar a base" em comparacao de datas.
 * Sem indice, a base vira oraculo paralelo: ninguem sabe o que tem la dentro,
 * de quando e, nem se ainda vale.
 */
export function lerIndice(cwd, cfg, hoje = Date.now()) {
  const p = join(cwd || ".", cfg.indice || "docs/base-externa.md");
  if (!existsSync(p)) return { existe: false, fontes: [], vencidas: [] };
  let txt = "";
  try { txt = readFileSync(p, "utf8"); } catch { return { existe: false, fontes: [], vencidas: [] }; }

  const fontes = [];
  for (const linha of txt.split("\n")) {
    if (!linha.trim().startsWith("|")) continue;
    const col = linha.split("|").map((c) => c.trim());
    if (col.length < 6) continue;
    const [, nome, origem, enviada, vale, consultas] = col;
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(vale)) continue; // cabecalho e separador caem aqui
    fontes.push({
      nome, origem, enviada, vale,
      consultas: parseInt(consultas, 10) || 0,
      vencida: Date.parse(vale + "T23:59:59Z") < hoje,
    });
  }
  return { existe: true, fontes, vencidas: fontes.filter((f) => f.vencida) };
}

// -------------------------------------------------------- autorizacao

/**
 * A autorizacao NOMEIA o que autoriza.
 *
 * O `publish-ok` e um arquivo vazio: qualquer um cria com `touch`, e isso esta
 * certo la — o portao de publicacao existe para forcar a PERGUNTA ao usuario, e
 * o agente criar o arquivo depois do "pode" e o protocolo.
 *
 * Aqui nao serve. O que precisa ser verdade nao e "o usuario disse sim", e sim
 * "as portas foram checadas por comando". Entao o token guarda o caminho
 * liberado, e o portao compara com o que o comando esta de fato enviando. Um
 * token generico o agente fabrica sozinho; um token que nomeia o arquivo so sai
 * de quem rodou `scripts/externa.mjs enviar`.
 */
export function consomeAutorizacao(cwd, cfg, texto) {
  const p = join(cwd || ".", ".claude", "core-state", "externa-ok");
  if (!existsSync(p)) return { ok: false, motivo: "sem autorizacao" };
  let dados = null;
  let idadeMs = Infinity;
  try {
    idadeMs = Date.now() - statSync(p).mtimeMs;
    dados = JSON.parse(readFileSync(p, "utf8"));
  } catch { /* token ilegivel: cai no consumo abaixo */ }
  try { unlinkSync(p); } catch { /* ja sumiu */ }

  if (!dados?.alvo) return { ok: false, motivo: "token nao diz o que autoriza" };
  if (idadeMs > (cfg.tokenWindowMs ?? 300000)) return { ok: false, motivo: "token vencido" };
  // O alvo tem de aparecer no comando: uma autorizacao para o manual da SEFAZ
  // nao autoriza subir outro arquivo.
  const alvo = String(dados.alvo);
  const nu = (s) => s.replace(/\\/g, "/").toLowerCase();
  if (!nu(texto).includes(nu(alvo)) && !nu(texto).includes(nu(alvo.split(/[/\\]/).pop() || ""))) {
    return { ok: false, motivo: `o token autoriza "${alvo}", nao este comando` };
  }
  return { ok: true, alvo };
}

/**
 * Emite a autorizacao. So `scripts/externa.mjs` chama isto, depois das portas.
 *
 * Passa por `dirEstado` em vez de escrever direto: alem de criar a pasta, ele a
 * deixa com um `.gitignore` proprio contendo `*`. Um token que diz qual arquivo
 * externo o time ia mandar para o Google e conteudo de sessao — nao pode acabar
 * num commit por falta de uma linha de ignore no projeto.
 */
export function emiteAutorizacao(cwd, alvo) {
  const p = join(dirEstado(cwd), "externa-ok");
  writeFileSync(p, JSON.stringify({ alvo, em: Date.now() }) + "\n");
  return p;
}
