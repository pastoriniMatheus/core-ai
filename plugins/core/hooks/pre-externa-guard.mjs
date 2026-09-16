#!/usr/bin/env node
// CAMADA 0 - PreToolUse(Bash | mcp__*) - o portao da base externa
//
// Mandar conteudo para uma base de conhecimento externa e um ato irreversivel
// sob a conta de alguem: o que sobe para um servidor do Google nao volta, e o
// dono da credencial responde por ele. A regra que este portao transforma em
// parada obrigatoria e uma so:
//
//   O AGENTE CONSULTA. QUEM ALIMENTA E HUMANO.
//
// O pedido original era outro — "ensinar o agente a mandar so o que compensa".
// Mas "compensa" e julgamento probabilistico, e a tese deste projeto e que
// julgamento nao vira garantia por estar escrito no prompt. Tirar o verbo do
// agente e mais determinista do que ensina-lo a julgar: a forma mais forte de
// um hook e a ausencia da ferramenta.
//
// COBRE OS DOIS CAMINHOS. O cliente recomendado e a CLI (`notebooklm ask`),
// porque as 38 ferramentas MCP do notebooklm-py custam 12.629 tokens de system
// prompt em TODA sessao — 13,6x o plugin inteiro do nucleo. Mas quem ligar o
// MCP assim mesmo continua passando por aqui: ter um caminho coberto e outro
// aberto foi o erro recorrente deste projeto seis vezes.

import { existsSync, readFileSync, statSync } from "node:fs";
import { run, pass, denyTool } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { dirEstado } from "./lib/estado.mjs";
import {
  classifica, tipoDaAcao, achaSegredo, caminhosCitados,
  rastreado, dentroDoStaging, lerIndice, consomeAutorizacao,
} from "./lib/externa.mjs";

// Arquivo grande nao e lido inteiro: o portao tem 15s e o objetivo e achar
// assinatura de segredo, que aparece no comeco em praticamente todo formato de
// credencial. Ler 2MB de um PDF de 300 paginas gastaria o orcamento sem
// acrescentar nada.
const TETO_LEITURA = 2 * 1024 * 1024;

function conteudoDosArquivos(caminhos, cwd) {
  const partes = [];
  for (const c of caminhos.slice(0, 8)) {
    try {
      const p = c.startsWith(".") || !/^([A-Za-z]:|\/)/.test(c) ? `${cwd}/${c}` : c;
      if (!existsSync(p) || !statSync(p).isFile()) continue;
      partes.push(readFileSync(p, { encoding: "utf8" }).slice(0, TETO_LEITURA));
    } catch { /* binario ou sem permissao: o nome do arquivo ja foi checado */ }
  }
  return partes.join("\n");
}

run(async (input) => {
  const cfg = loadConfig(input.cwd).externa;
  if (!cfg?.enabled) pass();

  const chamada = classifica(cfg, input.tool_name, input.tool_input);
  if (!chamada) pass(); // nao fala com a base externa: nao e assunto deste hook

  const { via, acao, texto } = chamada;
  const tipo = tipoDaAcao(cfg, acao);

  // ------------------------------------------- 1. proibido, sem escape
  // Compartilhar torna publico material que pode ser interno. Apagar destroi
  // o que alguem reuniu a mao. Gerar resumo/audio/nota poe conteudo de MODELO
  // dentro da base, e a consulta seguinte le o palpite do agente como se fosse
  // a documentacao do fornecedor — o loop de auto-contaminacao.
  if (tipo === "proibida") {
    denyTool(
      `[core] Acao bloqueada na base externa: \`${acao || texto.slice(0, 60)}\`\n\n` +
        `Este bloqueio nao tem escape — nem com a sua autorizacao.\n\n` +
        `  compartilhar  torna publico um notebook que pode ter material interno\n` +
        `  apagar        destroi conhecimento que alguem reuniu a mao\n` +
        `  gerar         poe texto de MODELO dentro da base; a proxima consulta\n` +
        `                le o palpite do agente como se fosse a doc do fornecedor\n\n` +
        `Se isso precisa mesmo acontecer, acontece na interface do NotebookLM,\n` +
        `por uma pessoa que esta vendo o que esta fazendo.`
    );
  }

  // ------------------------------------------- 2. segredo, sem escape
  // Vale para TODA acao, inclusive consulta: colar uma funcao do cliente dentro
  // da pergunta e a fuga mais provavel, e nenhuma instrucao em prompt a pega.
  // A checagem olha o comando E o conteudo dos arquivos citados nele.
  const caminhos = caminhosCitados(texto);
  const achado =
    achaSegredo(cfg, texto) || achaSegredo(cfg, conteudoDosArquivos(caminhos, input.cwd));
  if (achado) {
    denyTool(
      `[core] Isto nao sai da maquina: ${achado.classe}.\n\n` +
        `  detectado por: ${achado.evidencia}\n\n` +
        `Bloqueio sem escape. A escada de dependencia as vezes termina em "sim";\n` +
        `vazar credencial ou dado pessoal nunca termina bem — e o que sobe para um\n` +
        `servidor do Google, sob a conta de alguem, nao tem botao de desfazer.\n\n` +
        `Se o material e legitimo, tire o trecho sensivel e ponha a versao limpa\n` +
        `em \`${cfg.staging}\`. Se o alarme esta errado, o padrao que disparou esta\n` +
        `em \`.claude/core.json\` -> externa (ver docs/CONFIGURACAO.md).`
    );
  }

  // ------------------------------------------- 3. consulta: valida o frescor
  if (tipo === "consulta") {
    // So a familia `ask` e barrada por fonte vencida. Listar e descrever
    // continuam livres — sao justamente o que o agente precisa para diagnosticar
    // e consertar, e uma guarda que impede o conserto e uma guarda que alguem
    // desliga.
    const perguntando = /^(ask|suggest-|chat_ask|chat_start)/i.test(acao);
    if (perguntando) {
      const idx = lerIndice(input.cwd, cfg);
      if (idx.vencidas.length) {
        const lista = idx.vencidas.slice(0, 6).map((f) => `    - ${f.nome}  (venceu em ${f.vale})`).join("\n");
        denyTool(
          `[core] A base externa tem ${idx.vencidas.length} fonte(s) vencida(s):\n\n${lista}\n\n` +
            `Consultar agora produz o pior erro que existe: resposta confiante sobre\n` +
            `material que mudou. E o mapa velho do Graphify — pior, porque aqui nao ha\n` +
            `\`git log\` medindo o atraso; so a data que alguem escreveu no indice.\n\n` +
            `Reenvie a fonte atualizada ou tire-a da base, e atualize\n` +
            `\`${cfg.indice}\`. Depois a consulta volta a passar.`
        );
      }
    }
    pass();
  }

  // ------------------------------------------- 4. envio
  // Tudo o que nao e consulta nem proibido cai aqui, inclusive acao que este
  // nucleo nao conhece: versao nova da biblioteca traz comando novo, e o
  // default seguro e pedir autorizacao, nunca liberar.

  // 4a. procedencia — allowlist de ORIGEM, e ela vence a blocklist.
  // Uma lista de arquivos proibidos sempre tem um furo que ninguem pensou; uma
  // pasta unica de onde as coisas podem sair nao tem.
  const arquivos = caminhos.filter((c) => !/^https?:\/\//i.test(c));
  const foraDoStaging = arquivos.filter((c) => !dentroDoStaging(c, input.cwd, cfg.staging));
  const versionados = foraDoStaging.filter((c) => rastreado(c, input.cwd));

  if (versionados.length) {
    denyTool(
      `[core] Este arquivo esta VERSIONADO neste repositorio:\n\n` +
        versionados.slice(0, 5).map((f) => `    - ${f}`).join("\n") + "\n\n" +
        `O repositorio ja e a fonte de verdade, e o agente le dele de graca e sem\n` +
        `rede. Duplicar na base externa cria uma segunda autoridade que desatualiza\n` +
        `no primeiro commit — e a partir dai as duas discordam sem ninguem notar.\n\n` +
        `Bloqueio sem escape: procedencia e veto.`
    );
  }
  if (foraDoStaging.length) {
    denyTool(
      `[core] So sobe o que esta em \`${cfg.staging}\`:\n\n` +
        foraDoStaging.slice(0, 5).map((f) => `    - ${f}`).join("\n") + "\n\n" +
        `A pasta de staging existe para a pergunta "posso mandar isso?" virar\n` +
        `"isso esta na pasta?" — comando, e nao julgamento.\n\n` +
        `Se o material e externo e legitimo, copie-o para la primeiro.`
    );
  }

  // 4b. teto de fontes — base cheia forca curadoria em vez de acumulo
  const idx = lerIndice(input.cwd, cfg);
  if (idx.existe && idx.fontes.length >= (cfg.tetoFontes ?? 50)) {
    denyTool(
      `[core] A base externa esta no teto: ${idx.fontes.length}/${cfg.tetoFontes} fontes.\n\n` +
        `Uma base que so cresce e uma base que ninguem poda, e o custo de podar\n` +
        `cresce junto. Tire uma fonte que ninguem consulta ha dois ciclos antes de\n` +
        `acrescentar outra — \`${cfg.indice}\` diz quais sao.`
    );
  }

  // 4c. autorizacao que NOMEIA o que autoriza
  const aut = consomeAutorizacao(input.cwd, cfg, texto);
  if (aut.ok) pass();

  const p = cfg.portas || {};
  try { dirEstado(input.cwd); } catch { /* sem permissao: o comando abaixo avisa */ }

  denyTool(
    `[core] Portao da base externa: \`${texto.slice(0, 120)}\`\n\n` +
      `  motivo: ${aut.motivo}\n\n` +
      `O agente CONSULTA a base; quem alimenta e humano. Enviar e irreversivel e\n` +
      `sai sob a conta de alguem — falso positivo custa um prompt, falso negativo\n` +
      `e permanente.\n\n` +
      `Antes de propor um envio, as QUATRO portas — todas verificaveis por comando,\n` +
      `nenhuma por opiniao:\n\n` +
      `  FORA      escrito por terceiro, com URL publica citavel, e que\n` +
      `            \`git ls-files\` nao encontre em nenhum repositorio nosso\n` +
      `  GRANDE    >= ${Math.round((p.bytesMinimos ?? 200000) / 1024)} KB. Menor que isso, o subagente le direto —\n` +
      `            mais barato que indexar e manter\n` +
      `  REPETIDO  >= ${p.consultasMinimas ?? 2} consultas ao mesmo material JA registradas em\n` +
      `            \`${cfg.indice}\`. A primeira vez nunca indexa: le e segue\n` +
      `  ESTAVEL   nenhum commit nosso pode deixar o conteudo errado\n\n` +
      `Falhou uma porta, nao sobe — sem nota de corte e sem "mas e importante".\n\n` +
      `Se as quatro passam, PROPONHA ao usuario (origem, tamanho, as duas consultas\n` +
      `que ja aconteceram, validade sugerida) e PARE. Quem executa e ele:\n\n` +
      `    node $AGENT_CORE_ROOT/scripts/externa.mjs enviar <arquivo em ${cfg.staging}>\n\n` +
      `Esse comando roda as portas de novo como comandos e so entao emite a\n` +
      `autorizacao — que vale uma vez, por poucos minutos, e nomeia o arquivo.`
  );
}, { aoFalhar: "bloqueia" });
