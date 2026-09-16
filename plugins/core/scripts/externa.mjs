#!/usr/bin/env node
// A base de conhecimento EXTERNA: preparar, consultar, enviar, servir.
//
//   node scripts/externa.mjs estado                       # diagnostico (nunca falha duro)
//   node scripts/externa.mjs preparar [--modo local|equipe]
//   node scripts/externa.mjs consultei <URL> "<o que eu precisava>"
//   node scripts/externa.mjs enviar <arquivo> --origem <URL> [--dias 180]
//   node scripts/externa.mjs registrar <arquivo> --origem <URL> [--dias 180]
//   node scripts/externa.mjs servidor preparar|subir|descer|estado
//
// A razao de este script existir em vez de o agente rodar a CLI direto: as
// QUATRO PORTAS do "compensa mandar" precisam ser COMANDOS, nao julgamento. O
// agente propoe; este script verifica e so entao emite a autorizacao que o
// portao (hooks/pre-externa-guard.mjs) consome.

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { raizDoNucleo } from "./raiz.mjs";

const args = process.argv.slice(2);
const cmd = (args[0] || "estado").toLowerCase();
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const PROJETO = resolve(flag("projeto", process.cwd()));

const c = { ok: "\x1b[32m", warn: "\x1b[33m", erro: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", off: "\x1b[0m" };
const say = (s = "") => console.log(s);
const morre = (msg) => { console.error(`\n  ${c.erro}${msg}${c.off}\n`); process.exit(1); };

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const corePath = join(PROJETO, ".claude", "core.json");

// A configuracao efetiva vem do nucleo, nao de constantes daqui: uma segunda
// fonte de verdade para os mesmos numeros e o jeito mais rapido de o portao e o
// script discordarem sobre o que e permitido.
//
// O caminho ate lib/ passa por `raizDoNucleo` e nao por `../plugins/core/...`:
// este script roda de DOIS lugares — <repo>/scripts/ e <plugin>/scripts/ — e um
// caminho relativo fixo acerta num layout e erra no outro. Erra em silencio,
// resolvendo para uma pasta que nao existe, o que so aparece na instalacao por
// plugin: o caminho principal, e o unico que ninguem testa antes de publicar.
const NUCLEO = raizDoNucleo(import.meta.url);
if (!NUCLEO) { console.error("\n  nao achei o nucleo (hooks/hooks.json) a partir deste script\n"); process.exit(1); }
const libUrl = (n) => pathToFileURL(join(NUCLEO, "hooks", "lib", n)).href;
const { DEFAULTS } = await import(libUrl("config.mjs"));
const ext = await import(libUrl("externa.mjs"));

function cfgExterna() {
  const base = DEFAULTS.externa;
  const proj = readJson(corePath)?.externa;
  return { ...base, ...(proj || {}), portas: { ...base.portas, ...(proj?.portas || {}) } };
}
const cfg = cfgExterna();
const STAGING = join(PROJETO, cfg.staging);
const INDICE = join(PROJETO, cfg.indice);

function roda(bin, argv, opts = {}) {
  return spawnSync(bin, argv, { encoding: "utf8", timeout: 60000, windowsHide: true, cwd: PROJETO, ...opts });
}
function temBin(bin) {
  const q = process.platform === "win32" ? "where" : "command";
  const a = process.platform === "win32" ? [bin] : ["-v", bin];
  const r = spawnSync(q, a, { encoding: "utf8", timeout: 8000, windowsHide: true });
  return r.status === 0 && Boolean((r.stdout || "").trim());
}

// --------------------------------------------------------------- estado
//
// Diagnostico NUNCA falha duro. A base externa esta declaradamente fora do
// caminho critico: um doctor que pinta vermelho por causa dela ensina o time a
// ignorar vermelho, e ai o vermelho que importa tambem passa batido.
function estado() {
  say(`\n${c.bold}Base de conhecimento externa${c.off}`);
  say(`${c.dim}O agente consulta; quem alimenta e humano.${c.off}\n`);

  const temCli = temBin("notebooklm");
  say(`  ${temCli ? c.ok + "[ok]" : c.dim + "[--]"}${c.off}  CLI notebooklm          ${c.dim}${temCli ? versaoCli() : "nao instalada"}${c.off}`);

  let auth = "nao verificada";
  if (temCli) {
    // --passive: sondagem estritamente de leitura. Sem isso, um diagnostico
    // dispara rotacao de cookie — e um "check" que muda o estado que esta
    // checando e um check que mente na segunda vez.
    const r = roda("notebooklm", ["auth", "check", "--test", "--passive", "--json"], { timeout: 45000 });
    auth = r.status === 0 ? `${c.ok}autenticada${c.off}` : `${c.warn}sem sessao valida${c.off}`;
  }
  say(`  ${temCli ? "    " : "    "}  autenticacao            ${auth}`);

  const temStaging = existsSync(STAGING);
  say(`  ${temStaging ? c.ok + "[ok]" : c.dim + "[--]"}${c.off}  ${cfg.staging.padEnd(22)} ${c.dim}${temStaging ? "pasta de staging pronta" : "ausente — rode: preparar"}${c.off}`);

  const idx = ext.lerIndice(PROJETO, cfg);
  if (!idx.existe) {
    say(`  ${c.dim}[--]${c.off}  ${cfg.indice.padEnd(22)} ${c.dim}ausente — rode: preparar${c.off}`);
  } else {
    const v = idx.vencidas.length;
    say(`  ${v ? c.warn + "[!!]" : c.ok + "[ok]"}${c.off}  ${cfg.indice.padEnd(22)} ${c.dim}${idx.fontes.length}/${cfg.tetoFontes} fontes${v ? `, ${v} VENCIDA(S)` : ""}${c.off}`);
    for (const f of idx.vencidas.slice(0, 5)) say(`        ${c.warn}${f.nome}${c.off} ${c.dim}venceu em ${f.vale}${c.off}`);
    if (v) say(`\n  ${c.warn}Fonte vencida BARRA a consulta${c.off} ${c.dim}— reenvie ou tire da base.${c.off}`);
  }

  const temDocker = temBin("docker");
  say(`  ${temDocker ? c.ok + "[ok]" : c.dim + "[--]"}${c.off}  docker                  ${c.dim}${temDocker ? "disponivel (servidor de teste)" : "ausente — modo local nao precisa"}${c.off}`);

  say(`\n  ${c.dim}Cliente recomendado: a CLI, nao o MCP. As 38 ferramentas MCP do${c.off}`);
  say(`  ${c.dim}notebooklm-py custam ~12.600 tokens de system prompt em TODA sessao —${c.off}`);
  say(`  ${c.dim}13x o plugin inteiro do nucleo — e a CLI custa zero.${c.off}\n`);
}

function versaoCli() {
  const r = roda("notebooklm", ["--version"], { timeout: 20000 });
  return ((r.stdout || r.stderr || "").trim().split("\n")[0] || "").slice(0, 40);
}

// -------------------------------------------------------------- preparar
function preparar() {
  const modo = (flag("modo", "local") || "local").toLowerCase();
  if (!["local", "equipe"].includes(modo)) morre("--modo precisa ser local ou equipe");

  mkdirSync(STAGING, { recursive: true });

  // A pasta de staging guarda material de TERCEIRO que ainda nao subiu. Ele
  // nao pertence ao repositorio — versiona-lo seria exatamente a duplicacao que
  // a porta FORA existe para impedir.
  const giStaging = join(STAGING, ".gitignore");
  if (!existsSync(giStaging)) {
    writeFileSync(giStaging,
      "# Material de TERCEIRO, em transito para a base externa.\n" +
      "# Nao versionado de proposito: o que esta no repositorio nao sobe\n" +
      "# (porta FORA), e o que sobe nao pertence ao repositorio.\n" +
      "*\n!.gitignore\n");
    say(`  ${c.ok}criado${c.off}  ${cfg.staging}/  ${c.dim}(protegido por .gitignore proprio)${c.off}`);
  }

  // A credencial do NotebookLM e de CONTA INTEIRA. Estas linhas no .gitignore
  // do repositorio sao defesa em profundidade: o arquivo mora fora da arvore,
  // e mesmo assim nada com esse nome pode ser commitado.
  const gi = join(PROJETO, ".gitignore");
  const atual = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  const querPor = ["master_token.json", ".notebooklm/", "*cookies*.json", "storage_state.json"];
  const faltam = querPor.filter((l) => !atual.split("\n").some((x) => x.trim() === l));
  if (faltam.length) {
    appendFileSync(gi,
      (atual.endsWith("\n") || !atual ? "" : "\n") +
      "\n# Credencial do NotebookLM: conta INTEIRA, nunca versionada.\n" +
      faltam.join("\n") + "\n");
    say(`  ${c.ok}protegido${c.off}  .gitignore  ${c.dim}+${faltam.length} linha(s) de credencial${c.off}`);
  }

  if (!existsSync(INDICE)) {
    mkdirSync(dirname(INDICE), { recursive: true });
    writeFileSync(INDICE, MODELO_INDICE(cfg));
    say(`  ${c.ok}criado${c.off}  ${cfg.indice}  ${c.dim}(VERSIONADO — e o que impede a base de virar oraculo paralelo)${c.off}`);
  }

  const core = readJson(corePath) || {};
  core.externa = { ...(core.externa || {}), enabled: true, modo };
  mkdirSync(join(PROJETO, ".claude"), { recursive: true });
  writeFileSync(corePath, JSON.stringify(core, null, 2) + "\n");
  say(`  ${c.ok}configurado${c.off}  .claude/core.json  ${c.dim}externa.modo = ${modo}${c.off}`);

  if (modo === "equipe") {
    say(`\n  ${c.warn}Modo equipe${c.off}`);
    say(`  ${c.dim}A biblioteca nao foi feita para multi-tenant, e isso tem consequencias${c.off}`);
    say(`  ${c.dim}operacionais que precisam estar escritas antes de alguem se surpreender:${c.off}\n`);
    say(`    - a sessao e UNICA: se alguem abrir notebooklm.google.com logado`);
    say(`      nessa conta, derruba o servidor para todo mundo, e o sintoma nao diz isso`);
    say(`    - a quota e da CONTA, nao do dev: um agente em loop queima a do time`);
    say(`    - a concorrencia de chat e ~3: sem fila, o excedente vira 429`);
    say(`    - nao ha atribuicao: as acoes saem todas como uma identidade so`);
    say(`\n  ${c.dim}Por isso, em equipe: N leitores, 1 curador. Quem envia e o curador,${c.off}`);
    say(`  ${c.dim}da maquina dele. E a conta TEM de ser descartavel — sem Drive nem${c.off}`);
    say(`  ${c.dim}Gmail corporativo, sem SSO da empresa.${c.off}`);
  }

  say(`\n  Proximo passo: ${c.bold}notebooklm login${c.off} ${c.dim}(abre o navegador; e seu, nao do agente)${c.off}\n`);
}

const MODELO_INDICE = (cfg) => `# Base de conhecimento externa

O que existe na base, de quando e por que. **Este arquivo e versionado de
proposito**: sem ele a base vira oraculo paralelo — ninguem sabe o que tem la
dentro, de quando e, nem se ainda vale.

O portao le as datas daqui. Fonte vencida **barra a consulta**, nao apenas
avisa: resposta confiante sobre material que mudou e o erro mais caro que
existe, e aqui nao ha \`git log\` medindo o atraso.

## O que esta na base

| Fonte | Origem | Enviada em | Vale ate | Consultas |
|---|---|---|---|---|

## Material consultado, ainda fora da base

A porta REPETIDO conta daqui. A **primeira** consulta a um material nunca
indexa: le e segue. A partir da segunda, vale propor o envio — porque ai o
reuso deixou de ser previsao e virou registro.

Registre com:

    node $AGENT_CORE_ROOT/scripts/externa.mjs consultei <URL> "<o que precisava>"

<!-- consultas -->

## As quatro portas

Todas verificaveis por comando, nenhuma por opiniao. Falhou uma, nao sobe —
sem nota de corte e sem "mas e importante".

| Porta | O que exige | Como se verifica |
|---|---|---|
| **FORA** | escrito por terceiro, com URL publica | \`git ls-files\` nao acha, e a URL abre sem login |
| **GRANDE** | >= ${Math.round(cfg.portas.bytesMinimos / 1024)} KB | \`wc -c\` |
| **REPETIDO** | >= ${cfg.portas.consultasMinimas} consultas ja registradas | a secao acima |
| **ESTAVEL** | nenhum commit nosso muda o conteudo | decorre de FORA; a validade cuida do resto |

## O que NUNCA sobe

Credencial de qualquer tipo. Dado pessoal (CPF, CNPJ, cartao, lista de
e-mails). Conteudo nao publicado do cliente — codigo, contrato, preco, ata.
Artefato de producao: dump, log, export. E nada gerado por modelo: resumo,
audio e nota viram FONTE, e a consulta seguinte leria o palpite do agente como
se fosse a documentacao do fornecedor.

O portao bloqueia tudo isso sem escape. Se ele errou, o padrao esta em
\`.claude/core.json\` -> \`externa\`.
`;

// ------------------------------------------------------------- consultei
function consultei() {
  const origem = args[1];
  const motivo = args.slice(2).filter((a) => !a.startsWith("--")).join(" ");
  if (!origem || !/^https?:\/\//i.test(origem)) morre("uso: consultei <URL> \"<o que precisava>\"");
  if (!existsSync(INDICE)) morre(`${cfg.indice} nao existe. Rode: node scripts/externa.mjs preparar`);

  const hoje = new Date().toISOString().slice(0, 10);
  const txt = readFileSync(INDICE, "utf8");
  const marca = "<!-- consultas -->";
  if (!txt.includes(marca)) morre(`${cfg.indice} nao tem o marcador ${marca}`);
  const linha = `- ${hoje} — ${origem} — ${motivo || "(sem nota)"}`;
  writeFileSync(INDICE, txt.replace(marca, `${marca}\n${linha}`));

  const quantas = contaConsultas(origem);
  say(`\n  ${c.ok}registrado${c.off}  ${linha}`);
  say(`  ${c.dim}consultas a esta origem: ${quantas}${c.off}`);
  if (quantas >= cfg.portas.consultasMinimas) {
    say(`\n  ${c.bold}A porta REPETIDO abriu${c.off} (${quantas} >= ${cfg.portas.consultasMinimas}).`);
    say(`  ${c.dim}Se as outras tres passarem, vale PROPOR o envio ao usuario — e parar.${c.off}\n`);
  } else {
    say(`  ${c.dim}Faltam ${cfg.portas.consultasMinimas - quantas} para a porta REPETIDO abrir. Por ora: leia e siga.${c.off}\n`);
  }
}

function contaConsultas(origem) {
  if (!existsSync(INDICE)) return 0;
  const alvo = origem.replace(/\/+$/, "").toLowerCase();
  return readFileSync(INDICE, "utf8").split("\n")
    .filter((l) => l.trim().startsWith("- ") && l.toLowerCase().includes(alvo)).length;
}

// ---------------------------------------------------------------- enviar
//
// As quatro portas como comandos. So depois delas a autorizacao e emitida — e
// ela NOMEIA o arquivo, entao nao serve para outro.
function enviar() {
  const arquivo = args[1];
  if (!arquivo || arquivo.startsWith("--")) morre("uso: enviar <arquivo> --origem <URL> [--dias 180]");
  const origem = flag("origem");
  const dias = parseInt(flag("dias", String(cfg.validadeDias)), 10);
  const abs = resolve(PROJETO, arquivo);

  say(`\n${c.bold}As quatro portas${c.off}  ${c.dim}${basename(abs)}${c.off}\n`);
  const falhas = [];
  const porta = (nome, ok, detalhe) => {
    say(`  ${ok ? c.ok + "[ok]" : c.erro + "[XX]"}${c.off}  ${nome.padEnd(10)} ${c.dim}${detalhe}${c.off}`);
    if (!ok) falhas.push(`${nome}: ${detalhe}`);
  };

  if (!existsSync(abs)) morre(`arquivo nao encontrado: ${abs}`);

  // ORIGEM — allowlist vence blocklist
  const noStaging = ext.dentroDoStaging(abs, PROJETO, cfg.staging);
  porta("STAGING", noStaging, noStaging ? `esta em ${cfg.staging}` : `precisa estar em ${cfg.staging}`);

  // FORA
  const versionado = ext.rastreado(arquivo, PROJETO);
  porta("FORA", !versionado && Boolean(origem),
    versionado ? "esta VERSIONADO neste repositorio — o agente ja le de graca"
      : !origem ? "falta --origem <URL publica>" : `nao versionado, origem ${origem}`);

  if (origem && !args.includes("--sem-rede")) {
    const r = spawnSync("curl", ["-s", "-o", process.platform === "win32" ? "NUL" : "/dev/null",
      "-w", "%{http_code}", "-m", "20", "-L", origem], { encoding: "utf8", timeout: 30000, windowsHide: true });
    const st = parseInt((r.stdout || "").trim(), 10);
    porta("PUBLICA", st >= 200 && st < 400,
      Number.isNaN(st) ? "curl nao respondeu (use --sem-rede para pular)" : `a URL responde ${st} sem login`);
  }

  // GRANDE
  const bytes = statSync(abs).size;
  porta("GRANDE", bytes >= cfg.portas.bytesMinimos,
    `${(bytes / 1024).toFixed(0)} KB (minimo ${Math.round(cfg.portas.bytesMinimos / 1024)} KB — menor que isso, o subagente le direto)`);

  // REPETIDO
  const quantas = origem ? contaConsultas(origem) : 0;
  porta("REPETIDO", quantas >= cfg.portas.consultasMinimas,
    `${quantas} consulta(s) registrada(s) (minimo ${cfg.portas.consultasMinimas}) — registre com: consultei <URL> "..."`);

  // TETO
  const idx = ext.lerIndice(PROJETO, cfg);
  porta("TETO", idx.fontes.length < cfg.tetoFontes, `${idx.fontes.length}/${cfg.tetoFontes} fontes na base`);

  // SEGREDO — a mesma checagem do portao, para o erro aparecer aqui e nao la
  let conteudo = "";
  try { conteudo = readFileSync(abs, "utf8").slice(0, 4 * 1024 * 1024); } catch { /* binario */ }
  const achado = ext.achaSegredo(cfg, abs) || ext.achaSegredo(cfg, conteudo);
  porta("LIMPO", !achado, achado ? `${achado.classe} (${achado.evidencia})` : "sem assinatura de segredo nem dado pessoal");

  if (falhas.length) {
    say(`\n  ${c.erro}${falhas.length} porta(s) fechada(s). Nada foi autorizado.${c.off}`);
    say(`  ${c.dim}Falhou uma porta, nao sobe — sem nota de corte e sem "mas e importante".${c.off}\n`);
    process.exit(1);
  }

  const hoje = new Date();
  const vale = new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10);
  const p = ext.emiteAutorizacao(PROJETO, arquivo);

  say(`\n  ${c.ok}As quatro portas passaram.${c.off}`);
  say(`  ${c.dim}autorizacao: ${p}${c.off}`);
  say(`  ${c.dim}vale uma vez so, por ${Math.round(cfg.tokenWindowMs / 60000)} minutos, e NOMEIA este arquivo${c.off}\n`);
  say(`  Agora, nesta janela:\n`);
  say(`    ${c.bold}notebooklm source add "${arquivo}"${c.off}\n`);
  say(`  E logo depois, para a fonte existir no indice:\n`);
  say(`    ${c.bold}node $AGENT_CORE_ROOT/scripts/externa.mjs registrar "${arquivo}" --origem ${origem} --dias ${dias}${c.off}\n`);
}

// ------------------------------------------------------------- registrar
//
// Um envio que nao entra no indice e uma fonte que ninguem sabe que existe, de
// quando e, nem quando vence — e a base volta a ser oraculo paralelo. Por isso
// e comando, e nao uma linha de tabela para copiar a mao: o que depende de
// alguem lembrar de colar, um dia nao e colado.
function registrar() {
  const arquivo = args[1];
  if (!arquivo || arquivo.startsWith("--")) morre("uso: registrar <arquivo> --origem <URL> [--dias 180]");
  const origem = flag("origem");
  if (!origem) morre("--origem <URL> e obrigatoria: fonte sem origem nao da para conferir depois");
  if (!existsSync(INDICE)) morre(`${cfg.indice} nao existe. Rode: node scripts/externa.mjs preparar`);

  const dias = parseInt(flag("dias", String(cfg.validadeDias)), 10);
  const hoje = new Date();
  const vale = new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10);
  const nome = flag("nome", basename(resolve(PROJETO, arquivo)));
  const linha = `| ${nome} | ${origem} | ${hoje.toISOString().slice(0, 10)} | ${vale} | ${contaConsultas(origem)} |`;

  const txt = readFileSync(INDICE, "utf8");
  const cab = "|---|---|---|---|---|";
  const i = txt.indexOf(cab);
  if (i === -1) morre(`${cfg.indice} nao tem a tabela de fontes`);
  const corte = i + cab.length;
  writeFileSync(INDICE, txt.slice(0, corte) + "\n" + linha + txt.slice(corte));

  say(`\n  ${c.ok}registrado${c.off}  ${linha}`);
  say(`  ${c.dim}vence em ${vale} — a partir dai a CONSULTA e barrada ate alguem reenviar ou podar${c.off}\n`);
}

// -------------------------------------------------------------- servidor
//
// O servidor de teste existe para provar o caminho inteiro numa maquina so,
// incluindo a topologia de equipe — sem publicar nada para a rede.
const DIR_SERVIDOR = join(PROJETO, ".claude", "externa-servidor");

function servidor() {
  const sub = (args[1] || "estado").toLowerCase();
  if (sub === "preparar") return servidorPreparar();
  if (!temBin("docker")) morre("docker nao encontrado.");

  if (sub === "subir") {
    if (!existsSync(join(DIR_SERVIDOR, "docker-compose.yml"))) servidorPreparar();

    // A AUTENTICACAO PRIMEIRO, e antes de tocar no Docker.
    //
    // Sem sessao valida o servidor morre no arranque, o compose o reinicia, e o
    // que se ve e um container "Up" que na verdade esta em laco de queda — foi
    // exatamente isso que aconteceu ao testar este arranjo pela primeira vez:
    // 5 reinicios, porta muda, e nenhum sinal apontando para a causa. Depurar
    // container quando o problema e login e o jeito mais comum de perder a
    // tarde, e o unico jeito de evitar e recusar subir.
    if (!temBin("notebooklm")) {
      morre('a CLI notebooklm nao esta instalada no host.\n  uv tool install "notebooklm-py[browser]"');
    }
    const auth = roda("notebooklm", ["auth", "check", "--test", "--passive"], { timeout: 60000 });
    if (auth.status !== 0) {
      morre("sem sessao valida do NotebookLM — o container subiria so para cair em laco.\n\n" +
        "  Autentique no HOST primeiro (abre um navegador de verdade):\n\n" +
        "      notebooklm login\n      notebooklm auth check --test\n\n" +
        "  So depois:  node scripts/externa.mjs servidor subir");
    }

    const dirAuth = join(process.env.USERPROFILE || process.env.HOME || ".", ".notebooklm");
    const token = tokenDoServidor();
    say(`\n  ${c.ok}sessao valida${c.off}  ${c.dim}${dirAuth}${c.off}`);
    say(`  Subindo o servidor de teste...\n`);
    const r = spawnSync("docker", ["compose", "up", "-d", "--build"],
      { cwd: DIR_SERVIDOR, stdio: "inherit", timeout: 900000, windowsHide: true,
        // NOTEBOOKLM_AUTH_DIR resolvido aqui, e nao por default no compose: o
        // `~` nao expande em YAML de compose, e o bind acabaria criando uma
        // pasta chamada "~" ao lado do projeto — vazia, e o servidor culparia
        // a autenticacao.
        env: { ...process.env, NOTEBOOKLM_MCP_TOKEN: token, NOTEBOOKLM_AUTH_DIR: dirAuth } });
    if (r.status !== 0) morre("docker compose falhou. Rode o comando a mao para ver o erro.");
    say(`\n  ${c.ok}no ar${c.off}  http://127.0.0.1:9420  ${c.dim}(so loopback — nada exposto na rede)${c.off}`);
    say(`  ${c.dim}bearer em .claude/settings.local.json (fora do git)${c.off}`);
    say(`\n  ${c.warn}Enquanto ele roda, ninguem pode abrir notebooklm.google.com${c.off}`);
    say(`  ${c.warn}logado nessa conta:${c.off} ${c.dim}a sessao e unica e derruba todos os clientes.${c.off}\n`);
    return;
  }
  if (sub === "descer") {
    spawnSync("docker", ["compose", "down"], { cwd: DIR_SERVIDOR, stdio: "inherit", timeout: 120000, windowsHide: true });
    return;
  }
  const r = spawnSync("docker", ["compose", "ps"], { cwd: DIR_SERVIDOR, encoding: "utf8", timeout: 60000, windowsHide: true });
  say("\n" + (r.stdout || r.stderr || "  (servidor nao preparado)") + "\n");
}

/** Bearer por maquina, guardado onde credencial se guarda: fora do git. */
function tokenDoServidor() {
  const p = join(PROJETO, ".claude", "settings.local.json");
  const j = readJson(p) || {};
  if (j.env?.NOTEBOOKLM_MCP_TOKEN) return j.env.NOTEBOOKLM_MCP_TOKEN;

  const gi = spawnSync("git", ["check-ignore", "-q", ".claude/settings.local.json"],
    { cwd: PROJETO, windowsHide: true });
  if (gi.status !== 0) {
    morre(".claude/settings.local.json nao esta ignorado neste repositorio.\n" +
      "  Acrescente a linha ao .gitignore e rode de novo:\n\n      .claude/settings.local.json");
  }
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  j.env = { ...(j.env || {}), NOTEBOOKLM_MCP_TOKEN: token };
  mkdirSync(join(PROJETO, ".claude"), { recursive: true });
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  say(`  ${c.ok}bearer gerado${c.off}  .claude/settings.local.json  ${c.dim}(fora do git)${c.off}`);
  return token;
}

function servidorPreparar() {
  mkdirSync(DIR_SERVIDOR, { recursive: true });
  writeFileSync(join(DIR_SERVIDOR, "Dockerfile"), DOCKERFILE);
  writeFileSync(join(DIR_SERVIDOR, "docker-compose.yml"), COMPOSE);
  writeFileSync(join(DIR_SERVIDOR, "LEIA.md"), LEIA_SERVIDOR);
  say(`\n  ${c.ok}preparado${c.off}  .claude/externa-servidor/  ${c.dim}Dockerfile, docker-compose.yml, LEIA.md${c.off}`);
  say(`  ${c.dim}Antes de subir: a autenticacao e feita no HOST (notebooklm login),${c.off}`);
  say(`  ${c.dim}e o container so MONTA a credencial — nunca a contem.${c.off}\n`);
}

const DOCKERFILE = `# Servidor de teste da base externa.
#
# A credencial NUNCA entra na imagem: camada de imagem e publicavel, e o token
# sobreviveria ao \`docker rm\`. Ela e montada como volume, em tempo de execucao.
FROM python:3.12-slim

RUN pip install --no-cache-dir "notebooklm-py[mcp,headless]==0.8.2"

# O bind de DENTRO do container e 0.0.0.0 — senao o mapeamento de porta nao
# alcanca. O isolamento vem do lado do host, que publica so em 127.0.0.1.
# Inverter os dois publica uma credencial de conta INTEIRA na rede do escritorio.
#
# Com bind nao-loopback a propria biblioteca exige bearer para subir (falha
# fechado) e desliga o guard de Host header — por isso NOTEBOOKLM_MCP_TOKEN e
# obrigatorio aqui, e nao opcional.
ENV NOTEBOOKLM_HOME=/data/auth \\
    NOTEBOOKLM_MCP_ALLOW_EXTERNAL_BIND=1 \\
    NOTEBOOKLM_MCP_CHAT_CONCURRENCY=3

EXPOSE 9420
CMD ["notebooklm-mcp", "--transport", "http", "--host", "0.0.0.0", "--port", "9420"]
`;

const COMPOSE = `services:
  notebooklm:
    build: .
    container_name: core-externa-teste
    # 127.0.0.1 no lado do host: o servidor NAO aparece na rede. Trocar por
    # "9420:9420" publicaria a sessao Google inteira na LAN.
    ports:
      - "127.0.0.1:9420:9420"
    environment:
      # Sem valor aqui: o bearer vem do ambiente de quem sobe o container.
      # Passar "-e TOKEN=<valor>" literal o deixaria visivel em \`docker inspect\`,
      # em \`ps\` e no historico do shell.
      NOTEBOOKLM_MCP_TOKEN: \${NOTEBOOKLM_MCP_TOKEN:?defina NOTEBOOKLM_MCP_TOKEN}
    volumes:
      # rw, e nao ro, de proposito: o master token se re-minta sozinho e precisa
      # reescrever o arquivo. Montado somente-leitura, a sessao morre em ~10min
      # e o sintoma chega como erro generico do Google.
      # Sem default: "~" NAO expande em compose, e o bind criaria uma pasta
      # chamada "~" — vazia, e o servidor culparia a autenticacao. Quem sobe
      # pelo script recebe o caminho ja resolvido.
      - \${NOTEBOOKLM_AUTH_DIR:?defina NOTEBOOKLM_AUTH_DIR (use: node scripts/externa.mjs servidor subir)}:/data/auth:rw
    # on-failure com teto, e NAO unless-stopped. Com reinicio infinito, um
    # servidor que morre no arranque por falta de sessao aparece como "Up" e
    # fica em laco invisivel — medido aqui: 5 reinicios sem um sinal apontando
    # para a causa. Com teto, ele para morto e visivel, que e o que se quer.
    restart: on-failure:3
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:9420/', timeout=5).status < 500 else 1)"]
      interval: 30s
      timeout: 10s
      retries: 3
`;

const LEIA_SERVIDOR = `# Servidor de teste da base externa

Sobe o NotebookLM como servidor MCP HTTP numa maquina so, para provar o caminho
inteiro — inclusive a topologia de equipe — sem publicar nada na rede.

## A ordem que economiza a tarde

1. **Conta Google descartavel e dedicada.** Sem Drive nem Gmail corporativo,
   sem SSO da empresa. Isto nao e recomendacao: o arquivo de credencial e de
   CONTA INTEIRA.
2. **\`notebooklm login\`** no host. Abre um navegador de verdade; e a unica
   etapa que nao automatiza, e e sua, nao do agente.
3. **\`notebooklm auth check --test\`**. Se isto nao imprimir OK, **pare**: nada
   a jusante funciona, e todo minuto gasto depois e desperdicio. O jeito mais
   comum de perder a tarde e depurar container quando o problema e autenticacao.
4. So entao \`node scripts/externa.mjs servidor subir\`.

## O que este arranjo garante

| | |
|---|---|
| bind interno | \`0.0.0.0\` — senao o mapeamento de porta nao alcanca |
| publicacao | \`127.0.0.1:9420\` — invisivel para a rede |
| bearer | obrigatorio: com bind nao-loopback a biblioteca **recusa subir** sem auth |
| credencial | montada como volume \`rw\`, nunca dentro da imagem |

Inverter o bind interno com o de fora publica uma sessao Google completa na
rede do escritorio. E o unico erro grave possivel aqui, e ele e silencioso.

## Uma pessoa por vez

A sessao do NotebookLM e **unica e mutuamente exclusiva**. Enquanto o servidor
roda, ninguem pode abrir \`notebooklm.google.com\` logado nessa conta: derruba
todos os clientes, e o sintoma nao diz o que aconteceu — vira falha
intermitente, 1 em 5 chamadas, sem padrao.

## E o custo de ligar o MCP

Um servidor MCP conectado poe as 38 ferramentas no system prompt de **toda**
sessao do projeto: ~12.600 tokens, 13x o plugin inteiro do nucleo, pagos em
todo turno inclusive nos que nunca tocam a base. Por isso o cliente recomendado
e a CLI, e este servidor e **de teste** — ele prova o caminho, mede o custo, e
so vira producao se a tabela de metricas do ROADMAP mostrar demanda.
`;

// -------------------------------------------------------------------------
const COMANDOS = { estado, preparar, consultei, enviar, registrar, servidor };
const fn = COMANDOS[cmd];
if (!fn) morre(`comando desconhecido: ${cmd}\n  use: ${Object.keys(COMANDOS).join(" | ")}`);
fn();
