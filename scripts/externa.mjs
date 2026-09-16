#!/usr/bin/env node
// A base de conhecimento EXTERNA: preparar, consultar, enviar, servir.
//
//   node scripts/externa.mjs estado                       # diagnostico (nunca falha duro)
//   node scripts/externa.mjs preparar [--modo local|equipe] [--notebook <id>]
//   node scripts/externa.mjs consultei <URL> "<o que eu precisava>"
//   node scripts/externa.mjs enviar <arquivo> --origem <URL> [--dias 180]
//   node scripts/externa.mjs registrar <arquivo> --origem <URL> [--dias 180]
//   node scripts/externa.mjs conferir                     # a base real bate com o indice?
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
// O caminho deste proprio script, para as mensagens nao mandarem rodar
// `$AGENT_CORE_ROOT` — variavel que fica uma versao atras depois de cada
// atualizacao do plugin, e que nem existe no terminal do usuario.
const SCRIPT = fileURLToPath(import.meta.url);
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
  let autenticado = false;
  if (temCli) {
    // --passive: sondagem estritamente de leitura. Sem isso, um diagnostico
    // dispara rotacao de cookie — e um "check" que muda o estado que esta
    // checando e um check que mente na segunda vez.
    const r = roda("notebooklm", ["auth", "check", "--test", "--passive", "--json"], { timeout: 45000 });
    autenticado = r.status === 0;
    auth = autenticado ? `${c.ok}autenticada${c.off}` : `${c.warn}sem sessao valida${c.off}`;
  }
  say(`        autenticacao            ${auth}`);

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

  // O proximo passo, e nao so o estado. Um diagnostico que diz "sem sessao
  // valida" e para ai obriga quem le a ir procurar como resolver — e a maior
  // parte das vezes essa procura termina em depurar container, que e o jeito
  // mais comum de perder a tarde com esta ferramenta.
  if (temCli && !autenticado) {
    say(`\n  ${c.bold}Proximo passo — e ele e seu, nao do agente:${c.off}\n`);
    say(`    ${c.bold}notebooklm login${c.off}        ${c.dim}abre um navegador de verdade${c.off}`);
    say(`    ${c.bold}notebooklm auth check --test${c.off}   ${c.dim}se nao imprimir OK, pare aqui${c.off}\n`);
    say(`  ${c.warn}Use uma conta Google descartavel e dedicada${c.off} ${c.dim}— sem Drive nem Gmail${c.off}`);
    say(`  ${c.dim}corporativo, sem SSO da empresa. O arquivo de autenticacao que isso${c.off}`);
    say(`  ${c.dim}cria e uma credencial de CONTA INTEIRA, duravel, e nao um token de${c.off}`);
    say(`  ${c.dim}escopo limitado que se revoga sozinho.${c.off}`);
  }

  say(`\n  ${c.dim}Cliente recomendado: a CLI, nao o MCP. As 38 ferramentas MCP do${c.off}`);
  say(`  ${c.dim}notebooklm-py custam 12.629 tokens de system prompt em TODA sessao —${c.off}`);
  say(`  ${c.dim}13,6x o plugin inteiro do nucleo — e a CLI custa zero.${c.off}\n`);
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
  // `browser_profile` e o user-data-dir do Chromium que a biblioteca cria:
  // cookies vivos da sessao Google, num diretorio, nao num arquivo.
  const querPor = ["master_token.json", ".notebooklm/", "*cookies*.json",
                   "storage_state.json", "browser_profile/"];
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
  const notebook = flag("notebook", core.externa?.notebook || "");
  core.externa = { ...(core.externa || {}), enabled: true, modo, ...(notebook ? { notebook } : {}) };
  mkdirSync(join(PROJETO, ".claude"), { recursive: true });
  writeFileSync(corePath, JSON.stringify(core, null, 2) + "\n");
  say(`  ${c.ok}configurado${c.off}  .claude/core.json  ${c.dim}externa.modo = ${modo}${notebook ? ", notebook = " + notebook : ""}${c.off}`);
  if (!notebook) {
    say(`  ${c.dim}sem caderneta definida — \`notebooklm list\` mostra os ids, e${c.off}`);
    say(`  ${c.dim}\`preparar --notebook <id>\` grava o escolhido${c.off}`);
  }

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

    node <caminho-do-nucleo>/scripts/externa.mjs consultei <URL> "<o que precisava>"

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
  // Tira as flags E o valor delas. Sem isso a nota do indice ficava com o
  // caminho do `--projeto` colado no fim — ruido permanente num arquivo
  // versionado que existe para ser lido por gente.
  const motivo = (() => {
    const out = [];
    for (let i = 2; i < args.length; i++) {
      if (args[i].startsWith("--")) { if (!args[i].includes("=")) i++; continue; }
      out.push(args[i]);
    }
    return out.join(" ");
  })();
  if (!origem || !/^https?:\/\//i.test(origem)) morre("uso: consultei <URL> \"<o que precisava>\"");
  if (!existsSync(INDICE)) morre(`${cfg.indice} nao existe. Rode: node scripts/externa.mjs preparar`);

  const hoje = new Date().toISOString().slice(0, 10);
  const txt = readFileSync(INDICE, "utf8");
  const marca = "<!-- consultas -->";
  if (!txt.includes(marca)) morre(`${cfg.indice} nao tem o marcador ${marca}`);
  const linha = `- ${hoje} — ${origem} — ${motivo || "(sem nota)"}`;
  // Insere no FIM das consultas, e nao logo depois do marcador.
  //
  // Duas pessoas registrando na mesma semana produziam duas insercoes na MESMA
  // linha de um arquivo versionado — conflito de merge toda vez. E conflito
  // aqui degrada em silencio: `lerIndice` pula o que nao casa o formato, e a
  // fonte some do indice sem sumir da base. Linhas diferentes o git mescla
  // sozinho.
  const linhas = txt.split("\n");
  const i = linhas.findIndex((l) => l.trim() === marca);
  let fim = i;
  for (let k = i + 1; k < linhas.length; k++) {
    if (linhas[k].startsWith("#")) break;
    if (linhas[k].trim().startsWith("- ")) fim = k;
  }
  linhas.splice(fim + 1, 0, linha);
  writeFileSync(INDICE, linhas.join("\n"));

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
  // Dedup: resolver um conflito de merge duplica linhas, e linha duplicada
  // inflaria a porta REPETIDO — justamente a que autoriza o envio.
  const vistas = new Set(
    readFileSync(INDICE, "utf8").split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- ") && l.toLowerCase().includes(alvo))
  );
  return vistas.size;
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
  const achado = ext.achaSegredo(cfg, arquivo, "comando") || ext.achaSegredo(cfg, conteudo, "conteudo");
  porta("LIMPO", !achado, achado ? `${achado.classe} (${achado.evidencia})` : "sem formato de credencial no conteudo");

  // As heuristicas que o PORTAO nao aplica a conteudo de arquivo.
  //
  // CPF/CNPJ pontuado, sequencia que passa no Luhn, tres e-mails: num manual de
  // terceiro isso e quase sempre exemplo — todo manual fiscal brasileiro tem
  // CNPJ de exemplo, e uma em cada dez sequencias de 16 digitos passa no Luhn.
  // Barrar sem escape mataria o caso de uso central.
  //
  // Mas ignorar em silencio seria pior. Entao o julgamento vem para ca, onde ha
  // uma pessoa com o arquivo na frente — que e exatamente quem consegue
  // distinguir "CNPJ de exemplo na pagina 40" de "planilha de clientes".
  const heuristicas = ext.achaHeuristicas(cfg, conteudo);
  if (heuristicas.length) {
    say(`\n  ${c.warn}Olhe antes de mandar${c.off} — encontrei no conteudo:\n`);
    for (const h of heuristicas) say(`    - ${h}`);
    say(`\n  ${c.dim}Num manual de terceiro isso costuma ser exemplo. Se for dado real de${c.off}`);
    say(`  ${c.dim}pessoa ou de cliente, NAO mande: nao ha como desfazer depois.${c.off}`);
  }

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
  say(`  ${c.dim}vale ${Math.round(cfg.tokenWindowMs / 60000)} minutos, so para ESTE arquivo — se a chamada falhar, pode repetir${c.off}\n`);
  say(`  Agora, nesta janela:\n`);
  say(`    ${c.bold}notebooklm source add "${arquivo}"${c.off}\n`);
  say(`  E logo depois, para a fonte existir no indice:\n`);
  say(`    ${c.bold}node "${SCRIPT}" registrar "${arquivo}" --origem ${origem} --dias ${dias}${c.off}\n`);
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

  // No FIM da tabela, pelo mesmo motivo do `consultei`: insercao sempre na
  // mesma linha e conflito de merge garantido em equipe, e conflito aqui
  // degrada a guarda sem ruido nenhum.
  const linhas = readFileSync(INDICE, "utf8").split("\n");
  const cab = linhas.findIndex((l) => l.trim() === "|---|---|---|---|---|");
  if (cab === -1) morre(`${cfg.indice} nao tem a tabela de fontes`);
  let fim = cab;
  for (let k = cab + 1; k < linhas.length && linhas[k].trim().startsWith("|"); k++) fim = k;
  linhas.splice(fim + 1, 0, linha);
  writeFileSync(INDICE, linhas.join("\n"));

  say(`\n  ${c.ok}registrado${c.off}  ${linha}`);
  say(`  ${c.dim}vence em ${vale} — a partir dai a CONSULTA e barrada ate alguem reenviar ou podar${c.off}\n`);
}

// -------------------------------------------------------------- conferir
//
// O indice e a UNICA fonte de validade das fontes, e ele e escrito a mao pelo
// `registrar`. Nada reconciliava os dois: quem enviasse e esquecesse de
// registrar ficava com uma fonte que existe no NotebookLM e nao existe para o
// nucleo — nunca vence, e nao conta para o teto.
//
// A promessa central ("fonte vencida barra a consulta") so vale se o indice
// descrever a base de verdade. Isto verifica.
function conferir() {
  if (!temBin("notebooklm")) morre("a CLI notebooklm nao esta instalada.");
  const idx = ext.lerIndice(PROJETO, cfg);
  if (!idx.existe) morre(`${cfg.indice} nao existe. Rode: node "${SCRIPT}" preparar`);

  say(`\n${c.bold}Base real x indice${c.off}\n`);

  // A CLI exige saber QUAL caderneta. Sem isso ela devolve "No notebook
  // specified" — e a versao anterior culpava a autenticacao por isso, num
  // momento em que a sessao estava perfeita. Diagnostico que mente sobre uma
  // configuracao boa custa mais caro que a ausencia dele.
  // `--json`, e nao a tabela.
  //
  // A saida bonita da CLI e desenhada com caracteres de moldura, e a primeira
  // versao disto os contava como fontes: "na base e fora do indice: ┌───┬───┐".
  // Parsear texto feito para gente e escolher um formato que muda sem aviso —
  // ainda mais numa biblioteca nao-oficial.
  const argv = ["source", "list", "--json"];
  if (cfg.notebook) argv.push("--notebook", cfg.notebook);
  const r = roda("notebooklm", argv, { timeout: 90000 });

  if (r.status !== 0) {
    const erro = (r.stderr || r.stdout || "").trim().split("\n").find((l) => l.trim()) || "";
    say(`  ${c.warn}nao consegui listar as fontes${c.off}`);
    say(`  ${c.dim}${erro.slice(0, 140)}${c.off}\n`);
    // A causa, dita pelo que o erro REALMENTE diz.
    if (/no notebook specified/i.test(erro)) {
      say(`  Falta dizer qual caderneta. Escolha uma:\n`);
      say(`      notebooklm list`);
      say(`\n  e grave o id no projeto:\n`);
      say(`      node "${SCRIPT}" preparar --notebook <id>\n`);
    } else if (/not logged in|authenticat|login/i.test(erro)) {
      say(`  Sem sessao valida. Rode:  notebooklm login\n`);
    } else {
      say(`  ${c.dim}Rode o comando a mao para ver o erro inteiro:${c.off}`);
      say(`      notebooklm source list${cfg.notebook ? ` --notebook ${cfg.notebook}` : ""}\n`);
    }
    process.exit(1);
  }

  // A biblioteca pode cuspir traceback de asyncio no meio da saida sem que a
  // chamada tenha falhado — medido com Python 3.14. Entao o JSON e recortado do
  // que veio, em vez de assumir que a saida inteira e JSON.
  const bruto = r.stdout || "";
  const ini = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  let dados = null;
  try { dados = JSON.parse(bruto.slice(ini, fim + 1)); } catch { /* fica null */ }
  if (!dados?.sources) {
    say(`  ${c.warn}a saida de \`source list --json\` nao veio no formato esperado${c.off}`);
    say(`  ${c.dim}${bruto.trim().split("\n").find((l) => l.trim())?.slice(0, 120) || "(vazia)"}${c.off}\n`);
    process.exit(1);
  }
  const naBase = dados.sources.map((s) => s.title || s.id || "");

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const noIndice = idx.fontes.map((f) => ({ ...f, chave: norm(f.nome) }));

  const invisiveis = naBase.filter((l) => !noIndice.some((f) => f.chave && norm(l).includes(f.chave)));
  const fantasmas = noIndice.filter((f) => !naBase.some((l) => f.chave && norm(l).includes(f.chave)));

  say(`  ${c.dim}na base: ${naBase.length} fonte(s)   no indice: ${noIndice.length} fonte(s)${c.off}\n`);

  if (invisiveis.length) {
    say(`  ${c.warn}Na base e FORA do indice${c.off} ${c.dim}— nunca vence, nao conta para o teto:${c.off}`);
    for (const l of invisiveis.slice(0, 10)) say(`    ${String(l).slice(0, 90)}`);
    say(`\n  ${c.dim}Registre com:  node "${SCRIPT}" registrar <arquivo> --origem <URL>${c.off}\n`);
  }
  if (fantasmas.length) {
    say(`  ${c.warn}No indice e FORA da base${c.off} ${c.dim}— barra consulta a toa quando vencer:${c.off}`);
    for (const f of fantasmas.slice(0, 10)) say(`    ${f.nome}  ${c.dim}(vale ate ${f.vale})${c.off}`);
    say(`\n  ${c.dim}Tire a linha de ${cfg.indice}, ou reenvie a fonte.${c.off}\n`);
  }
  if (!invisiveis.length && !fantasmas.length) {
    say(`  ${c.ok}O indice descreve a base.${c.off}\n`);
  }
  // Divergencia nao e erro de execucao: e trabalho de curadoria. Sair 1 aqui
  // faria o doctor pintar vermelho por algo que so o humano resolve.
  process.exit(0);
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

    // A publicacao ainda e so loopback?
    //
    // O compose e um arquivo no projeto do usuario, e editavel. Trocar
    // "127.0.0.1:9420:9420" por "9420:9420" publica uma sessao Google COMPLETA
    // na rede do escritorio — e a imagem ja sobe com o guard de Host header
    // desligado, porque o bind interno e 0.0.0.0. E o unico erro grave possivel
    // aqui, e ele e silencioso: o container sobe igual.
    const comp = readFileSync(join(DIR_SERVIDOR, "docker-compose.yml"), "utf8");
    const portas = [...comp.matchAll(/^ *- *["']?([^"'\n]*:[0-9]+)["']?[ \t]*$/gm)].map((m) => m[1]);
    const expostas = portas.filter((x) => !/^(127[.]0[.]0[.]1|localhost|\[::1\]):/.test(x));
    if (expostas.length) {
      morre(
        "o docker-compose.yml publica a porta FORA de loopback:\n\n" +
        expostas.map((x) => `      ${x}`).join("\n") + "\n\n" +
        "  Isso poe uma sessao Google INTEIRA na rede do escritorio. O bind de\n" +
        "  DENTRO do container ja e 0.0.0.0 por necessidade — senao o mapeamento\n" +
        "  de porta nao alcanca — e o unico isolamento e o prefixo do lado do host.\n\n" +
        '  Volte para:  - "127.0.0.1:9420:9420"'
      );
    }

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
  // `down` e `ps` tambem precisam das variaveis.
  //
  // O compose INTERPOLA o arquivo antes de qualquer subcomando, e `:?` sem
  // valor aborta — entao `descer` falhava com "required variable is missing" e
  // o container continuava de pe. Medido: um servidor que o usuario acha que
  // derrubou, ainda no ar, segurando a sessao unica da conta Google.
  //
  // Aqui os valores sao so para satisfazer a interpolacao: nenhum deles muda o
  // que `down` faz.
  const ambiente = {
    ...process.env,
    NOTEBOOKLM_MCP_TOKEN: process.env.NOTEBOOKLM_MCP_TOKEN ||
      readJson(join(PROJETO, ".claude", "settings.local.json"))?.env?.NOTEBOOKLM_MCP_TOKEN || "-",
    NOTEBOOKLM_AUTH_DIR: process.env.NOTEBOOKLM_AUTH_DIR ||
      join(process.env.USERPROFILE || process.env.HOME || ".", ".notebooklm"),
  };

  if (sub === "descer") {
    spawnSync("docker", ["compose", "down"],
      { cwd: DIR_SERVIDOR, stdio: "inherit", timeout: 120000, windowsHide: true, env: ambiente });
    return;
  }
  const r = spawnSync("docker", ["compose", "ps"],
    { cwd: DIR_SERVIDOR, encoding: "utf8", timeout: 60000, windowsHide: true, env: ambiente });
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
      # O bearer vem do ambiente de quem sobe o container, e nao escrito aqui:
      # isso o mantem fora do arquivo versionavel e fora do historico do shell.
      #
      # Mas nao o esconde do \`docker inspect\`: variavel de ambiente de container
      # aparece la, e tambem em \`docker compose config\`. A biblioteca nao oferece
      # NOTEBOOKLM_MCP_TOKEN_FILE, entao nao ha como fazer melhor hoje — e dizer
      # o contrario seria pior do que a exposicao, porque alguem confiaria nela.
      #
      # Consequencia pratica: este bearer e por maquina e descartavel. Trate-o
      # como tal, e nunca reaproveite senha de outra coisa.
      NOTEBOOKLM_MCP_TOKEN: \${NOTEBOOKLM_MCP_TOKEN:?defina NOTEBOOKLM_MCP_TOKEN}
    volumes:
      # Sem default: "~" NAO expande em compose, e o bind criaria uma pasta
      # chamada "~" — vazia, e o servidor culparia a autenticacao. Quem sobe
      # pelo script recebe o caminho ja resolvido.
      # Sintaxe LONGA, e nao "origem:destino:rw".
      #
      # A curta divide por ":", e um caminho do Windows comeca com "C:" — o
      # compose lia "C" como origem e o resto como destino, e recusava o arquivo
      # inteiro com "missing a mount target". Medido nesta maquina. A sintaxe
      # longa nao divide nada, entao funciona igual nos dois sistemas.
      - type: bind
        # Valor CITADO, e a mensagem do :? sem dois-pontos.
        #
        # Sem as aspas, um "rode: node ..." dentro do :? faz o YAML ler o ": "
        # como mapeamento e recusar o arquivo inteiro — "mapping values are not
        # allowed in this context", apontando para uma coluna que nao explica
        # nada. Medido duas vezes aqui.
        source: "\${NOTEBOOKLM_AUTH_DIR:?use o comando servidor subir}"
        target: /data/auth
        # rw, e nao ro, de proposito: o master token se re-minta sozinho e
        # precisa reescrever o arquivo. Montado somente-leitura, a sessao morre
        # em ~10min e o sintoma chega como erro generico do Google.
        read_only: false
    # on-failure com teto, e NAO unless-stopped. Com reinicio infinito, um
    # servidor que morre no arranque por falta de sessao aparece como "Up" e
    # fica em laco invisivel — medido aqui: 5 reinicios sem um sinal apontando
    # para a causa. Com teto, ele para morto e visivel, que e o que se quer.
    restart: on-failure:3
    healthcheck:
      # Conexao TCP, e nao HTTP.
      #
      # A versao anterior usava urlopen e NUNCA passaria: com bearer exigido, o
      # servidor responde 401, e urlopen LANCA HTTPError em 401 em vez de
      # retornar (verificado). O healthcheck ficava permanentemente unhealthy
      # num servidor perfeitamente saudavel — e um sinal de saude que mente
      # ensina o time a ignorar o sinal.
      #
      # Aceitar conexao ja prova o que este check precisa provar: o processo
      # subiu e esta escutando. Se a sessao do Google morreu, quem diz isso e
      # o comando de diagnostico da CLI, nao o Docker.
      test: ["CMD", "python", "-c", "import socket,sys; s=socket.create_connection(('127.0.0.1',9420),5); s.close()"]
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
sessao do projeto: 12.629 tokens, 13,6x o plugin inteiro do nucleo, pagos em
todo turno inclusive nos que nunca tocam a base. Por isso o cliente recomendado
e a CLI, e este servidor e **de teste** — ele prova o caminho, mede o custo, e
so vira producao se a tabela de metricas do ROADMAP mostrar demanda.
`;

// -------------------------------------------------------------------------
const COMANDOS = { estado, preparar, consultei, enviar, registrar, conferir, servidor };
const fn = COMANDOS[cmd];
if (!fn) morre(`comando desconhecido: ${cmd}\n  use: ${Object.keys(COMANDOS).join(" | ")}`);
fn();
