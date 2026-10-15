"""Pentest (informativo "PII em log"): e-mail nunca sai em claro no log."""

import logging

from src.core.logging import log_security_event, mask_emails


def test_mascara_email_em_texto():
    assert mask_emails("falhou para maria.silva+x@exemplo.com.br: timeout") == "falhou para m***@exemplo.com.br: timeout"
    assert mask_emails("sem e-mail aqui") == "sem e-mail aqui"


def test_qualquer_logger_sai_mascarado(caplog):
    with caplog.at_level(logging.WARNING):
        logging.getLogger("src.api.v1.qualquer").warning("Welcome email failed for %s: %s", "ana@casa.org", "erro")
        log_security_event("login", success=False, details={"reason": "user_not_found", "email": "bob@x.io"})
    texto = caplog.text
    assert "ana@casa.org" not in texto and "a***@casa.org" in texto
    assert "bob@x.io" not in texto and "b***@x.io" in texto
