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

import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { arquivosEscritosPorShell, ehShell } from "./lib/escrita-shell.mjs";
import { fileURLToPath } from "node:url";
import { run, pass, denyTool } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { dirEstado } from "./lib/estado.mjs";
import {
  bate, classifica, tipoDoComando, achaSegredo, caminhosCitados,
  rastreado, conteudoVersionado, dentroDoStaging, lerIndice, consomeAutorizacao,
} from "./lib/externa.mjs";

// Arquivo grande nao e lido inteiro: o portao tem 15s e o objetivo e achar
// assinatura de segredo, que aparece no comeco em praticamente todo formato de
// credencial. Ler 2MB de um PDF de 300 paginas gastaria o orcamento sem
// acrescentar nada.
const TETO_LEITURA = 512 * 1024;

// O caminho do proprio nucleo, resolvido em tempo de execucao.
//
// As mensagens de bloqueio mandavam rodar `$AGENT_CORE_ROOT/scripts/...`. Essa
// variavel vem do settings.local.json, que o Claude Code le ANTES dos hooks — e
// o cache do plugin e versionado por diretorio. Medido nesta maquina: variavel
// apontando para `core/0.5.0` com `0.5.1` instalado, e nenhuma das duas pastas
// contendo o script citado. A mensagem do portao levava a "Cannot find module".
//
// Fora do Claude Code — no terminal do usuario, que e para onde esta mensagem
// manda ir — a variavel nem existe.
//
// O hook sabe onde mora. Entao ele diz o caminho, em vez de delegar.
const NUCLEO = dirname(dirname(fileURLToPath(import.meta.url))).split("\\").join("/");

/**
 * O arquivo e binario?
 *
 * Ler um PDF como utf8 produz lixo, e lixo casa padrao: medido, 7 de 15 PDFs
 * reais eram barrados — 6 deles por um "numero de cartao" que nao existia,
 * porque bytes aleatorios passam no Luhn uma vez em dez. Bloqueio sem escape
 * disparando em PDF e a morte da feature, cujo material-alvo E PDF.
 *
 * Byte zero no primeiro bloco e o teste que o proprio `git` usa. Binario nao e
 * varrido aqui; quem varre e `externa.mjs enviar`, com a pessoa olhando.
 */
function ehBinario(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function conteudoDosArquivos(caminhos, cwd) {
  const partes = [];
  for (const c of caminhos.slice(0, 8)) {
    try {
      const p = c.startsWith(".") || !/^([A-Za-z]:|\/)/.test(c) ? `${cwd}/${c}` : c;
      if (!existsSync(p) || !statSync(p).isFile()) continue;
      // Le so o teto, e nao o arquivo inteiro para cortar depois: um PDF de
      // 300 paginas vinha para a memoria antes do slice. Assinatura de
      // credencial aparece no comeco em praticamente todo formato.
      const fd = openSync(p, "r");
      const buf = Buffer.alloc(TETO_LEITURA);
      const lidos = readSync(fd, buf, 0, TETO_LEITURA, 0);
      closeSync(fd);
      const bloco = buf.subarray(0, lidos);
      if (ehBinario(bloco)) continue;
      partes.push(bloco.toString("utf8"));
    } catch { /* sem permissao: o NOME do arquivo ja foi checado */ }
  }
  return partes.join("\n");
}

/**
 * A chamada escreve no proprio token de autorizacao?
 *
 * Sem esta checagem, o mecanismo inteiro e teatro: o token diz qual arquivo
 * pode subir, mas quem pode CRIAR o token cria a permissao que quiser. Medido —
 * um `Write` de tres linhas em `.claude/core-state/externa-ok` fazia o portao
 * liberar um envio que nunca passou por porta nenhuma.
 *
 * As quatro portas so significam alguma coisa se a assinatura delas nao puder
 * ser falsificada. Vale para os dois caminhos: ferramenta de edicao e redirect
 * de shell.
 */
function escreveNoToken(input) {
  const alvo = /core-state[/\\]externa-ok/i;
  const tool = input.tool_name || "";
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    return alvo.test(input.tool_input?.file_path || "");
  }
  if (ehShell(tool)) {
    const cmd = input.tool_input?.command || "";
    if (arquivosEscritosPorShell(cmd).some((f) => alvo.test(f))) return true;
    // Redirect, `touch`, `cp`, `mv` e afins que a extracao nao cobre: aqui
    // basta o nome aparecer ao lado de algo que escreve.
    return alvo.test(cmd) && /(>|>>|touch|cp |mv |tee|Set-Content|Out-File|Add-Content)/i.test(cmd);
  }
  return false;
}

run(async (input) => {
  const cfg = loadConfig(input.cwd).externa;
  if (!cfg?.enabled) pass();

  // ------------------------------------------- 0a. forjar a autorizacao
  if (escreveNoToken(input)) {
    denyTool(
      `[core] Esse arquivo e a autorizacao de envio da base externa.\n\n` +
        `Escreve-lo a mao e assinar a propria licenca: as quatro portas continuam\n` +
        `existindo e deixam de significar alguma coisa. O token so vale quando\n` +
        `sai de quem CHECOU as portas por comando.\n\n` +
        `Se um envio precisa acontecer, quem executa e o usuario:\n\n` +
        `    node ${NUCLEO}/scripts/externa.mjs enviar <arquivo> --origem <URL>`
    );
  }

  // Fora isso, ferramenta de edicao nao e assunto deste hook.
  if (!ehShell(input.tool_name) && !(input.tool_name || "").startsWith("mcp__")) pass();

  // ------------------------------------------- 0b. o comando do usuario
  // `externa.mjs enviar` e quem emite a autorizacao de envio. Se o agente o
  // rodar, ele assina a propria licenca — e as quatro portas continuam
  // existindo sem significar nada. Mesma correcao que `publish.sempreTracker`
  // ja exigiu: a ferramenta do nucleo nao pode contornar a guarda do nucleo.
  if (bate(cfg.sempreUsuario, input.tool_input?.command || "")) {
    denyTool(
      `[core] \`externa.mjs enviar\` e um comando do usuario, nao seu.\n\n` +
        `Ele e quem EMITE a autorizacao de envio depois de checar as quatro\n` +
        `portas. Rodando por voce, o agente autoriza o proprio envio — e as\n` +
        `portas viram enfeite.\n\n` +
        `O que voce faz e PROPOR: diga a origem, o tamanho, as consultas ja\n` +
        `registradas e a validade sugerida, e pare. Quem executa e ele — no\n` +
        `terminal dele, ou com o prefixo \`!\` nesta sessao.`
    );
  }


  const chamada = classifica(cfg, input.tool_name, input.tool_input);
  if (!chamada) pass(); // nao fala com a base externa: nao e assunto deste hook

  const { via, acoes, texto } = chamada;

  // ------------------------------------------- 0. rota indireta
  // Chegar na base por um interpretador (`python -c "import notebooklm"`) ou
  // por HTTP no servidor local (`curl 127.0.0.1:9420/mcp`) executa a mesma acao
  // sem que o portao consiga ler QUAL acao e. Classificar um corpo JSON
  // arbitrario com confianca nao da; entao a resposta nao e "deixa passar
  // porque nao entendi", e sim "nao passa por aqui".
  //
  // Sem isto, o portao inteiro teria um desvio de uma linha — e um desvio de
  // uma linha e o que este projeto ja construiu, sem querer, seis vezes.
  if (via === "indireta") {
    denyTool(
      `[core] Rota indireta para a base externa: \`${texto.slice(0, 100)}\`\n\n` +
        `O portao so pode autorizar o que consegue ler. Um interpretador chamando\n` +
        `a biblioteca, ou um HTTP direto no servidor local, executam a mesma acao\n` +
        `sem que daqui se enxergue QUAL acao e — inclusive as que nao tem escape:\n` +
        `compartilhar, apagar, e gerar conteudo de modelo dentro da base.\n\n` +
        `Use a CLI, que e o caminho que o portao le:\n\n` +
        `    notebooklm ask "<pergunta>"        consultar\n` +
        `    notebooklm source list             ver o que esta na base\n\n` +
        `Para enviar, o caminho e o humano:

    node ${NUCLEO}/scripts/externa.mjs enviar <arquivo>`
    );
  }

  const { tipo, acao } = tipoDoComando(cfg, acoes);

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
  const caminhos = caminhosCitados(texto, input.cwd);
  const achado =
    achaSegredo(cfg, texto, "comando") ||
    achaSegredo(cfg, conteudoDosArquivos(caminhos, input.cwd), "conteudo");
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

      // Indice ausente com a feature JA preparada: falha FECHADO.
      //
      // `lerIndice` devolve `{existe:false, fontes:[], vencidas:[]}` — que nao e
      // excecao, e retorno normal. Entao `aoFalhar:"bloqueia"` nao alcanca:
      // `vencidas.length` vira 0 para sempre, nenhuma consulta e barrada, e o
      // teto de fontes e pulado. A promessa central ("fonte vencida barra a
      // consulta") deixa de valer sem que nada acuse.
      //
      // Basta alguem reorganizar `docs/` na segunda semana. Por isso: se a
      // pasta de staging existe, a feature foi preparada, e um indice sumido e
      // uma guarda desligada — nao um projeto que nunca usou a base.
      const preparada = existsSync(join(input.cwd, cfg.staging));
      if (preparada && !idx.existe) {
        denyTool(
          `[core] A base externa esta preparada, mas \`${cfg.indice}\` sumiu.\n\n` +
            `Esse arquivo e a UNICA fonte de validade das fontes. Sem ele, nenhuma\n` +
            `fonte vence nunca e o teto de curadoria deixa de existir — a guarda para\n` +
            `de valer sem nada acusar, que e o pior estado possivel.\n\n` +
            `Recrie o indice e registre o que ja esta na base:\n\n` +
            `    node ${NUCLEO}/scripts/externa.mjs preparar\n` +
            `    notebooklm source list\n`
        );
      }
      if (idx.quebrado) {
        denyTool(
          `[core] \`${cfg.indice}\` tem marcador de conflito de merge.\n\n` +
            `Nesse estado as linhas nao sao lidas, e uma fonte que sumiu do indice\n` +
            `continua na base sem nunca vencer. Resolva o conflito antes de consultar.`
        );
      }

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
  // Versionado pelo CAMINHO, ou pelo CONTEUDO. Um `cp docs/CONTEXT.md
  // .claude/externa/` lavava a procedencia: o caminho novo nao esta rastreado,
  // e a porta FORA abria para conteudo que e nosso. O git enderecca conteudo
  // por hash, entao a pergunta certa tem resposta exata.
  const versionados = arquivos.filter(
    (c) => rastreado(c, input.cwd) || conteudoVersionado(c, input.cwd)
  );

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
      `O agente CONSULTA; quem alimenta e humano. Enviar e irreversivel e\n` +
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
      `    node ${NUCLEO}/scripts/externa.mjs enviar <arquivo em ${cfg.staging}>\n\n` +
      `Esse comando roda as portas de novo como comandos e so entao emite a\n` +
      `autorizacao — que vale uma vez, por poucos minutos, e nomeia o arquivo.`
  );
}, { aoFalhar: "bloqueia" });
