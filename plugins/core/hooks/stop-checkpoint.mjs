#!/usr/bin/env node
// CAMADA 0 - Stop - grava onde a sessão parou
//
// Não bloqueia nada: é registro, não guarda. Roda depois do stop-verify e
// escreve `.claude/core-state/checkpoint.json` com o suficiente para a próxima
// sessão retomar — card em foco, branch, arquivos tocados, se houve prova, e o
// que o agente estava dizendo quando parou.
//
// Depender de alguém lembrar de anotar onde parou é a mesma aposta que este
// núcleo recusa em todo o resto: funciona quase sempre, e "quase" é onde o
// trabalho se perde.
//
// O checkpoint é LOCAL por padrão. Comentar no card é opt-in: um comentário
// automático por sessão vira ruído no tracker do time, e ruído faz ninguém ler
// o que importa.

import { writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run, pass } from "./lib/io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { montar, emTexto } from "./lib/checkpoint.mjs";
import { dirEstado, rastreadoPeloGit } from "./lib/estado.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

run(async (input) => {
  const cfg = loadConfig(input.cwd);
  if (!cfg.checkpoint?.enabled) pass();

  const c = montar({
    transcriptPath: input.transcript_path,
    cwd: input.cwd,
    cfg: { ...cfg.stopVerify, cardPattern: cfg.checkpoint.cardPattern },
  });
  if (!c) pass(); // sessão sem edição de código: não há o que retomar

  // dirEstado ja cria a pasta protegida: o checkpoint guarda o pedido do
  // usuario, que pode conter segredo, e nao pode depender do .gitignore do
  // projeto estar certo.
  const dir = dirEstado(input.cwd);
  const md = join(dir, "checkpoint.md");

  // Regra de ignore NAO desrastreia nada. Num repositorio que commitou o
  // checkpoint numa versao anterior, escrever o conteudo novo acrescentaria
  // mais segredo ao que ja vazou — entao aqui ele nao e escrito, e o arquivo
  // passa a dizer o que precisa ser feito.
  if (rastreadoPeloGit(".claude/core-state/checkpoint.md", input.cwd)) {
    writeFileSync(md, [
      "CHECKPOINT DESLIGADO — este arquivo esta versionado no git.",
      "",
      "Ele guarda o pedido do usuario, que pode conter credencial. Enquanto",
      "estiver rastreado, o nucleo nao escreve nada aqui: seria acrescentar",
      "segredo a um arquivo que vai para o repositorio.",
      "",
      "Para religar, desrastreie a pasta (o conteudo local continua no disco):",
      "",
      "    git rm -r --cached .claude/core-state",
      '    git commit -m "remove estado local do versionamento"',
      "",
      "E confira se algum commit antigo ja carrega credencial: o historico",
      "guarda o que foi commitado mesmo depois de o arquivo sair.",
    ].join("\n") + "\n");
    pass();
  }

  writeFileSync(join(dir, "checkpoint.json"), JSON.stringify(c, null, 2) + "\n");
  writeFileSync(md, emTexto(c) + "\n");

  // ------------------------------------------------- comentário no card
  // Só com opt-in explícito, e só quando ficou trabalho em aberto: registrar no
  // tracker que uma tarefa terminou e foi entregue é redundante com a própria
  // entrega.
  // O checkpoint E regravado na reentrada, de proposito: o stop-verify bloqueia,
  // o agente roda o teste, e o Stop volta. Congelar no primeiro retrato deixava
  // o checkpoint dizendo SEM PROVA depois de a prova existir — e mentindo
  // justamente nas sessoes em que retomar importa mais.
  //
  // O que a reentrada evita e a chamada de rede: um comentario por tentativa de
  // encerrar polui o card.
  const deveComentar =
    !input.stop_hook_active &&
    cfg.checkpoint.comentarNoCard && c.card && (!c.testouDepois || c.naoCommitado > 0);

  if (deveComentar) {
    const script = join(AQUI, "..", "..", "..", "scripts", "tracker.mjs");
    if (existsSync(script)) {
      const corpo =
        `**Checkpoint automático** — trabalho em andamento, não entregue.\n\n` +
        emTexto(c) +
        `\n\nEste comentário é gerado ao fim da sessão para que a próxima retome ` +
        `daqui. Não substitui o comentário de entrega.`;
      // Falha aqui não pode derrubar o encerramento: o checkpoint local já
      // cumpriu o essencial, e o tracker pode estar fora do ar.
      spawnSync(process.execPath, [script, "--projeto", input.cwd || ".", "comment", c.card, "-"], {
        input: corpo,
        encoding: "utf8",
        timeout: 30000,
        windowsHide: true,
      });
    }
  }
});
