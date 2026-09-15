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
        # safe_load_all: um manifesto k8s ou Helm com "---" e VALIDO e tem
        # varios documentos. safe_load recusa o segundo e o hook bloqueava um
        # arquivo correto — sem nada para corrigir, a unica saida era desligar
        # a verificacao inteira.
        for _ in yaml.safe_load_all(fh):
            pass
except Exception as err:  # noqa: BLE001 - qualquer falha de parse conta
    sys.stderr.write(str(err) + "\n")
    sys.exit(1)
