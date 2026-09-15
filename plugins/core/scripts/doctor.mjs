#!/usr/bin/env node
// Diagnostico da instalacao do nucleo num projeto.
//   node scripts/doctor.mjs [caminho-do-projeto]
//
// Uma configuracao de agente falha em silencio: o hook nao roda, a skill nao
// carrega, e ninguem percebe porque nada quebra visivelmente — so para de ajudar.
// Este script torna o silencio visivel.

import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { raizDoNucleo } from "./raiz.mjs";

// O mesmo script roda do repositorio e de dentro do plugin, e a profundidade
// muda. Procurar o marcador acerta nos dois; contar ".." acerta num e erra no
// outro, resolvendo em silencio para um caminho que nao existe.
const NUCLEO = raizDoNucleo(import.meta.url);
if (!NUCLEO) {
  console.error("\n  Nao encontrei o nucleo (hooks/hooks.json) a partir deste script.\n");
  process.exit(1);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = process.argv[2] || process.cwd();

let ok = 0, avisos = 0, erros = 0;

const OK = (m, d) => { ok++; console.log(`  [ok]    ${m}${d ? `  ${d}` : ""}`); };
const WARN = (m, d) => { avisos++; console.log(`  [aviso] ${m}${d ? `\n          ${d}` : ""}`); };
const ERR = (m, d) => { erros++; console.log(`  [erro]  ${m}${d ? `\n          ${d}` : ""}`); };

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

console.log(`\nDiagnostico do nucleo\nProjeto: ${PROJECT}\n`);

// ---------------------------------------------------------------- runtime
console.log("Runtime");
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
nodeMajor >= 18
  ? OK("Node", `v${process.versions.node}`)
  : ERR("Node muito antigo", `v${process.versions.node} — os hooks exigem 18+`);

// ------------------------------------------------------------------ nucleo
console.log("\nNucleo");
const hooksJson = join(NUCLEO, "hooks", "hooks.json");
if (existsSync(hooksJson)) {
  const h = readJson(hooksJson);
  h ? OK("hooks.json valido", `${Object.keys(h.hooks || {}).length} eventos registrados`)
    : ERR("hooks.json malformado", hooksJson);
} else {
  ERR("hooks.json ausente", hooksJson);
}

// Enumerados do disco, nunca listados a mao. A lista fixa tinha tres nomes
// enquanto o nucleo ja tinha seis hooks — e os tres de fora incluiam o portao
// de publicacao. Um erro de sintaxe nele era reportado como saudavel, e como
// io.mjs degradava tudo para exit 0, a guarda tambem ficava muda em execucao.
const dirHooks = join(NUCLEO, "hooks");
const hooksNoDisco = (() => {
  try { return readdirSync(dirHooks).filter((f) => f.endsWith(".mjs")); } catch { return []; }
})();

if (!hooksNoDisco.length) ERR("nenhum hook encontrado", dirHooks);
for (const arquivo of hooksNoDisco) {
  const nome = arquivo.replace(/\.mjs$/, "");
  const r = spawnSync(process.execPath, ["--check", join(dirHooks, arquivo)], { encoding: "utf8" });
  r.status === 0 ? OK(`hook ${nome}`) : ERR(`hook ${nome} tem erro de sintaxe`, r.stderr?.split("\n")[0]);
}

// As bibliotecas tambem: um erro de sintaxe em lib/ derruba todo hook que a importa.
const dirLib = join(dirHooks, "lib");
for (const arquivo of (() => { try { return readdirSync(dirLib).filter((f) => f.endsWith(".mjs")); } catch { return []; } })()) {
  const r = spawnSync(process.execPath, ["--check", join(dirLib, arquivo)], { encoding: "utf8" });
  if (r.status !== 0) ERR(`lib/${arquivo} tem erro de sintaxe`, r.stderr?.split("\n")[0]);
}

const mk = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
mk ? OK("marketplace.json valido", `${mk.plugins?.length || 0} plugin(s)`) : ERR("marketplace.json ausente ou malformado");

// ------------------------------------------------------------- no projeto
console.log("\nConfiguracao do projeto");
const settingsPath = join(PROJECT, ".claude", "settings.json");
const settings = existsSync(settingsPath) ? readJson(settingsPath) : null;

// O plugin instalado no escopo do usuario entrega hooks e skills em TODO projeto,
// sem escrever nada no settings.json dele. Sem olhar aqui, o diagnostico acusava
// "nenhum hook ligado" num projeto onde tudo funciona — e um diagnostico que
// mente e pior que nenhum.
const pluginInstalado = (() => {
  try {
    const reg = JSON.parse(
      readFileSync(join(homedir(), ".claude", "plugins", "installed_plugins.json"), "utf8")
    );
    const entradas = reg.plugins?.["core@agent-core"] || [];
    const vale = entradas.find(
      (e) => e.scope === "user" || !e.projectPath || PROJECT.startsWith(e.projectPath)
    );
    return vale ? { escopo: vale.scope, versao: vale.version } : null;
  } catch {
    return null;
  }
})();

// Os hooks do modo local moram no settings.local.json, que fica fora do git —
// versionar caminho absoluto quebraria o projeto na maquina de qualquer outro.
const localPath = join(PROJECT, ".claude", "settings.local.json");
const settingsLocal = existsSync(localPath) ? readJson(localPath) : null;
const hooksEfetivos = { ...(settings?.hooks || {}), ...(settingsLocal?.hooks || {}) };

if (!existsSync(settingsPath)) {
  WARN(".claude/settings.json ausente", "sem ele o plugin nao carrega para a equipe");
} else if (!settings) {
  ERR(".claude/settings.json malformado", settingsPath);
} else {
  OK(".claude/settings.json valido");

  const plugins = Object.keys(settings.enabledPlugins || {});
  plugins.some((p) => p.startsWith("core@"))
    ? OK("plugin core habilitado", plugins.filter((p) => p.startsWith("core@")).join(", "))
    : pluginInstalado
      ? OK("plugin ativo pelo escopo do usuario", "declarar no projeto so e preciso para a equipe receber ao clonar")
      : WARN("plugin core nao habilitado", 'falta "core@agent-core": true em enabledPlugins');

  Object.keys(settings.extraKnownMarketplaces || {}).length
    ? OK("marketplace declarado", Object.keys(settings.extraKnownMarketplaces).join(", "))
    : WARN("nenhum marketplace declarado", "voce esta coberto pelo escopo do usuario, mas a equipe nao recebe o plugin ao clonar");

  const allow = settings.permissions?.allow || [];
  allow.length >= 5
    ? OK("permissions.allow", `${allow.length} regras`)
    : WARN(`permissions.allow com apenas ${allow.length} regra(s)`,
           "cada comando rotineiro vira uma interrupcao; e o ladrao de tempo mais barato de resolver");

  // A falha mais silenciosa de todas: tudo configurado, nenhum hook ligado.
  // Nada quebra — o nucleo simplesmente nao faz nada, e ninguem percebe.
  const viaPlugin = Object.keys(settings.enabledPlugins || {}).some((p) => p.startsWith("core@"));
  const eventos = Object.entries(hooksEfetivos)
    .filter(([, grupos]) =>
      (grupos || []).some((g) => (g.hooks || []).some((h) => (h.command || "").includes("plugins/core/hooks/")))
    )
    .map(([evento]) => evento);

  if (pluginInstalado) {
    // `claude plugin update` compara SÓ a versão declarada. Se o repositório
    // ganhou skills sem que a versão subisse, o comando responde "já está na
    // última" e o time fica com o cache antigo — sem erro visível, porque a
    // mensagem de sucesso é idêntica à de quando não há o que atualizar.
    const doRepo = readJson(join(NUCLEO, ".claude-plugin", "plugin.json"))?.version;
    if (doRepo && doRepo !== pluginInstalado.versao) {
      WARN(`plugin instalado está em v${pluginInstalado.versao}, o repositório em v${doRepo}`,
           "rode: claude plugin marketplace update agent-core && claude plugin update core@agent-core");
    } else {
      OK(`plugin instalado (escopo ${pluginInstalado.escopo})`,
         `v${pluginInstalado.versao} — entrega hooks, skills e comandos sem tocar no settings.json do projeto`);
    }
  } else if (eventos.length >= 4) {
    OK(`hooks do core ligados (${settingsLocal?.hooks ? "settings.local.json" : "settings.json"})`, eventos.join(", "));
    if (settingsLocal?.env?.AGENT_CORE_ROOT) OK("AGENT_CORE_ROOT definido", settingsLocal.env.AGENT_CORE_ROOT);
  } else if (eventos.length) {
    WARN(`apenas ${eventos.length} de 4 eventos com hook do core`, `presentes: ${eventos.join(", ")}`);
  } else if (viaPlugin) {
    WARN("hooks via plugin do marketplace",
         "nao da para confirmar daqui se o plugin carregou. Rode /core-doctor DENTRO do Claude Code no projeto para confirmar.");
  } else {
    ERR("NENHUM hook do core esta ligado",
        "o nucleo nao vai fazer nada. Rode: node scripts/install.mjs \"<projeto>\"");
  }
}

// Hooks sem skills e meio sistema: o CLAUDE.md manda "detalhe na skill X" e a
// skill X nao existe. Aconteceu — o modo local so instalava os hooks.
const skillsNoNucleo = (() => {
  try { return readdirSync(join(NUCLEO, "skills")); } catch { return []; }
})();
const skillsNoProjeto = (() => {
  try { return readdirSync(join(PROJECT, ".claude", "skills")); } catch { return []; }
})();
const faltandoSkills = skillsNoNucleo.filter((s) => !skillsNoProjeto.includes(s));

if (pluginInstalado) {
  OK("skills via plugin", `${skillsNoNucleo.length}, do plugin instalado`);
} else if (!faltandoSkills.length && skillsNoNucleo.length) {
  OK("skills instaladas", `${skillsNoProjeto.length} em .claude/skills/`);
} else if (skillsNoProjeto.length) {
  WARN(`${faltandoSkills.length} skill(s) faltando`, faltandoSkills.join(", ") + " — rode o install de novo");
} else {
  ERR("nenhuma skill instalada",
      "os hooks funcionam, mas o CLAUDE.md aponta para skills que nao existem. Rode: node scripts/install.mjs \"<projeto>\"");
}

const comandosNoProjeto = (() => {
  try { return readdirSync(join(PROJECT, ".claude", "commands")).filter((f) => f.endsWith(".md")); } catch { return []; }
})();
if (pluginInstalado) {
  OK("comandos via plugin");
} else if (comandosNoProjeto.length) {
  OK("comandos instalados", comandosNoProjeto.map((c) => "/" + c.replace(/\.md$/, "")).join(" "));
} else {
  WARN("nenhum comando instalado", "/core-setup, /core-doctor e /baseline nao vao existir");
}

const claudeMd = join(PROJECT, "CLAUDE.md");
if (!existsSync(claudeMd)) {
  WARN("CLAUDE.md ausente", "copie de templates/CLAUDE.template.md");
} else {
  const linhas = readFileSync(claudeMd, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("<!--")).length;
  if (linhas <= 60) OK("CLAUDE.md enxuto", `${linhas} linhas uteis`);
  else WARN(`CLAUDE.md com ${linhas} linhas uteis`,
            "ele entra no prompt em todo turno; procedimento longo pertence a uma skill");
}

existsSync(join(PROJECT, "CONTEXT.md"))
  ? OK("CONTEXT.md presente")
  : WARN("CONTEXT.md ausente", "o vocabulario do dominio e o que mais corta verbosidade repetida");

// ----------------------------------------------------------------- higiene
console.log("\nHigiene do repositorio");
const gi = join(PROJECT, ".gitignore");
if (existsSync(gi)) {
  const conteudo = readFileSync(gi, "utf8");
  conteudo.includes("graphify-out")
    ? OK(".gitignore cobre graphify-out/")
    : WARN("graphify-out/ nao esta no .gitignore",
           "o grafo e grande e muda a cada commit: conflito de merge garantido");
} else {
  WARN(".gitignore ausente");
}

const graph = join(PROJECT, "graphify-out", "graph.json");
if (existsSync(graph)) {
  const r = spawnSync("git", ["rev-list", "--count", `--since=${statSync(graph).mtime.toISOString()}`, "HEAD"],
                      { cwd: PROJECT, encoding: "utf8", timeout: 5000 });
  const atras = parseInt(r.stdout?.trim() || "0", 10);
  atras === 0 ? OK("grafo atualizado")
    : atras < 25 ? WARN(`grafo ${atras} commits atras`)
    : ERR(`grafo ${atras} commits atras`, "rode `graphify . --update` ou `graphify hook install`");
}

// ------------------------------------------------- ferramentas externas
// O nucleo nao instala nenhuma delas e funciona sem todas. Aqui so relatamos
// o que esta presente, para ninguem achar que instalou algo que nao instalou.
console.log("\nFerramentas externas (opcionais — ver docs/FERRAMENTAS.md)");

// Um binario ausente NAO produz ENOENT quando se roda via shell: o shell existe
// e devolve o proprio codigo de erro (1 no bash, 9009 no cmd). Por isso o
// criterio e "saiu 0 E imprimiu algo", nao "nao deu erro de spawn".
const temBin = (bin) => {
  const r = spawnSync(`${bin} --version`, {
    encoding: "utf8", timeout: 5000, shell: true, windowsHide: true,
  });
  return r.status === 0 && Boolean((r.stdout || "").trim());
};

temBin("graphify")
  ? OK("graphify presente")
  : console.log("  [--]    graphify ausente         uv tool install graphifyy");

temBin("notebooklm")
  ? OK("notebooklm presente")
  : console.log("  [--]    notebooklm ausente       uv tool install \"notebooklm-py[browser]\"");

// Plugins sao declarados no settings.json; e de la que se sabe o que a equipe usa.
const declarados = Object.keys(settings?.enabledPlugins || {});
const temPonytail = declarados.some((p) => p.startsWith("ponytail"));
const temPocock = declarados.some((p) => /pocock|matt/i.test(p));
const temSuperpowers = declarados.some((p) => p.startsWith("superpowers"));

temPonytail
  ? OK("ponytail habilitado")
  : console.log("  [--]    ponytail nao habilitado  /plugin install ponytail@ponytail");

if (temPocock && temSuperpowers) {
  ERR("DUAS autoridades de processo habilitadas",
      "mattpocock/skills e superpowers se sobrepoem em ~70%: o agente vai oscilar entre processos incompativeis. Escolha uma e desabilite a outra.");
} else if (temPocock || temSuperpowers) {
  OK("uma autoridade de processo", temPocock ? "mattpocock/skills" : "superpowers");
} else {
  console.log("  [--]    nenhuma autoridade de processo habilitada");
}

// ------------------------------------------------------------------ saida
console.log(`\n${ok} ok, ${avisos} aviso(s), ${erros} erro(s)\n`);
process.exit(erros > 0 ? 1 : 0);
