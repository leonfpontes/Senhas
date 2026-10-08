"""C-06 — Programa de Parceiros GiraHub contra Postgres real.

- Formulário público grava o pedido (201), normaliza WhatsApp/UF/e-mail e guarda só o HMAC do IP.
- Validação: tipo, UF, WhatsApp, campos obrigatórios e aceite do regulamento.
- Campo isca preenchido: responde 201 e não grava nem avisa.
- Limite por IP (5/hora).
- Aviso à equipe no ALERT_EMAIL, com reply_to do interessado.
- Plataforma: lista com filtro e contagem, detalhe e PATCH só para super-admin (403 para admin de
  terreiro, 401 sem login).
"""
import pytest
from sqlalchemy import func, select, text

from src.core.database import AsyncSessionLocal
from src.models.parceiro_interesse import ParceiroInteresse
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .factories import create_tenant, create_user

URL = "/api/v1/public/parceiros/interesse"
IP = "203.0.113.45"


def _payload(**over):
    base = {
        "nome": "Maria das Ervas",
        "tipo": "loja",
        "nome_negocio": "Casa de Artigos Pai Joaquim",
        "cidade": "Niterói",
        "uf": "rj",
        "whatsapp": "(21) 99876-5432",
        "email": "Maria@Exemplo.com",
        "como_divulgar": "Display no balcão e grupo de WhatsApp dos clientes",
        "aceite_regulamento": True,
    }
    base.update(over)
    return base


@pytest.fixture
def emails(monkeypatch):
    from src.api.v1.public import parceiros as mod

    enviados = []
    monkeypatch.setattr(mod.settings, "ALERT_EMAIL", "equipe@girahub.test")
    monkeypatch.setattr(mod.email_queue, "enqueue", lambda item: enviados.append(item.message))
    return enviados


async def _contar() -> int:
    async with AsyncSessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(ParceiroInteresse))


async def test_pedido_valido_grava_e_avisa_a_equipe(client, emails):
    resp = await client.post(URL, json=_payload(), headers={"X-Real-IP": IP})
    assert resp.status_code == 201, resp.text
    assert "2 dias úteis" in resp.json()["message"]

    async with AsyncSessionLocal() as s:
        pedido = (await s.execute(select(ParceiroInteresse))).scalar_one()
    assert pedido.status == "novo"
    assert pedido.uf == "RJ"
    assert pedido.whatsapp == "21998765432"
    assert pedido.email == "maria@exemplo.com"
    assert pedido.aceite_regulamento_em is not None
    assert pedido.cupom is None

    # IP nunca em claro: só o HMAC (64 hex), estável para o mesmo endereço.
    assert pedido.ip_hash and len(pedido.ip_hash) == 64 and IP not in pedido.ip_hash
    async with AsyncSessionLocal() as s:
        dump = (await s.execute(text("SELECT row_to_json(p)::text FROM parceiro_interesses p"))).scalar_one()
    assert IP not in dump

    assert len(emails) == 1
    msg = emails[0]
    assert msg.to_email == "equipe@girahub.test"
    assert msg.reply_to == "maria@exemplo.com"
    assert "Maria das Ervas" in msg.subject
    assert "Casa de Artigos Pai Joaquim" in msg.html_body
    assert f"/platform/parceiros?pedido={pedido.id}" in msg.html_body


async def test_sem_alert_email_grava_sem_avisar(client, monkeypatch):
    from src.api.v1.public import parceiros as mod

    enviados = []
    monkeypatch.setattr(mod.settings, "ALERT_EMAIL", "")
    monkeypatch.setattr(mod.email_queue, "enqueue", lambda item: enviados.append(item))
    resp = await client.post(URL, json=_payload(nome_negocio=""))
    assert resp.status_code == 201, resp.text
    assert enviados == []
    async with AsyncSessionLocal() as s:
        pedido = (await s.execute(select(ParceiroInteresse))).scalar_one()
    assert pedido.nome_negocio is None


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("tipo", "fornecedor"),
        ("uf", "XX"),
        ("whatsapp", "1234"),
        ("email", "nao-e-email"),
        ("nome", "A"),
        ("cidade", ""),
        ("como_divulgar", ""),
        ("como_divulgar", "x" * 501),
    ],
)
async def test_validacao_dos_campos(client, emails, campo, valor):
    resp = await client.post(URL, json=_payload(**{campo: valor}))
    assert resp.status_code == 422, resp.text
    assert await _contar() == 0
    assert emails == []


async def test_campo_obrigatorio_ausente(client, emails):
    dados = _payload()
    del dados["whatsapp"]
    resp = await client.post(URL, json=dados)
    assert resp.status_code == 422
    assert await _contar() == 0


async def test_aceite_do_regulamento_e_obrigatorio(client, emails):
    resp = await client.post(URL, json=_payload(aceite_regulamento=False))
    assert resp.status_code == 422, resp.text
    assert "regulamento" in resp.text
    dados = _payload()
    del dados["aceite_regulamento"]
    assert (await client.post(URL, json=dados)).status_code == 422
    assert await _contar() == 0
    assert emails == []


async def test_campo_isca_responde_igual_e_nao_grava(client, emails):
    resp = await client.post(URL, json=_payload(website="http://spam.example"))
    assert resp.status_code == 201
    assert "2 dias úteis" in resp.json()["message"]
    assert await _contar() == 0
    assert emails == []


async def test_limite_por_ip(client, emails):
    from src.core.limiter import limiter

    limiter.reset()
    limiter.enabled = True
    try:
        headers = {"X-Real-IP": "198.51.100.7"}
        for i in range(5):
            resp = await client.post(URL, json=_payload(email=f"p{i}@exemplo.com"), headers=headers)
            assert resp.status_code == 201, resp.text
        resp = await client.post(URL, json=_payload(email="p6@exemplo.com"), headers=headers)
        assert resp.status_code == 429
        # Outro IP segue livre.
        resp = await client.post(URL, json=_payload(email="outro@exemplo.com"), headers={"X-Real-IP": "198.51.100.8"})
        assert resp.status_code == 201
    finally:
        limiter.enabled = False
        limiter.reset()
    assert await _contar() == 6


async def test_plataforma_lista_filtra_e_atualiza(client, db, emails):
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    for nome, tipo in (("Loja Um", "loja"), ("Criadora Dois", "criador_conteudo"), ("Federação Três", "federacao")):
        assert (await client.post(URL, json=_payload(nome=nome, tipo=tipo))).status_code == 201

    resp = await client.get("/api/v1/platform/parceiros", headers=root.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 3
    assert body["counts"] == {"novo": 3, "em_contato": 0, "aprovado": 0, "recusado": 0}
    assert [i["nome"] for i in body["items"]] == ["Federação Três", "Criadora Dois", "Loja Um"]
    assert "ip_hash" not in body["items"][0]

    alvo = body["items"][2]["id"]
    resp = await client.patch(
        f"/api/v1/platform/parceiros/{alvo}",
        json={"status": "aprovado", "cupom": " loja-um10 ", "observacoes": "Display enviado"},
        headers=root.headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "aprovado"
    assert resp.json()["cupom"] == "LOJA-UM10"
    assert resp.json()["observacoes"] == "Display enviado"

    resp = await client.get("/api/v1/platform/parceiros", params={"status": "aprovado"}, headers=root.headers)
    assert [i["nome"] for i in resp.json()["items"]] == ["Loja Um"]
    assert resp.json()["counts"]["aprovado"] == 1 and resp.json()["counts"]["novo"] == 2

    resp = await client.get("/api/v1/platform/parceiros", params={"q": "criadora"}, headers=root.headers)
    assert [i["nome"] for i in resp.json()["items"]] == ["Criadora Dois"]

    resp = await client.get(f"/api/v1/platform/parceiros/{alvo}", headers=root.headers)
    assert resp.status_code == 200 and resp.json()["cupom"] == "LOJA-UM10"

    # Cupom e status inválidos; limpar o cupom.
    r = await client.patch(f"/api/v1/platform/parceiros/{alvo}", json={"cupom": "com espaço"}, headers=root.headers)
    assert r.status_code == 422
    r = await client.patch(f"/api/v1/platform/parceiros/{alvo}", json={"status": "pago"}, headers=root.headers)
    assert r.status_code == 422
    r = await client.patch(f"/api/v1/platform/parceiros/{alvo}", json={"cupom": ""}, headers=root.headers)
    assert r.status_code == 200 and r.json()["cupom"] is None and r.json()["status"] == "aprovado"

    r = await client.get("/api/v1/platform/parceiros", params={"status": "pago"}, headers=root.headers)
    assert r.status_code == 422
    r = await client.get(
        "/api/v1/platform/parceiros/00000000-0000-4000-8000-000000000000", headers=root.headers
    )
    assert r.status_code == 404


async def test_plataforma_so_para_super_admin(client, db, emails):
    assert (await client.post(URL, json=_payload())).status_code == 201
    async with AsyncSessionLocal() as s:
        pedido_id = (await s.execute(select(ParceiroInteresse.id))).scalar_one()

    tenant = await create_tenant(db, "Casa", PlanType.PREMIUM)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    for metodo, url, kw in (
        ("GET", "/api/v1/platform/parceiros", {}),
        ("GET", f"/api/v1/platform/parceiros/{pedido_id}", {}),
        ("PATCH", f"/api/v1/platform/parceiros/{pedido_id}", {"json": {"status": "aprovado"}}),
    ):
        r = await client.request(metodo, url, headers=admin.headers, **kw)
        assert r.status_code == 403, (metodo, url, r.text)
        r = await client.request(metodo, url, **kw)
        assert r.status_code == 401, (metodo, url, r.text)

    async with AsyncSessionLocal() as s:
        assert (await s.get(ParceiroInteresse, pedido_id)).status == "novo"
