// O diretório de estado local do núcleo.
//
// `.claude/core-state/` guarda conteúdo de SESSÃO — o pedido do usuário, o que
// o agente estava fazendo, o token one-shot de publicação. Nada disso pode ir
// para o repositório: a mensagem que pede "corrige o billing, o token é X" vira
// um commit com o token dentro.
//
// O instalador acrescenta a pasta ao `.gitignore`, mas quem instala pelo
// plugin — que é o caminho principal — nunca roda o instalador. Era mais uma
// assimetria do mesmo tipo que já apareceu três vezes neste projeto: um
// caminho coberto, outro aberto.
//
// Por isso o diretório se protege sozinho. Um `.gitignore` com `*` dentro dele
// faz o git ignorar tudo ali, independente do que o projeto tenha configurado —
// e continua valendo no clone de qualquer pessoa.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AVISO = `# Estado local do agent-core: conteudo de sessao, nunca versionado.
# Este arquivo e escrito pelo proprio nucleo — ele garante a protecao mesmo
# quando o .gitignore do projeto nao menciona esta pasta.
*
`;

/** Garante o diretório de estado, já protegido. Devolve o caminho. */
export function dirEstado(cwd) {
  const dir = join(cwd || ".", ".claude", "core-state");
  mkdirSync(dir, { recursive: true });

  const gi = join(dir, ".gitignore");
  if (!existsSync(gi)) writeFileSync(gi, AVISO);

  return dir;
}
