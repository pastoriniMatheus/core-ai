// Arquivos que um comando de shell escreve.
//
// Os hooks de edicao olham as ferramentas Edit/Write/MultiEdit. Mas um agente
// tambem escreve arquivo por shell — `cat > x`, `sed -i`, `Set-Content` — e por
// esse caminho a verificacao inteira era pulada: o arquivo nascia sem passar por
// linter nenhum, e o Stop nem o contava como codigo alterado.
//
// Foi encontrado rodando o nucleo numa sessao real, onde o agente resolveu a
// tarefa inteira por PowerShell e nenhum hook viu nada. E o mesmo buraco que o
// portao de publicacao tinha com MCP: um caminho coberto, o outro livre.

// As ferramentas de shell do Claude Code. Bash em toda parte; PowerShell no
// Windows, com o MESMO campo `command`. Tudo que chaveava em `=== "Bash"`
// deixava o PowerShell passar inteiro — achado pela aceitacao em 17/09/2026,
// quando o agente rodou `notebooklm ask "<CPF>"` por PowerShell e nenhum hook
// viu. E o oitavo "um caminho coberto, outro aberto". Um lugar so, para o
// nono nao ser este de novo.
export const SHELLS = ["Bash", "PowerShell"];
export const ehShell = (nome) => SHELLS.includes(nome || "");

// Cada padrao captura o caminho no grupo 1.
const PADROES = [
  // redirecionamento: > arquivo, >> arquivo, 2> arquivo
  /(?:^|[^0-9>])>>?\s*["']?([^\s"'|;&><]+)/g,
  // tee arquivo / tee -a arquivo
  /\btee\s+(?:-a\s+)?["']?([^\s"'|;&><]+)/g,
  // sed -i / sed --in-place
  /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*|--in-place)\b[^|;&]*?["']?([^\s"'|;&><]+)\s*$/gm,
  // PowerShell
  /\bSet-Content\b(?:\s+-Path)?\s+["']?([^\s"'|;]+)/gi,
  /\bOut-File\b(?:\s+-FilePath)?\s+["']?([^\s"'|;]+)/gi,
  /\bAdd-Content\b(?:\s+-Path)?\s+["']?([^\s"'|;]+)/gi,
];

// Destinos que nao sao arquivo de trabalho.
const IGNORAR = /^(\/dev\/null|nul|null|\$?\w+:?|&\d|\d)$/i;

/**
 * Caminhos que este comando provavelmente escreveu.
 *
 * Heuristica de proposito: e melhor verificar um arquivo a mais (custa um
 * linter que passa) do que deixar um codigo quebrado nascer sem verificacao.
 */
export function arquivosEscritosPorShell(comando) {
  if (!comando) return [];
  const achados = new Set();

  for (const padrao of PADROES) {
    padrao.lastIndex = 0;
    let m;
    while ((m = padrao.exec(comando)) !== null) {
      const alvo = (m[1] || "").trim().replace(/^["']|["']$/g, "");
      if (alvo && !IGNORAR.test(alvo)) achados.add(alvo);
    }
  }
  return [...achados];
}
