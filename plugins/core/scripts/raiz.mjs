// Onde o núcleo está, nas duas formas de instalação.
//
// O mesmo script roda de dois lugares:
//
//   repositório   <repo>/scripts/doctor.mjs        → núcleo em <repo>/plugins/core
//   plugin        <plugin>/scripts/doctor.mjs      → núcleo em <plugin>
//
// Calcular por profundidade fixa (`join(__dirname, "..")` mais `plugins/core`)
// acerta num layout e erra no outro — e erra em silêncio, resolvendo para um
// caminho que não existe. Procurar o marcador acerta nos dois.

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * O diretório do núcleo: aquele que contém `hooks/hooks.json`.
 *
 * Sobe a partir do script que chamou, testando os dois arranjos conhecidos em
 * cada nível. Devolve null quando nada é encontrado — quem chama decide se isso
 * é fatal, porque nem todo script precisa do núcleo para funcionar.
 */
export function raizDoNucleo(deUrl) {
  let dir = dirname(fileURLToPath(deUrl));

  for (let i = 0; i < 6; i++) {
    // layout do plugin: o núcleo é o próprio diretório acima de scripts/
    if (existsSync(join(dir, "hooks", "hooks.json"))) return dir;
    // layout do repositório: o núcleo está sob plugins/core/
    if (existsSync(join(dir, "plugins", "core", "hooks", "hooks.json"))) {
      return join(dir, "plugins", "core");
    }
    const acima = dirname(dir);
    if (acima === dir) break;
    dir = acima;
  }
  return null;
}
