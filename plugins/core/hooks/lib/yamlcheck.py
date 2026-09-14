"""Valida um arquivo YAML. Sai 0 se parseia, 1 com a mensagem se nao.

Existe como ARQUIVO, e nao como `python -c "..."`, porque no Windows o
spawn com shell concatena os argumentos sem escape: aspas, ponto-e-virgula
e espacos do codigo inline sao destruidos pelo cmd.exe antes de chegarem
ao Python.
"""

import sys

try:
    import yaml
except ImportError:
    sys.exit(0)  # sem PyYAML nao ha o que verificar: degrada em silencio

try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        yaml.safe_load(fh)
except Exception as err:  # noqa: BLE001 - qualquer falha de parse conta
    sys.stderr.write(str(err) + "\n")
    sys.exit(1)
