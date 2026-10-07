"""Versões vigentes dos documentos legais aceitos no cadastro.

Espelho de ``LEGAL_VERSIONS`` em ``frontend/src/constants/legal.ts`` (a versão mostrada no topo
de /termos e /privacidade). ``tests/unit/test_legal_acceptance.py`` lê o arquivo do frontend e
falha se as duas divergirem — ao subir a versão de um documento, suba nos dois lugares.
"""

LEGAL_VERSIONS: dict[str, str] = {
    "termos": "2.1",
    "privacidade": "2.1",
}

# Documentos que o cadastro exige aceitar (o checkbox "Li e aceito os Termos de Uso e a
# Política de Privacidade"). Cookies têm consentimento próprio, no navegador.
DOCUMENTOS_DO_CADASTRO: tuple[str, ...] = ("termos", "privacidade")
