"""Gera docs/manual.html a partir de docs/manual.src.html.

Duas coisas, e só:

1. Atualiza os números medindo a suíte, nunca aceitando-os digitados. Uma
   contagem errada no documento que a equipe lê vale menos que nenhuma.
2. Embrulha o fragmento num HTML completo. O .src é publicado como fragmento
   (o publicador injeta doctype, head e charset); aberto do disco, sem essa
   declaração, todo acento vira mojibake.

Conteúdo novo é escrito à mão no .src. Este script já tentou inserir seção
sozinho, e o resultado foi uma seção duplicada: a checagem de "já inseri" olhava
um id que depois foi renomeado, então ela reaparecia a cada rodada.
"""

import io
import os
import re
import subprocess
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
P = "docs/manual.src.html"
s = io.open(P, encoding="utf-8").read()

# --- números medidos, nunca digitados --------------------------------------
saida = subprocess.run(["node", "tests/hooks.test.mjs"], capture_output=True, text=True)
m = re.search(r"(\d+) passaram, (\d+) falharam", saida.stdout)
if not m:
    sys.exit("não consegui ler o resultado da suíte")
passaram, falharam = m.group(1), m.group(2)
if falharam != "0":
    sys.exit(f"a suíte tem {falharam} falha(s) — corrija antes de atualizar o manual")

antes = s
s = re.sub(r"\d+/\d+ unidade", f"{passaram}/{passaram} unidade", s)
s = re.sub(r">\d+ / \d+<", f">{passaram} / {passaram}<", s)
if s == antes and f"{passaram}/{passaram}" not in s:
    sys.exit("não encontrei onde atualizar o número de testes no manual")

# --- integridade estrutural, antes de gerar ---------------------------------
ids = re.findall(r'id="([^"]+)"', s)
dupes = sorted({i for i in ids if ids.count(i) > 1})
if dupes:
    sys.exit(f"ids duplicados no .src: {', '.join(dupes)}")
quebrados = [h for h in re.findall(r'href="#([^"]+)"', s) if h not in set(ids)]
if quebrados:
    sys.exit(f"links de âncora sem destino: {', '.join(quebrados)}")
if s.count("<section") != s.count("</section>"):
    sys.exit("sections desbalanceadas no .src")

io.open(P, "w", encoding="utf-8").write(s)

# --- versão standalone ------------------------------------------------------
# Reproduz o que o publicador injeta, para que o arquivo local e o publicado
# rendam igual.
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

corpo = s.replace('</style>\n\n<div class="shell">', '</style>\n</head>\n<body>\n<div class="shell">', 1)
if "<body>" not in corpo:
    sys.exit("não achei onde abrir o <body> — o fragmento mudou de forma")

io.open("docs/manual.html", "w", encoding="utf-8").write(RESET + corpo + "\n</body>\n</html>\n")

# --- o README carrega o mesmo número ----------------------------------------
readme = io.open("README.md", encoding="utf-8").read()
novo = re.sub(r"# \d+ casos, segundos", f"# {passaram} casos, segundos", readme)
if novo != readme:
    io.open("README.md", "w", encoding="utf-8").write(novo)
    print(f"  README.md             {passaram} casos")

print(f"  docs/manual.src.html  fonte (fragmento, para publicar)")
print(f"  docs/manual.html      standalone, {passaram} testes, {len(set(ids))} seções")
