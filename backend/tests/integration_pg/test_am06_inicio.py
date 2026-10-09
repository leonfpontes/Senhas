"""AM-06 — GET /api/v1/medium/inicio com Postgres real (migrações + app inteiro via HTTP).

Pendências na ordem da tela (D-24), próxima gira do terreiro (sem nada de consulente),
mensalidade do mês do PRÓPRIO médium (pendente, atrasada, paga, isento) e isolamento: nada de
outro médium ou de outro terreiro aparece, e `medium_id` na URL é ignorado. Chave do piloto
desligada → 403.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from src.api.v1.medium import inicio as inicio_mod
from src.models import Gira, Medium, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .factories import create_tenant, create_user

INICIO = "/api/v1/medium/inicio"


@pytest.fixture
def hoje(monkeypatch):
    """Fixa o "hoje" de Brasília usado pela mensalidade (a gira usa o relógio real)."""

    def _set(d: date):
        monkeypatch.setattr(inicio_mod, "today_local", lambda: d)

    return _set


async def _cenario(db, *, plan=PlanType.BASIC, liberada=True, valor="50.00", dia=10, nome="Terreiro AM06"):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    if valor is not None:
        db.add(MensalidadeConfig(tenant_id=tenant.id, valor_mensal=Decimal(valor), dia_vencimento=dia, ativo=True))
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    medium = Medium(tenant_id=tenant.id, nome="Ana Paula Ribeiro", user_id=actor.user.id)
    db.add(medium)
    await db.commit()
    return tenant, actor, medium


def _gira(tenant, nome, inicio, **kw):
    return Gira(tenant_id=tenant.id, nome=nome, data_inicio=inicio, is_active=kw.pop("is_active", True), **kw)


async def test_pendencias_proxima_gira_e_mensalidade_atrasada(client, db, hoje):
    tenant, actor, _ = await _cenario(db)
    outro, _, _ = await _cenario(db, nome="Outro Terreiro")
    agora = datetime.now(timezone.utc)
    db.add_all(
        [
            _gira(tenant, "Gira passada", agora - timedelta(days=3)),
            _gira(tenant, "Gira inativa", agora + timedelta(hours=10), is_active=False),
            _gira(tenant, "Gira excluída", agora + timedelta(hours=12), deleted_at=agora),
            _gira(tenant, "Gira de Caboclos", agora + timedelta(days=2), local="Salão principal", recados="Pix 123"),
            _gira(tenant, "Gira de Pretos Velhos", agora + timedelta(days=9)),
            _gira(outro, "Gira de outra casa", agora + timedelta(hours=5)),
        ]
    )
    await db.commit()
    hoje(date(2026, 10, 15))

    resp = await client.get(INICIO, headers=actor.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["hoje"] == "2026-10-15"
    gira = body["proxima_gira"]
    assert gira["nome"] == "Gira de Caboclos"
    assert gira["local"] == "Salão principal"
    assert gira["orientacoes"] is None
    # Só o que a corrente precisa: nada de senhas, recados para consulente, limites de emissão.
    assert set(gira) == {"id", "nome", "data_inicio", "data_fim", "local", "orientacoes"}

    assert body["mensalidade"] == {
        "mes": "2026-10",
        "status": "atrasada",
        "valor": 50.0,
        "vencimento": "2026-10-10",
        "data_pagamento": None,
        # Pagamento parcial (092): `valor` é o que falta; nada recebido ainda.
        "valor_mensalidade": 50.0,
        "valor_recebido": 0.0,
        "pix_disponivel": False,  # AM-29: a casa ainda não cadastrou a chave PIX
    }
    assert body["pendencias"] == [
        {
            "tipo": "mensalidade",
            "situacao": "atrasada",
            "mes": "2026-10",
            "valor": 50.0,
            "valor_recebido": 0,
            "vencimento": "2026-10-10",
            "dias_para_vencer": -5,
        }
    ]
    assert body["avisos"] == {"nao_lidos": 0, "ultimos": []}


async def test_gira_em_andamento_ainda_e_a_proxima(client, db, hoje):
    tenant, actor, _ = await _cenario(db)
    agora = datetime.now(timezone.utc)
    db.add_all(
        [
            _gira(tenant, "Gira agora", agora - timedelta(hours=1), data_fim=agora + timedelta(hours=2)),
            _gira(tenant, "Gira amanhã", agora + timedelta(days=1)),
        ]
    )
    await db.commit()
    hoje(date(2026, 10, 5))
    body = (await client.get(INICIO, headers=actor.headers)).json()
    assert body["proxima_gira"]["nome"] == "Gira agora"


async def test_pendente_antes_do_vencimento_e_paga_sai_das_pendencias(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    hoje(date(2026, 10, 5))

    body = (await client.get(INICIO, headers=actor.headers)).json()
    assert body["mensalidade"]["status"] == "pendente"
    assert body["pendencias"][0]["dias_para_vencer"] == 5
    assert body["proxima_gira"] is None

    db.add(
        MensalidadePagamento(
            tenant_id=tenant.id,
            mediun_id=medium.id,
            mes_referencia=date(2026, 10, 1),
            status=MensalidadeStatus.PAGO,
            valor_vigente=Decimal("50.00"),
            valor_pago=Decimal("50.00"),
            data_pagamento=datetime(2026, 10, 3, 18, tzinfo=timezone.utc),
            observacao="anotação interna da secretaria",
        )
    )
    await db.commit()
    body = (await client.get(INICIO, headers=actor.headers)).json()
    assert body["mensalidade"]["status"] == "paga"
    assert body["mensalidade"]["valor"] == 50.0
    assert body["mensalidade"]["data_pagamento"].startswith("2026-10-03")
    assert body["pendencias"] == []
    assert "anotação interna" not in str(body)


async def test_isento_permanente_e_isento_no_mes(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    hoje(date(2026, 10, 20))
    medium.mensalidade_isento = True
    await db.commit()
    body = (await client.get(INICIO, headers=actor.headers)).json()
    assert body["mensalidade"]["status"] == "isento"
    assert body["pendencias"] == []

    medium.mensalidade_isento = False
    db.add(
        MensalidadePagamento(
            tenant_id=tenant.id, mediun_id=medium.id, mes_referencia=date(2026, 10, 1), status=MensalidadeStatus.ISENTO
        )
    )
    await db.commit()
    body = (await client.get(INICIO, headers=actor.headers)).json()
    assert body["mensalidade"]["status"] == "isento"
    assert body["pendencias"] == []


async def test_sem_configuracao_ou_sem_plano_de_mensalidade_nao_mostra_mensalidade(client, db, hoje):
    _, actor, _ = await _cenario(db, valor=None)
    hoje(date(2026, 10, 20))
    body = (await client.get(INICIO, headers=actor.headers)).json()
    assert body["mensalidade"] is None
    assert body["pendencias"] == []


async def test_dados_de_outro_medium_nunca_aparecem(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    colega_user = await create_user(db, tenant, UserRole.MEDIUM, name="colega")
    colega = Medium(tenant_id=tenant.id, nome="Colega", user_id=colega_user.user.id, mensalidade_isento=False)
    db.add(colega)
    await db.commit()
    # O colega pagou (com valor diferente); eu não.
    db.add(
        MensalidadePagamento(
            tenant_id=tenant.id,
            mediun_id=colega.id,
            mes_referencia=date(2026, 10, 1),
            status=MensalidadeStatus.PAGO,
            valor_vigente=Decimal("80.00"),
            valor_pago=Decimal("80.00"),
        )
    )
    await db.commit()
    hoje(date(2026, 10, 5))

    meu = (await client.get(INICIO, headers=actor.headers)).json()
    assert meu["mensalidade"]["status"] == "pendente"
    assert meu["mensalidade"]["valor"] == 50.0
    # `medium_id` na URL não muda nada: a rota é "minha".
    tentativa = (await client.get(f"{INICIO}?medium_id={colega.id}", headers=actor.headers)).json()
    assert tentativa == meu
    assert str(colega.id) not in str(meu) and str(medium.id) not in str(meu)

    dele = (await client.get(INICIO, headers=colega_user.headers)).json()
    assert dele["mensalidade"]["status"] == "paga"
    assert dele["mensalidade"]["valor"] == 80.0


async def test_chave_desligada_plano_sem_area_ou_sem_vinculo_dao_403(client, db):
    _, desligada, _ = await _cenario(db, liberada=False)
    assert (await client.get(INICIO, headers=desligada.headers)).status_code == 403

    _, gratuito, _ = await _cenario(db, plan=PlanType.FREE)
    assert (await client.get(INICIO, headers=gratuito.headers)).status_code == 403

    tenant, _, _ = await _cenario(db, nome="Casa com admin")
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    assert (await client.get(INICIO, headers=admin.headers)).status_code == 403

    assert (await client.get(INICIO)).status_code == 401


async def test_medium_inativo_perde_o_inicio(client, db):
    _, actor, medium = await _cenario(db)
    assert (await client.get(INICIO, headers=actor.headers)).status_code == 200
    medium.is_active = False
    await db.commit()
    assert (await client.get(INICIO, headers=actor.headers)).status_code == 403
