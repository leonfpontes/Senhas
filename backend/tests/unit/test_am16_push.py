"""AM-16 — Notificação no celular (Web Push com VAPID): regras puras, textos e ligações (sem banco).

Com Postgres real (ligar/desligar só o meu aparelho, isolamento, impersonação, desligado sem
VAPID, agendador mandando push por preferência, 410 apagando a inscrição, uma vez só) em
tests/integration_pg/test_am16_push.py.
"""
import base64
import importlib.util
import json
import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from src.core.config import settings
from src.core.tz import APP_TZ
from src.models import medium_lembretes as modelos
from src.services import medium_push, web_push
from src.api.v1.medium.push import endpoint_aceito

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
TERMOS_RELIGIOSOS = ("gira", "faxina", "cambone", "orixá", "caboclo", "amaci", "exu", "umbanda", "candomblé")


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _par_de_chaves() -> tuple[str, str]:
    """Como o `npx web-push generate-vapid-keys`: pública (65 bytes) e privada (32 bytes) em base64url."""
    chave = ec.generate_private_key(ec.SECP256R1())
    privada = chave.private_numbers().private_value.to_bytes(32, "big")
    publica = chave.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(publica), _b64(privada)


@pytest.fixture
def vapid(monkeypatch):
    publica, privada = _par_de_chaves()
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", publica)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", privada)
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:contato@girahub.com.br")
    return publica, privada


# ── Migração, dependência e configuração ────────────────────────────────────


def test_migracao_082_encadeada_e_preferencias_iguais_ao_modelo():
    spec = importlib.util.spec_from_file_location("m082", BACKEND_DIR / "alembic/versions/082_push_inscricoes.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (mod.revision, mod.down_revision) == ("082_push_inscricoes", "081_lembretes")
    assert mod.PREFERENCIAS == modelos.PREFERENCIAS
    for p in modelos.PREFERENCIAS:
        assert hasattr(modelos.MediumPreferencia, f"push_{p}")


def test_pywebpush_pinado_e_vapid_so_por_ambiente():
    pyproject = (BACKEND_DIR / "pyproject.toml").read_text()
    assert '"pywebpush==' in pyproject
    compose = (REPO_DIR / "docker-compose.prod.yml").read_text()
    for var in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"):
        assert f"{var}: ${{{var}:-}}" in compose
        for exemplo in (".env.example", ".env.prod.example"):
            linhas = [l for l in (REPO_DIR / exemplo).read_text().splitlines() if l.startswith(f"{var}=")]
            assert linhas == [f"{var}="], f"{exemplo}: {var} precisa estar vazia"


def test_sem_as_tres_variaveis_o_push_fica_desligado(monkeypatch):
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "x")
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:a@b.c")
    assert web_push.disponivel() is False
    assert web_push.chave_publica() is None


def test_com_as_tres_variaveis_liga(vapid):
    assert web_push.disponivel() is True
    assert web_push.chave_publica() == vapid[0]


@pytest.mark.parametrize(
    "endpoint, ok",
    [
        ("https://fcm.googleapis.com/fcm/send/abc:def", True),
        ("https://updates.push.services.mozilla.com/wpush/v2/gAAA", True),
        ("https://web.push.apple.com/QGx", True),
        ("https://wns2-by3p.notify.windows.com/w/?token=abc", True),
        ("http://fcm.googleapis.com/fcm/send/abc", False),
        ("https://fcm.googleapis.com.evil.com/x", False),
        ("https://evilfcm.googleapis.com.example/x", False),
        ("https://localhost/x", False),
        ("https://169.254.169.254/latest/meta-data", False),
        ("https://user:pw@fcm.googleapis.com/x", False),
        ("https://fcm.googleapis.com:8443/x", False),
        ("javascript:alert(1)", False),
        ("", False),
    ],
)
def test_endpoint_so_de_servico_de_push_conhecido(endpoint, ok):
    assert endpoint_aceito(endpoint) is ok


# ── Textos (discretos, abrem a Área) ────────────────────────────────────────


def _brt(d: date, hora: int, minuto: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hora, minuto, tzinfo=APP_TZ).astimezone(timezone.utc)


def _participacao(titulo="Gira de Caboclos", origem="gira", inicio=None):
    ref = uuid.uuid4()
    return SimpleNamespace(
        atividade_id=uuid.uuid4(),
        origem=origem,
        ref_id=ref,
        titulo=titulo,
        inicio=inicio or _brt(date(2026, 10, 10), 20),
        cancelamento_motivo="Doença na família",
        local="Rua Secreta, 10",
    )


def test_cada_tipo_tem_texto_discreto_e_abre_a_area():
    mes = SimpleNamespace(mes=date(2026, 10, 1), valor=50.0)
    aviso = SimpleNamespace(id=uuid.uuid4(), titulo="Amaci no sábado", corpo="Trazer ervas")
    gira = _participacao()
    casos = {
        modelos.TIPO_MENSALIDADE_ANTES: [mes],
        modelos.TIPO_MENSALIDADE_DEPOIS: [mes],
        modelos.TIPO_PIX_ALTERADO: [None],
        modelos.TIPO_ESCALA_NOVA: [gira],
        modelos.TIPO_VESPERA: [gira],
        modelos.TIPO_CONFIRMACAO: [gira],
        modelos.TIPO_FALTA: [gira],
        modelos.TIPO_AVISO: [aviso],
        modelos.TIPO_CANCELADA: [gira],
    }
    assert set(casos) == set(modelos.PREFERENCIA_DO_TIPO)
    for tipo, reservadas in casos.items():
        n = medium_push.notificacao(tipo, "Casa Luz", reservadas)
        assert n is not None, tipo
        assert n.title == "Casa Luz"
        assert n.url.startswith("/medium"), tipo
        texto = (n.title + " " + n.body).lower()
        assert not any(t in texto for t in TERMOS_RELIGIOSOS), (tipo, n.body)
        for segredo in ("caboclos", "amaci", "ervas", "doença", "rua secreta", "r$", "50"):
            assert segredo not in texto, (tipo, n.body)
        assert len(n.json().encode()) < 400
    assert medium_push.notificacao(modelos.TIPO_MENSALIDADE_ANTES, "Casa Luz", [mes]).body == (
        "A mensalidade de outubro vence em 3 dias."
    )
    assert medium_push.notificacao(modelos.TIPO_MENSALIDADE_ANTES, "Casa Luz", [mes]).url == "/medium/mensalidade?pagar=1"
    assert medium_push.notificacao(modelos.TIPO_AVISO, "Casa Luz", [aviso]).url == f"/medium/avisos/{aviso.id}"
    assert medium_push.notificacao(modelos.TIPO_VESPERA, "Casa Luz", [gira]).url == f"/medium/agenda/gira/{gira.ref_id}"
    assert "às 20h" in medium_push.notificacao(modelos.TIPO_VESPERA, "Casa Luz", [gira]).body
    assert "sábado, 10/10" in medium_push.notificacao(modelos.TIPO_CANCELADA, "Casa Luz", [gira]).body
    duas = medium_push.notificacao(modelos.TIPO_ESCALA_NOVA, "Casa Luz", [gira, _participacao()])
    assert "2 atividades" in duas.body
    assert medium_push.notificacao(modelos.TIPO_RESUMO_ADMIN, "Casa Luz", [None]) is None
    assert json.loads(medium_push.notificacao_teste("Casa Luz").json())["url"] == "/medium/perfil"


# ── Envio de verdade (cifra + assinatura VAPID), sem rede ───────────────────


def _inscricao_do_navegador() -> tuple[str, str]:
    chave = ec.generate_private_key(ec.SECP256R1())
    p256dh = chave.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(p256dh), _b64(os.urandom(16))


def _envio(endpoint="https://fcm.googleapis.com/fcm/send/abc") -> web_push.Envio:
    p256dh, auth = _inscricao_do_navegador()
    return web_push.Envio(
        uuid.uuid4(), uuid.uuid4(), endpoint, p256dh, auth, web_push.Notificacao("Casa Luz", "Oi", "/medium")
    )


def test_chaves_no_formato_do_web_push_cifram_e_assinam(vapid, monkeypatch):
    import pywebpush

    chamadas = []

    def post(url, timeout=None, data=None, headers=None):
        chamadas.append({"url": url, "timeout": timeout, "data": data, "headers": headers})
        return SimpleNamespace(status_code=201, reason="Created", text="", headers={})

    monkeypatch.setattr(pywebpush.requests, "post", post)
    assert web_push._enviar_um(_envio()) is None
    (c,) = chamadas
    assert c["url"].startswith("https://fcm.googleapis.com/")
    assert c["headers"]["authorization"].startswith("vapid t=") and f"k={vapid[0]}" in c["headers"]["authorization"]
    assert c["headers"]["content-encoding"] == "aes128gcm" and c["headers"]["ttl"] == str(web_push.TTL_S)
    assert b"Casa Luz" not in c["data"]  # cifrado
    assert c["timeout"] == web_push.TIMEOUT_S


@pytest.mark.parametrize("status", [404, 410, 500])
def test_falha_do_servico_devolve_o_status(vapid, monkeypatch, status):
    import pywebpush

    monkeypatch.setattr(
        pywebpush.requests,
        "post",
        lambda *a, **k: SimpleNamespace(status_code=status, reason="x", text="gone", headers={}),
    )
    assert web_push._enviar_um(_envio()) == status


def test_chave_privada_quebrada_nao_derruba(monkeypatch, vapid):
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "nao-e-chave")
    assert web_push._enviar_um(_envio()) == 0


# ── Service worker e tela ───────────────────────────────────────────────────


def test_sw_tem_push_e_notificationclick():
    sw = (REPO_DIR / "frontend/public/sw.js").read_text()
    assert "addEventListener('push'" in sw and "addEventListener('notificationclick'" in sw
    assert (REPO_DIR / "frontend/src/components/medium/perfil/NotificacoesNoCelular.tsx").exists()
