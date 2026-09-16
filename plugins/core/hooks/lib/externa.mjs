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
  "clear", "doctor", "completion", "login", "logout",
]);

// Invocacao sem subcomando (`notebooklm`, `notebooklm --version`, `--help`):
// imprime ajuda e nao toca em nada. Precisa de um nome proprio porque "" ja
// significa "acao que nao reconheco", que falha fechado — e barrar `--version`
// seria barrar o proprio diagnostico que o nucleo manda rodar.
export const SEM_ACAO = "__ajuda";
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
  return acoesDoComando(cmd)[0] ?? "";
}

/**
 * Normaliza um comando antes de qualquer casamento.
 *
 * Os padroes do core.json usam `( |$)` como fronteira, porque escapes como
 * `\s` nao sobrevivem a viagem por shell, JSON e heredoc. So que shell de
 * verdade separa por muito mais que espaco: tab, quebra de linha, `;`, `&&`,
 * `|`, parenteses, crase, aspas. Sem normalizar, `(notebooklm ask)` ou
 * `notebooklm<TAB>source add` nao casam — e o portao simplesmente nao roda.
 *
 * Em vez de complicar os padroes, simplifica-se a entrada: tudo que separa vira
 * espaco, e ai `( |$)` volta a significar o que promete.
 *
 * Serve so para DETECTAR que o comando fala com a base. Quem decide QUAL acao
 * e `acoesDoComando`, que respeita aspas — aqui elas sao apagadas de proposito,
 * e uma palavra entre aspas nao e um comando.
 */
export function normaliza(cmd) {
  return String(cmd || "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/[;&|()`"']/g, " $& ")
    .replace(/ +/g, " ")
    .trim();
}

/** Um token e o binario da CLI. */
const EH_BINARIO = /^(.*[/\\])?notebooklm(-mcp|-server)?([.](exe|cmd|bat))?$/i;

/**
 * Quebra um comando nos separadores de shell que NAO estao entre aspas.
 *
 * Quebrar por texto puro confundia duas coisas muito diferentes: `notebooklm`
 * como comando, e a palavra "notebooklm" dentro de uma mensagem de commit. So a
 * primeira executa alguma coisa.
 */
function segmentos(cmd) {
  const out = [];
  let atual = "";
  let aspas = null;
  const s = String(cmd || "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (aspas) {
      atual += ch;
      if (ch === aspas) aspas = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { aspas = ch === "`" ? null : ch; atual += ch; if (ch === "`") { out.push(atual); atual = ""; } continue; }
    if (ch === ";" || ch === "\n" || ch === "(" || ch === ")" || ch === "{" || ch === "}") { out.push(atual); atual = ""; continue; }
    if ((ch === "&" || ch === "|") ) { out.push(atual); atual = ""; if (s[i + 1] === ch) i++; continue; }
    atual += ch;
  }
  out.push(atual);
  return out.filter((x) => x.trim());
}

// Prefixos que antecedem o comando de verdade: `env X=1 notebooklm ...`,
// `sudo notebooklm ...`, `time notebooklm ...`.
const PREFIXOS = new Set(["env", "sudo", "time", "nohup", "exec", "command", "then", "do", "else"]);

/**
 * TODAS as acoes de um comando, e nao so a primeira.
 *
 * Este foi o furo mais grave que este projeto ja abriu. A versao anterior
 * devolvia a PRIMEIRA acao reconhecida e parava. Bastava encadear —
 *
 *     notebooklm ask "oi" && notebooklm share public nb1
 *
 * — para a linha inteira ser classificada como "ask", cair em consulta e passar
 * direto. Inclusive pelos bloqueios que este projeto chama de inviolaveis:
 * compartilhar, apagar, gerar conteudo de modelo dentro da base.
 *
 * E a setima encarnacao de "um caminho coberto, outro aberto", e a correcao nao
 * e cobrir `&&`: e parar de assumir que um comando tem uma acao so.
 *
 * Uma entrada "" na lista significa "invocacao com acao que nao reconheco" — e
 * quem chama trata isso como ENVIO, que falha fechado.
 */
export function acoesDoComando(cmd) {
  const achadas = [];
  for (const seg of segmentos(cmd)) {
    const t = tokens(seg.replace(/[\t\r]+/g, " "));
    // O binario tem de estar em POSICAO DE COMANDO. Sem isso, a palavra
    // "notebooklm" dentro de `git commit -m "notebooklm"` era lida como uma
    // invocacao — e barrava um commit legitimo.
    let i = 0;
    while (i < t.length && (PREFIXOS.has(t[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i]))) i++;
    if (i >= t.length || !EH_BINARIO.test(t[i])) continue;

    let acao = null;
    let puloValor = false;
    for (let k = i + 1; k < t.length; k++) {
      const tok = t[k];
      if (tok.startsWith("-")) { puloValor = !tok.includes("="); continue; }
      const conhecido = GRUPOS.has(tok) || COM_TIPO.has(tok) || TOPO.has(tok);
      // Valor de uma opcao global (`--profile trab ask "x"`) nao e a acao. Mas
      // uma acao CONHECIDA logo depois de uma flag booleana (`--json ask`) e.
      if (puloValor && !conhecido) { puloValor = false; acao = acao ?? ""; continue; }
      puloValor = false;
      if (GRUPOS.has(tok) || COM_TIPO.has(tok)) {
        const proximo = t.slice(k + 1).find((x) => !x.startsWith("-")) || "";
        acao = `${tok} ${proximo}`.trim();
      } else if (TOPO.has(tok)) acao = tok;
      else acao = ""; // subcomando que este nucleo nao conhece: falha fechado
      break;
    }
    // Sem nenhum token depois do binario: `notebooklm`, `notebooklm --version`.
    achadas.push(acao === null ? SEM_ACAO : acao);
  }
  return achadas;
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
    const acao = partes[partes.length - 1] || "";
    // O nome do servidor e APELIDO local: quem configurar o MCP como "kb"
    // escapava do portao inteiro. Entao tambem se reconhece pela ACAO — os 37
    // nomes de ferramenta do notebooklm-py sao especificos o bastante para nao
    // colidirem com outro servidor por acidente.
    const pelaAcao = bate(cfg.consulta, acao) || bate(cfg.proibidas, acao);
    if (!bate(cfg.servidores, servidor) && !pelaAcao) return null;
    return { via: "mcp", acoes: [acao], texto: `${tool} ${JSON.stringify(toolInput || {})}` };
  }
  const cmd = toolInput?.command || "";
  if (!cmd) return null;
  const norm = normaliza(cmd);
  if (bate(cfg.binarios, norm)) {
    const acoes = acoesDoComando(cmd);
    // Nenhuma invocacao em posicao de comando: o binario aparece como DADO —
    // numa mensagem de commit, num echo, num caminho de log. Nao e assunto
    // deste hook, e trata-lo como envio barrava trabalho legitimo.
    if (acoes.length) return { via: "cli", acoes, texto: cmd };
  }
  // Rota indireta: chega na base sem passar pela CLI nem pelo MCP. Nao ha acao
  // legivel — e por isso ela e negada, nunca classificada.
  if (bate(cfg.rotasIndiretas, norm)) return { via: "indireta", acoes: [], texto: cmd };
  return null;
}

/** consulta | proibida | envio. Desconhecido cai em envio: falha fechado. */
export function tipoDaAcao(cfg, acao) {
  if (acao === SEM_ACAO) return "consulta";
  if (bate(cfg.proibidas, acao)) return "proibida";
  if (bate(cfg.consulta, acao)) return "consulta";
  return "envio";
}

/**
 * O tipo de um comando INTEIRO: a acao mais restritiva manda.
 *
 * Um comando com varias invocacoes vale pela pior delas. Qualquer outra regra
 * — a primeira, a ultima, a maioria — e um convite a encadear a acao perigosa
 * atras de uma inofensiva, que foi exatamente o furo.
 */
export function tipoDoComando(cfg, acoes) {
  const lista = acoes.length ? acoes : [""];
  const tipos = lista.map((a) => tipoDaAcao(cfg, a));
  if (tipos.includes("proibida")) return { tipo: "proibida", acao: lista[tipos.indexOf("proibida")] };
  if (tipos.includes("envio")) return { tipo: "envio", acao: lista[tipos.indexOf("envio")] };
  return { tipo: "consulta", acao: lista[0] };
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
  // Agrupamento CONSISTENTE, e nao "um separador opcional entre cada digito".
  //
  // A versao anterior aceitava `(?:[0-9][ -]?){12,18}[0-9]`, que costura numeros
  // vizinhos separados por espaco numa "sequencia" de 17-19 digitos. Num stream
  // de PDF isso e o formato NORMAL — operadores numericos separados por espaco —
  // e uma em cada dez sequencias passa no Luhn. Medido: 6 de 15 PDFs reais
  // barrados por um cartao que nao existia.
  //
  // Cartao de verdade vem de um jeito so: dezesseis digitos seguidos, ou grupos
  // de quatro com o MESMO separador.
  const formas = [
    /(?:^|[^0-9])([0-9]{13,16})(?![0-9])/g,
    /(?:^|[^0-9])([0-9]{4} [0-9]{4} [0-9]{4} [0-9]{4})(?![0-9])/g,
    /(?:^|[^0-9])([0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4})(?![0-9])/g,
  ];
  for (const re of formas) {
    let m;
    while ((m = re.exec(texto))) {
      const d = m[1].replace(/[ -]/g, "");
      if (d.length >= 13 && d.length <= 16 && BANDEIRA.test(d) && luhn(d)) return d;
    }
  }
  return null;
}

/**
 * CPF com digito verificador valido.
 *
 * O formato sozinho nao basta. `123.456.789-00` — que estava ate na suite deste
 * projeto — e invalido, e mesmo assim disparava um bloqueio SEM ESCAPE. Todo
 * manual de LGPD e de integracao fiscal traz CPF de exemplo, e exemplo quase
 * nunca tem digito certo, justamente para nao ser o CPF de ninguem.
 *
 * Validar o digito e a diferenca entre "isto parece um CPF" e "isto e o CPF de
 * uma pessoa".
 */
function cpfValido(d) {
  if (d.length !== 11 || /^(.)\1{10}$/.test(d)) return false;
  for (const [ate, pos] of [[9, 10], [10, 11]]) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (pos - i);
    const dv = (soma * 10) % 11 % 10;
    if (dv !== Number(d[ate])) return false;
  }
  return true;
}

/** Um CPF de verdade no texto, e nao so o formato. */
function achaCPF(texto) {
  for (const m of String(texto).matchAll(/([0-9]{3})[.]([0-9]{3})[.]([0-9]{3})-([0-9]{2})/g)) {
    if (cpfValido(m[1] + m[2] + m[3] + m[4])) return m[0];
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
export function achaSegredo(cfg, texto, onde = "comando") {
  if (!texto) return null;

  // Padroes de NOME so valem para NOME.
  //
  // Aplica-los ao conteudo bloqueava, sem escape, exatamente o material que
  // esta feature existe para receber: um manual de integracao que MENCIONA
  // `.env`, um guia que cita `prod.sql`, uma norma que fala de `.pem`. Padrao
  // de caminho casando prosa e erro de categoria — e um bloqueio sem escape
  // que dispara no caso de uso central e um bloqueio que alguem desliga.
  if (onde !== "conteudo") {
    for (const p of cfg.segredoCaminhos || []) {
      try {
        const m = texto.match(new RegExp(p, "i"));
        if (m) return { classe: "caminho proibido", evidencia: p };
      } catch { /* padrao invalido: segue nos outros */ }
    }
  }

  // Formato de credencial: vale em toda parte. Uma chave privada dentro de um
  // PDF continua sendo uma chave privada.
  for (const p of cfg.segredoConteudo || []) {
    try {
      // A evidencia e o PADRAO, nunca o trecho casado: a mensagem do bloqueio
      // vai para o transcript, e um segredo citado no motivo do bloqueio vazou
      // do mesmo jeito.
      if (new RegExp(p, "i").test(texto)) return { classe: "formato de segredo", evidencia: p };
    } catch { /* idem */ }
  }

  // Heuristicas de dado pessoal: CPF/CNPJ pontuado, cartao por Luhn, lista de
  // e-mails.
  //
  // So no COMANDO, e nao no conteudo de arquivo. No comando o texto e curto e
  // escrito pelo agente: um CPF ali e quase certamente um vazamento. Num manual
  // de terceiro e quase certamente um exemplo — todo manual fiscal brasileiro
  // tem CNPJ de exemplo, todo manual corporativo tem tres e-mails de suporte, e
  // qualquer sequencia de 16 digitos passa no Luhn uma vez em dez.
  //
  // O conteudo nao fica sem checagem: quem checa e `externa.mjs enviar`, que
  // RELATA o que encontrou para a pessoa que esta olhando o arquivo. Julgamento
  // fica com quem tem o arquivo na frente, e nao com um regex sem escape.
  if (onde !== "conteudo") {
    // CPF com digito valido. O formato sozinho barrava exemplo de manual.
    if (achaCPF(texto)) return { classe: "CPF (digito verificador valido)", evidencia: "formato + DV" };
    if (achaCartao(texto)) return { classe: "numero de cartao (Luhn + bandeira)", evidencia: "13-16 digitos" };
    const emails = achaListaDeEmails(texto);
    if (emails) return { classe: "lista de pessoas (3+ e-mails distintos)", evidencia: "3+ enderecos distintos" };
  }
  return null;
}

/**
 * As heuristicas que o portao NAO aplica a conteudo de arquivo, para quem
 * estiver olhando o arquivo decidir. Usado por `externa.mjs enviar`.
 */
export function achaHeuristicas(cfg, texto) {
  const achados = [];
  if (achaCPF(texto)) achados.push("CPF com digito verificador valido");
  for (const p of cfg.piiPatterns || []) {
    try { if (new RegExp(p, "i").test(texto)) achados.push("CNPJ ou CPF no formato pontuado"); } catch { /* ignora */ }
  }
  if (achaCartao(texto)) achados.push("sequencia que passa no Luhn com prefixo de bandeira");
  if (achaListaDeEmails(texto)) achados.push("3+ e-mails distintos");
  for (const p of cfg.segredoCaminhos || []) {
    try {
      if (new RegExp(p, "i").test(texto)) { achados.push("menciona caminho sensivel (.env, .pem, dump...)"); break; }
    } catch { /* ignora */ }
  }
  return [...new Set(achados)];
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

  // Marcador de conflito de merge.
  //
  // O indice e versionado e recebe insercao de varias pessoas. Um conflito nao
  // derruba `lerIndice`: as linhas com `<<<<<<<` simplesmente nao casam o
  // formato e sao puladas em silencio — e ai uma fonte some do indice, para de
  // vencer, e continua na base. Guarda que morre calada e o que este projeto
  // existe para impedir, entao o estado quebrado precisa ser dito.
  if (/^(<{7}|>{7}|={7})/m.test(txt)) {
    return { existe: true, quebrado: true, fontes: [], vencidas: [] };
  }

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
    dados = JSON.parse(readFileSync(p, "utf8"));
    // A idade vem do CARIMBO de emissao, e nao do mtime: marcar o token como
    // usado reescreve o arquivo, e o mtime passaria a medir o ultimo uso em vez
    // da emissao — o que esticaria a janela a cada tentativa.
    idadeMs = Date.now() - (Number(dados?.em) || 0);
  } catch { /* token ilegivel */ }

  const vencido = idadeMs > (cfg.tokenWindowMs ?? 300000);
  // Vencido some. Invalido ou de outro alvo FICA: apagar nesses casos punia o
  // usuario por um erro que nao foi dele.
  //
  // O hook roda ANTES do prompt de permissao do Claude Code, e antes de a CLI
  // executar. Apagar o token em toda passagem queimava a autorizacao quando o
  // usuario respondia "nao" ao prompt, quando o turno era interrompido, e —
  // o mais provavel — quando o proprio `notebooklm` falhava, num cliente cuja
  // sessao o proprio projeto descreve como "unica e mutuamente exclusiva".
  // Em todos esses, a pessoa tinha de refazer as quatro portas inteiras,
  // inclusive o curl contra a URL de origem.
  //
  // Nao e afrouxamento: o token continua limitado pela janela de 5 minutos e
  // amarrado ao ARQUIVO que nomeia. Reexecutar o mesmo envio dentro da janela
  // e o mesmo envio, e nao um segundo.
  if (vencido) { try { unlinkSync(p); } catch { /* ja sumiu */ } }

  if (!dados?.alvo) return { ok: false, motivo: "token nao diz o que autoriza" };
  if (vencido) return { ok: false, motivo: "token vencido" };
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
