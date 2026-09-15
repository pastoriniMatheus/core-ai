#!/usr/bin/env node
// Instala o nucleo num projeto.
//   node scripts/install.mjs /caminho/do/projeto [--force]
//   node scripts/install.mjs /caminho/do/projeto --marketplace --repo ORG/agent-core
//
// Por padrao liga os hooks pelo CAMINHO LOCAL deste repo: funciona na hora, sem
// publicar nada. Com --marketplace, declara o plugin — que e o que propaga para
// a equipe, mas exige o repositorio publicado.
//
// Aditivo por construcao: nunca sobrescreve configuracao existente sem --force,
// e mescla permissions.allow em vez de substituir. Uma ferramenta de produtividade
// que apaga o settings.json de alguem perde a confianca do time na primeira vez.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

// --global instala no diretorio do USUARIO: as guardas passam a valer em todo
// projeto que voce abrir, sem instalar um por um. O preco e que elas valem
// mesmo — inclusive num repo de terceiro que voce so foi ler. Por isso o padrao
// continua sendo por projeto.
const GLOBAL = args.includes("--global");
const PROJECT = GLOBAL ? homedir() : (args.find((a) => !a.startsWith("--")) || process.cwd());
const FORCE = args.includes("--force");
const REPO = (() => {
  const i = args.indexOf("--repo");
  return i === -1 ? "pastoriniMatheus/core-ai" : args[i + 1];
})();

if (!existsSync(PROJECT)) {
  console.error(`Projeto nao encontrado: ${PROJECT}`);
  process.exit(1);
}

const acoes = [];
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

// --------------------------------------------------------- .claude/settings.json
const claudeDir = join(PROJECT, ".claude");
mkdirSync(claudeDir, { recursive: true });

const settingsPath = join(claudeDir, "settings.json");
const template = readJson(join(ROOT, "templates", "settings.template.json"));
const atual = existsSync(settingsPath) ? readJson(settingsPath) || {} : {};

const antes = JSON.stringify(atual);

// Dois modos de ligar os hooks:
//
//   --local (default enquanto o marketplace nao esta publicado)
//     escreve os hooks direto no settings.json, apontando para este repo.
//     Funciona na hora, so nesta maquina — e o modo de testar.
//
//   --marketplace
//     declara o plugin. E o que propaga para a equipe quando alguem clona,
//     mas exige o repo publicado e acessivel.
const MODO_MARKETPLACE = args.includes("--marketplace");

if (MODO_MARKETPLACE) {
  atual.extraKnownMarketplaces = {
    ...(atual.extraKnownMarketplaces || {}),
    "agent-core": { source: { source: "github", repo: REPO } },
  };
  atual.enabledPlugins = { ...(atual.enabledPlugins || {}), "core@agent-core": true };
} else {
  // A definicao dos hooks vive em UM lugar so: o hooks.json do plugin. Aqui
  // apenas traduzimos ${CLAUDE_PLUGIN_ROOT} para o caminho real.
  //
  // Ja duplicamos essa lista aqui uma vez, e o resultado foi previsivel: o
  // matcher ganhou `Bash` no plugin, a copia do instalador ficou para tras, e
  // a correcao existia no codigo sem nunca chegar aos projetos.
  const H = join(ROOT, "plugins", "core", "hooks").replace(/\\/g, "/");
  const doPlugin = readJson(join(ROOT, "plugins", "core", "hooks", "hooks.json"));
  if (!doPlugin?.hooks) {
    console.error("Nao consegui ler plugins/core/hooks/hooks.json — instalacao abortada.");
    process.exit(1);
  }

  const resolver = (grupo) => ({
    ...grupo,
    hooks: (grupo.hooks || []).map((h) => ({
      ...h,
      command: (h.command || "").replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, join(ROOT, "plugins", "core").replace(/\\/g, "/")),
    })),
  });

  // Hooks de terceiros no mesmo evento sao preservados: varios hooks por evento
  // convivem, e apagar o de outra ferramenta seria sabotagem silenciosa.
  const doCore = (g) => (g.hooks || []).some((x) => (x.command || "").includes("/plugins/core/hooks/"));
  const manter = (lista) => (lista || []).filter((g) => !doCore(g));

  const h = atual.hooks || {};
  atual.hooks = { ...h };
  for (const [evento, grupos] of Object.entries(doPlugin.hooks)) {
    atual.hooks[evento] = [...manter(h[evento]), ...grupos.map(resolver)];
  }
}

// Mescla, nunca substitui: o projeto pode ter regras proprias que importam.
const allowAtual = new Set(atual.permissions?.allow || []);
const antesAllow = allowAtual.size;
for (const regra of template.permissions.allow) allowAtual.add(regra);
atual.permissions = { ...(atual.permissions || {}), allow: [...allowAtual] };

// Os hooks do modo local carregam o caminho ABSOLUTO desta maquina. Versionar
// isso quebraria o projeto para todo mundo: na maquina do colega o hook aponta
// para um diretorio que nao existe. Entao eles vao para settings.local.json,
// que o instalador ja poe no .gitignore.
//
// O que e igual para todo mundo — permissoes, marketplace — fica no
// settings.json versionado. O Claude Code mescla os dois.
const hooksLocais = atual.hooks;
// No escopo do usuario os hooks FICAM no settings.json: nao ha repositorio
// para versionar, entao nao ha caminho absoluto vazando para ninguem.
if (!MODO_MARKETPLACE && !GLOBAL) delete atual.hooks;

if (JSON.stringify(atual) !== antes) {
  writeFileSync(settingsPath, JSON.stringify(atual, null, 2) + "\n");
  acoes.push(
    `.claude/settings.json  (+${allowAtual.size - antesAllow} regras de permissao` +
      (MODO_MARKETPLACE ? ", plugin do marketplace" : "") + ") — versionavel"
  );
} else {
  acoes.push(".claude/settings.json ja estava correto");
}

if (!MODO_MARKETPLACE && !GLOBAL) {
  const localPath = join(claudeDir, "settings.local.json");
  const local = existsSync(localPath) ? readJson(localPath) || {} : {};
  local.hooks = hooksLocais;
  // Os comandos versionados usam $AGENT_CORE_ROOT; o valor e por maquina.
  local.env = { ...(local.env || {}), AGENT_CORE_ROOT: ROOT.split("\\").join("/") };
  writeFileSync(localPath, JSON.stringify(local, null, 2) + "\n");
  acoes.push(".claude/settings.local.json  (hooks com caminho desta maquina) — NAO versionado");
}

// ------------------------------------------------- skills e comandos (local)
// O modo marketplace entrega skills junto com o plugin. O modo local nao: ele
// so escreve hooks no settings.json, e as skills ficariam no repo do nucleo sem
// ninguem carregar — o CLAUDE.md mandaria "detalhe na skill X" e a skill X nao
// existiria. Aqui elas sao copiadas para onde o Claude Code de fato procura.
if (!MODO_MARKETPLACE) {
  const marca = "<!-- agent-core -->";
  let copiados = 0;
  let preservados = 0;

  const copiarSkills = (origem, destino) => {
    if (!existsSync(origem)) return;
    mkdirSync(destino, { recursive: true });
    for (const nome of readdirSync(origem)) {
      const skillOrigem = join(origem, nome, "SKILL.md");
      if (!existsSync(skillOrigem)) continue;
      const skillDestino = join(destino, nome, "SKILL.md");

      // Uma skill do projeto com o mesmo nome nao e sobrescrita: ela pode ser
      // conhecimento do time que vale mais do que a nossa versao generica.
      if (existsSync(skillDestino) && !readFileSync(skillDestino, "utf8").includes(marca)) {
        preservados++;
        continue;
      }
      mkdirSync(join(destino, nome), { recursive: true });
      writeFileSync(skillDestino, readFileSync(skillOrigem, "utf8").trimEnd() + `\n\n${marca}\n`);
      copiados++;
    }
  };

  const copiarComandos = (origem, destino) => {
    if (!existsSync(origem)) return;
    mkdirSync(destino, { recursive: true });
    for (const nome of readdirSync(origem).filter((f) => f.endsWith(".md"))) {
      const alvo = join(destino, nome);
      if (existsSync(alvo) && !readFileSync(alvo, "utf8").includes(marca)) {
        preservados++;
        continue;
      }
      // Nada a substituir: os comandos JA referenciam $AGENT_CORE_ROOT na
      // origem. Eles sao versionados e nao podem carregar o caminho desta
      // maquina, ou o `/core-doctor` do colega aponta para um diretorio que
      // nao existe; o valor e por maquina — aqui o install o escreve no
      // settings.local.json, e na instalacao por plugin o session-start o
      // reescreve com a raiz do plugin.
      //
      // O marcador {{CORE_ROOT}} morava aqui e so era resolvido nesta copia.
      // Era uma segunda convencao para o mesmo caminho, e a instalacao por
      // plugin — que nao passa por aqui — recebia o marcador cru.
      const conteudo = readFileSync(join(origem, nome), "utf8");
      writeFileSync(alvo, conteudo.trimEnd() + `\n\n${marca}\n`);
      copiados++;
    }
  };

  copiarSkills(join(ROOT, "plugins", "core", "skills"), join(claudeDir, "skills"));
  copiarComandos(join(ROOT, "plugins", "core", "commands"), join(claudeDir, "commands"));

  acoes.push(
    `.claude/skills + .claude/commands  (${copiados} arquivos` +
      (preservados ? `, ${preservados} do projeto preservados` : "") + ")"
  );
}

// ---------------------------------------------------------------- CLAUDE.md
// No modo global nao ha projeto: escrever CLAUDE.md, CONTEXT.md ou .gitignore
// no home do usuario seria invasivo e sem sentido. So hooks e skills.
const claudeMd = join(PROJECT, "CLAUDE.md");
if (GLOBAL) {
  acoes.push("CLAUDE.md / CONTEXT.md / core.json / .gitignore  — pulados (sao por projeto)");
}
if (!GLOBAL) {
if (!existsSync(claudeMd) || FORCE) {
  copyFileSync(join(ROOT, "templates", "CLAUDE.template.md"), claudeMd);
  acoes.push("CLAUDE.md criado a partir do template  (preencha a secao 'Este projeto')");
} else {
  acoes.push("CLAUDE.md ja existe, preservado  (use --force para sobrescrever)");
}

// -------------------------------------------------------------- core.json
const coreJson = join(claudeDir, "core.json");
if (!existsSync(coreJson) || FORCE) {
  copyFileSync(join(ROOT, "templates", "core.json"), coreJson);
  acoes.push(".claude/core.json criado  (todos os defaults ja valem sem editar nada)");
} else {
  acoes.push(".claude/core.json ja existe, preservado");
}

// -------------------------------------------------------------- .gitignore
const giPath = join(PROJECT, ".gitignore");
const gi = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
const faltando = ["graphify-out/", ".claude/core-state/", ".claude/baseline/", ".claude/settings.local.json"].filter((l) => !gi.includes(l));
if (faltando.length) {
  writeFileSync(
    giPath,
    gi + (gi && !gi.endsWith("\n") ? "\n" : "") +
      "\n# agent-core: artefatos regeneraveis, nunca versionar\n" + faltando.join("\n") + "\n"
  );
  acoes.push(`.gitignore atualizado  (+${faltando.length} entradas)`);
} else {
  acoes.push(".gitignore ja cobre os artefatos");
}

// ---------------------------------------------------------------- CONTEXT.md
const contextMd = join(PROJECT, "CONTEXT.md");
if (!existsSync(contextMd)) {
  writeFileSync(
    contextMd,
    `# Vocabulario do projeto

<!--
  Cada termo aqui substitui uma explicacao inteira nas conversas com o agente.
  Nomear um conceito uma vez evita redescreve-lo em todo turno — e o conceito
  nomeado aparece igual em variaveis, funcoes e arquivos.

  Regra: um termo entra aqui quando foi preciso explica-lo duas vezes.
-->

## Termos

<!-- **Termo** — definicao em uma frase. O que NAO e, quando confundir for facil. -->
`
  );
  acoes.push("CONTEXT.md criado  (vazio: preencha conforme os termos aparecerem)");
} else {
  acoes.push("CONTEXT.md ja existe, preservado");
}
}

// ------------------------------------------------------------------ saida
console.log(`\nNucleo instalado em ${PROJECT}${GLOBAL ? "   (escopo: TODOS os projetos)" : ""}\n`);
for (const a of acoes) console.log(`  - ${a}`);

if (GLOBAL) {
  console.log(`
As guardas agora valem em qualquer projeto que voce abrir nesta maquina.

  1. Confira:
       node ${join(ROOT, "scripts", "doctor.mjs")} "<um projeto qualquer>"

  2. Em CADA projeto onde for trabalhar de verdade, rode tambem:
       node ${join(ROOT, "scripts", "install.mjs")} "<projeto>"

     Isso acrescenta o que so faz sentido por projeto: CLAUDE.md, CONTEXT.md,
     o comando de teste e a branch base em core.json, e as permissoes.

  3. Se alguma guarda atrapalhar num repo de terceiro que voce so foi ler,
     desligue ali mesmo criando .claude/core.json com { "depGuard": { "enabled": false } }.
`);
} else {
  console.log(`
Proximos passos:

  1. Confira o diagnostico:
       node ${join(ROOT, "scripts", "doctor.mjs")} "${PROJECT}"

  2. Congele o ponto de partida ANTES de mudar o fluxo de trabalho:
       node ${join(ROOT, "scripts", "baseline.mjs")} --days 7 --save antes

  3. Preencha a secao "Este projeto" do CLAUDE.md com os comandos reais
     (ou rode /core-setup dentro do Claude Code, que pergunta tudo).

  4. Abra o projeto no Claude Code uma vez e ACEITE o dialogo de confianca.
     Sem isso as regras de permissions.allow sao ignoradas (os hooks rodam
     de qualquer jeito, mas voce continua confirmando comando de rotina).
${MODO_MARKETPLACE ? `
  5. O settings.json DECLARA o plugin, mas declarar nao instala. Cada dev
     roda uma vez, dentro do projeto:

       claude plugin marketplace add https://github.com/${REPO}.git
       claude plugin install core@agent-core

     Depois disso o Claude Code carrega hooks, skills e comandos sozinho.
     Faca commit do .claude/settings.json para que a declaracao chegue a eles.` : `
  5. Setup LOCAL: os hooks vivem em .claude/settings.local.json, fora do git.
     O que e versionavel (permissoes, skills, comandos) vai no settings.json.
     Para distribuir a equipe, reinstale com --marketplace depois de publicar.`}
`);
}
