"""Convite por e-mail para o painel (11/2026): regras puras, e-mail e link."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from src.core import public_links as pl
from src.services import usuario_convite as svc
from src.services.email.templates.usuario_convite import (
    render_usuario_convite_email,
    usuario_convite_subject,
    usuario_convite_text,
)

PAGES = Path(__file__).resolve().parents[3] / "frontend" / "src" / "pages"
AGORA = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)


def _convite(**kw):
    base = dict(
        usado_em=None, revogado_em=None, recusado_em=None,
        expira_em=AGORA + timedelta(days=3), enviado_em=AGORA - timedelta(minutes=5),
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_situacao_do_convite():
    assert svc.situacao(_convite(), AGORA) == "enviado"
    assert svc.situacao(_convite(expira_em=AGORA - timedelta(seconds=1)), AGORA) == "vencido"
    assert svc.situacao(_convite(recusado_em=AGORA), AGORA) == "recusado"
    assert svc.situacao(_convite(revogado_em=AGORA), AGORA) == "cancelado"
    assert svc.situacao(_convite(usado_em=AGORA), AGORA) == "aceito"


def test_reenvio_espera_um_minuto():
    assert svc.pode_reenviar_agora(_convite(), AGORA)
    assert not svc.pode_reenviar_agora(_convite(enviado_em=AGORA - timedelta(seconds=10)), AGORA)


def test_renovar_token_troca_hash_e_validade():
    c = _convite(token_hash="antigo")
    token = svc.renovar_token(c, AGORA)
    assert c.token_hash == svc.hash_token(token) != "antigo"
    assert c.expira_em == AGORA + timedelta(days=svc.CONVITE_VALIDADE_DIAS) and c.enviado_em == AGORA


def test_link_tem_pagina_no_frontend():
    assert pl.usuario_convite_link("https://girahub.com.br/", "abc") == "https://girahub.com.br/convite-equipe/abc"
    assert (PAGES / "convite-equipe" / "[token].tsx").exists()


def test_email_terra_sem_senha_e_com_escape():
    html = render_usuario_convite_email(
        "Maria", "Casa <Luz>", "Pai João", "operator", "https://x/convite-equipe/t", 7, logo_url=None
    )
    assert "Casa &lt;Luz&gt;" in html and "<Luz>" not in html
    assert "#2E6A4E" in html and "#FCF8F2" in html and "Fraunces" in html
    assert "Aceitar convite" in html and "7 dias" in html
    assert "#AA0000" in render_usuario_convite_email("M", "C", None, "admin", "u", 7, primary_color="#AA0000")
    assert usuario_convite_subject("Casa Luz") == "Casa Luz convidou você para o GiraHub"
    texto = usuario_convite_text("Maria", "Casa Luz", "Pai João", "admin", "https://x", 7)
    assert "Pai João, de Casa Luz," in texto and "administrador" in texto and "https://x" in texto
