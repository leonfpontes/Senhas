"""Recibos da plataforma contra Postgres real.

- Emissão: número sequencial por ano, snapshot do emissor e do nome do terreiro, valor por extenso,
  data padrão = hoje, log na auditoria da plataforma.
- Validação: valor > 0, documento com 11/14 dígitos, forma de pagamento, data futura.
- Lista por terreiro; cancelamento (não apaga, não cancela duas vezes).
- Recibo sobrevive à exclusão definitiva do terreiro (tenant_id vira NULL).
- Só super-admin (403 para admin de terreiro, 401 sem login).
"""
from datetime import timedelta

from sqlalchemy import select

from src.core.database import AsyncSessionLocal
from src.core.tz import today_local
from src.models.audit_logs import AuditLog
from src.models.platform_recibo import PlatformRecibo
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .factories import create_tenant, create_user

URL = "/api/v1/platform/recibos"


def _payload(tenant_id, **over):
    base = {
        "tenant_id": str(tenant_id),
        "pagador_nome": "  Fulano   de Tal ",
        "pagador_documento": "123.456.789-09",
        "valor": "150.20",
        "referente": "Contribuição pelo uso do GiraHub — outubro/2026",
        "forma_pagamento": "pix",
    }
    base.update(over)
    return base


async def test_emite_numera_e_lista(client, db, monkeypatch):
    from src.api.v1.platform import recibos as mod

    monkeypatch.setattr(mod.settings, "RECIBO_EMISSOR_CNPJ", "00.000.000/0001-00")
    monkeypatch.setattr(mod.settings, "RECIBO_EMISSOR_CIDADE", "Rio de Janeiro/RJ")
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    casa = await create_tenant(db, "Casa Um", PlanType.PREMIUM)
    outra = await create_tenant(db, "Casa Dois", PlanType.PREMIUM)

    r = await client.get(f"{URL}/emissor", headers=root.headers)
    assert r.status_code == 200, r.text
    assert r.json()["nome"] == "Leonardo Fonseca Pontes"
    assert r.json()["cnpj"] == "00.000.000/0001-00"

    r = await client.post(URL, json=_payload(casa.id), headers=root.headers)
    assert r.status_code == 201, r.text
    um = r.json()
    ano = today_local().year
    assert um["numero"] == 1 and um["numero_formatado"] == f"0001/{ano}"
    assert um["pagador_nome"] == "Fulano de Tal"
    assert um["pagador_documento"] == "12345678909"
    assert um["valor_extenso"] == "cento e cinquenta reais e vinte centavos"
    assert um["data_pagamento"] == today_local().isoformat()
    assert um["tenant_nome"] == "Casa Um"
    assert um["emissor_empresa"].startswith("GiraHub")
    assert um["emissor_cidade"] == "Rio de Janeiro/RJ"

    ontem = (today_local() - timedelta(days=1)).isoformat()
    r = await client.post(
        URL,
        json=_payload(outra.id, pagador_documento=None, forma_pagamento=None, data_pagamento=ontem, valor="80"),
        headers=root.headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["numero"] == 2 and r.json()["data_pagamento"] == ontem

    r = await client.get(URL, params={"tenant_id": str(casa.id)}, headers=root.headers)
    assert r.json()["total"] == 1 and r.json()["items"][0]["id"] == um["id"]
    r = await client.get(URL, headers=root.headers)
    assert [i["numero"] for i in r.json()["items"]] == [2, 1]

    # Emissor mudou: o recibo já emitido segue com o snapshot.
    monkeypatch.setattr(mod.settings, "RECIBO_EMISSOR_CIDADE", "Niterói/RJ")
    r = await client.get(f"{URL}/{um['id']}", headers=root.headers)
    assert r.json()["emissor_cidade"] == "Rio de Janeiro/RJ"

    async with AsyncSessionLocal() as s:
        logs = (await s.execute(select(AuditLog).where(AuditLog.resource_type == "platform_recibo"))).scalars().all()
    assert sorted(log.details["platform_action"] for log in logs) == ["recibo_emitido", "recibo_emitido"]
    assert {log.tenant_id for log in logs} == {casa.id, outra.id}


async def test_validacao(client, db):
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    casa = await create_tenant(db, "Casa", PlanType.PREMIUM)
    amanha = (today_local() + timedelta(days=1)).isoformat()
    for over in (
        {"valor": "0"},
        {"valor": "-5"},
        {"pagador_documento": "123"},
        {"forma_pagamento": "cheque"},
        {"data_pagamento": amanha},
        {"pagador_nome": " "},
        {"referente": ""},
    ):
        r = await client.post(URL, json=_payload(casa.id, **over), headers=root.headers)
        assert r.status_code == 422, (over, r.text)
    r = await client.post(
        URL, json=_payload("00000000-0000-4000-8000-000000000000"), headers=root.headers
    )
    assert r.status_code == 404
    async with AsyncSessionLocal() as s:
        assert (await s.execute(select(PlatformRecibo))).first() is None


async def test_cancelar(client, db):
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    casa = await create_tenant(db, "Casa", PlanType.PREMIUM)
    rid = (await client.post(URL, json=_payload(casa.id), headers=root.headers)).json()["id"]

    r = await client.post(f"{URL}/{rid}/cancelar", json={"motivo": "Valor digitado errado"}, headers=root.headers)
    assert r.status_code == 200, r.text
    assert r.json()["cancelado_em"] and r.json()["motivo_cancelamento"] == "Valor digitado errado"
    r = await client.post(f"{URL}/{rid}/cancelar", json={"motivo": "De novo"}, headers=root.headers)
    assert r.status_code == 409

    # O próximo não reaproveita o número do cancelado.
    r = await client.post(URL, json=_payload(casa.id), headers=root.headers)
    assert r.json()["numero"] == 2


async def test_recibo_sobrevive_a_exclusao_do_terreiro(client, db):
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    casa = await create_tenant(db, "Casa Excluida", PlanType.PREMIUM)
    rid = (await client.post(URL, json=_payload(casa.id), headers=root.headers)).json()["id"]

    r = await client.request(
        "DELETE", f"/api/v1/platform/tenants/{casa.id}", json={"confirm_slug": casa.slug}, headers=root.headers
    )
    assert r.status_code in (200, 204), r.text
    r = await client.get(f"{URL}/{rid}", headers=root.headers)
    assert r.status_code == 200
    assert r.json()["tenant_id"] is None and r.json()["tenant_nome"] == "Casa Excluida"


async def test_so_super_admin(client, db):
    casa = await create_tenant(db, "Casa", PlanType.PREMIUM)
    admin = await create_user(db, casa, UserRole.ADMIN, name="admin")
    rid = "00000000-0000-4000-8000-000000000000"
    for metodo, url, kw in (
        ("GET", f"{URL}/emissor", {}),
        ("GET", URL, {}),
        ("POST", URL, {"json": _payload(casa.id)}),
        ("GET", f"{URL}/{rid}", {}),
        ("POST", f"{URL}/{rid}/cancelar", {"json": {"motivo": "teste"}}),
    ):
        r = await client.request(metodo, url, headers=admin.headers, **kw)
        assert r.status_code == 403, (metodo, url, r.text)
        r = await client.request(metodo, url, **kw)
        assert r.status_code == 401, (metodo, url, r.text)


async def test_assinatura_so_do_disco_do_servidor(client, db, monkeypatch, tmp_path):
    from src.api.v1.platform import recibos as mod

    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    casa = await create_tenant(db, "Casa", PlanType.PREMIUM)
    admin = await create_user(db, casa, UserRole.ADMIN, name="admin")
    arquivo = tmp_path / "assinatura.png"
    monkeypatch.setattr(mod.settings, "RECIBO_ASSINATURA_PATH", str(arquivo))

    r = await client.get(f"{URL}/assinatura", headers=root.headers)
    assert r.status_code == 404  # não configurada: o recibo sai só com a linha

    arquivo.write_bytes(b"\x89PNG\r\n\x1a\nfake")
    r = await client.get(f"{URL}/assinatura", headers=root.headers)
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert r.headers["cache-control"] == "no-store" and r.content.startswith(b"\x89PNG")
    assert (await client.get(f"{URL}/assinatura", headers=admin.headers)).status_code == 403
    assert (await client.get(f"{URL}/assinatura")).status_code == 401
