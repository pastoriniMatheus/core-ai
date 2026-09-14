"""Atualiza docs/manual.html com o estado atual do projeto.

Existe como script para que os numeros do manual nunca sejam digitados a mao:
uma contagem errada no documento que a equipe le vale menos que nenhuma.
"""

import io
import os
import re
import subprocess
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
p = "docs/manual.src.html"
s = io.open(p, encoding="utf-8").read()

# --- numeros medidos, nunca digitados -------------------------------------
saida = subprocess.run(
    [sys.executable.replace("python.exe", "node.exe") if False else "node", "tests/hooks.test.mjs"],
    capture_output=True, text=True,
)
m = re.search(r"(\d+) passaram, (\d+) falharam", saida.stdout)
if not m:
    sys.exit("nao consegui ler o resultado da suite")
passaram, falharam = m.group(1), m.group(2)
if falharam != "0":
    sys.exit(f"a suite tem {falharam} falha(s) — corrija antes de atualizar o manual")

s = s.replace("85/85 unidade", f"{passaram}/{passaram} unidade")
s = s.replace(">85 / 85<", f">{passaram} / {passaram}<")

# --- secao de instalacao ---------------------------------------------------
if 'id="instalar-escopo"' not in s:
    secao = """    <!-- ============================================== INSTALAR -->
    <section id="instalar-escopo">
      <h2><span class="num">COME&Ccedil;AR</span>Instalar: uma decis&atilde;o s&oacute;</h2>
      <p class="lede">Voc&ecirc; n&atilde;o copia nada manualmente. Um script escreve tudo; a &uacute;nica escolha &eacute; o escopo.</p>

      <div class="scroller">
        <table>
          <thead><tr><th></th><th>Por projeto (padr&atilde;o)</th><th>Global</th></tr></thead>
          <tbody>
            <tr><td>Comando</td><td><code>install.mjs &lt;projeto&gt;</code></td><td><code>install.mjs --global</code></td></tr>
            <tr><td>Vale em</td><td>s&oacute; naquele projeto</td><td><strong>todos</strong> os projetos da m&aacute;quina</td></tr>
            <tr><td>Instala</td><td>hooks, skills, comandos, <code>CLAUDE.md</code>, <code>CONTEXT.md</code>, <code>core.json</code>, permiss&otilde;es</td><td>s&oacute; hooks, skills e comandos</td></tr>
            <tr><td>Repete por projeto?</td><td>sim</td><td>n&atilde;o</td></tr>
          </tbody>
        </table>
      </div>

      <div class="callout warn">
        <p><strong>O pre&ccedil;o do global:</strong> as guardas valem mesmo &mdash; inclusive num reposit&oacute;rio de terceiro que voc&ecirc; s&oacute; foi ler. Bloquear <code>npm install</code> em c&oacute;digo que n&atilde;o &eacute; seu incomoda r&aacute;pido.</p>
      </div>

      <p><strong>A combina&ccedil;&atilde;o que funciona:</strong> global uma vez, e depois por projeto naquele onde voc&ecirc; trabalha de verdade. O segundo comando acrescenta o que s&oacute; faz sentido por projeto e n&atilde;o duplica os hooks.</p>

<pre><code><span class="c"># 1. uma vez, para todos os projetos</span>
node scripts/install.mjs --global

<span class="c"># 2. em cada projeto de verdade</span>
node scripts/preflight.mjs ~/meu-projeto   <span class="c"># o que falta instalar</span>
node scripts/install.mjs   ~/meu-projeto
node scripts/doctor.mjs    ~/meu-projeto   <span class="c"># confirma</span>

<span class="c"># 3. dentro do Claude Code, no projeto</span>
/core-setup</code></pre>

      <p>O instalador &eacute; <strong>aditivo</strong>: hooks de outras ferramentas no mesmo evento s&atilde;o preservados, uma skill sua com o mesmo nome n&atilde;o &eacute; sobrescrita, e rodar duas vezes n&atilde;o duplica nada.</p>

      <h3>O que vai para o git e o que fica na m&aacute;quina</h3>
      <p>Os hooks do modo local carregam o caminho absoluto do n&uacute;cleo nesta m&aacute;quina. Versionar isso quebraria o projeto para todo mundo: no clone do colega, o hook aponta para um diret&oacute;rio que n&atilde;o existe &mdash; e falha em sil&ecirc;ncio.</p>

      <div class="scroller">
        <table>
          <thead><tr><th>Arquivo</th><th>Cont&eacute;m</th><th>Git</th></tr></thead>
          <tbody>
            <tr><td><code>.claude/settings.json</code></td><td>permiss&otilde;es, marketplace</td><td>versionar</td></tr>
            <tr><td><code>.claude/settings.local.json</code></td><td>hooks e <code>AGENT_CORE_ROOT</code> desta m&aacute;quina, credenciais</td><td><strong>nunca</strong></td></tr>
            <tr><td><code>.claude/skills/</code> <code>commands/</code></td><td>as 6 skills e os 4 comandos</td><td>versionar</td></tr>
            <tr><td><code>CLAUDE.md</code> <code>CONTEXT.md</code> <code>core.json</code></td><td>roteador, vocabul&aacute;rio, ajustes</td><td>versionar</td></tr>
          </tbody>
        </table>
      </div>

      <p>Os comandos versionados referenciam <code>$AGENT_CORE_ROOT</code> em vez do caminho real; cada m&aacute;quina define o valor no seu arquivo local. Um teste garante que <strong>nenhum arquivo versionado carregue caminho de m&aacute;quina</strong>.</p>

      <h3>Prova em trinta segundos</h3>
      <p>Depois de instalar, pe&ccedil;a ao agente, dentro do projeto:</p>
      <blockquote style="margin:0 0 16px;padding:12px 18px;border-left:3px solid var(--rule-strong);color:var(--ink-2)">Adicione a depend&ecirc;ncia lodash usando npm install.</blockquote>
      <p>Ele tem de ser <strong>bloqueado</strong> com a escada da pregui&ccedil;a. Se instalar direto, algo n&atilde;o ligou &mdash; rode o <code>doctor.mjs</code>.</p>
    </section>

"""
    alvo = '    <!-- ============================================== VALIDACAO -->'
    if alvo not in s:
        alvo = '    <!-- =============================================== VALIDACAO -->'
    s = s.replace(alvo, secao + alvo)
    s = s.replace(
        '      <li><a href="#validacao">Validado em sess&atilde;o real</a></li>',
        '      <li><a href="#instalar-escopo">Instalar</a></li>\n      <li><a href="#validacao">Validado em sess&atilde;o real</a></li>',
    )

io.open(p, "w", encoding="utf-8").write(s)
assert s.count("<section") == s.count("</section>"), "sections desbalanceadas"

# --- versao standalone -----------------------------------------------------
# manual.src.html e um FRAGMENTO: quem publica envolve com doctype, head e o
# meta charset. Aberto direto do disco, sem essa declaracao, todo acento vira
# mojibake. Aqui geramos o arquivo que de fato abre no navegador.
#
# O reset abaixo reproduz o que o publicador injeta, para que o arquivo local e
# o publicado rendam igual.
RESET = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px system-ui, -apple-system, "Segoe UI", sans-serif; background: #fafaf9; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
"""

# O </head><body> entra entre o <style> do documento e o conteudo.
corpo = s.replace('</style>\n\n<div class="shell">', '</style>\n</head>\n<body>\n<div class="shell">', 1)
if "<body>" not in corpo:
    sys.exit("nao achei onde abrir o <body> — o fragmento mudou de forma")

io.open("docs/manual.html", "w", encoding="utf-8").write(RESET + corpo + "\n</body>\n</html>\n")

print(f"manual atualizado: {passaram} testes")
print("  docs/manual.src.html  fragmento (fonte para publicar)")
print("  docs/manual.html      standalone (abre no navegador)")
