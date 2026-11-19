"""Beta "Textos do site com IA": beta tester + as duas betas ligadas no Laboratório + grupo SITE, com Postgres real.

A chamada à Anthropic é trocada por uma função falsa: aqui se testa quem pode pedir, não o modelo.
"""
from __future__ import annotations

from src.models.feature_flags import FeatureFlag
from src.models.permission_groups import PermissionFeature
from src.models.users import UserRole
from src.services import site_textos_ia

from .factories import create_tenant, create_user, grant

IA = "/api/v1/admin/sites/ia"
BODY = {"secao": "HERO", "campo": "subtitle", "pedido": "escrever", "ideia": "casa aberta a todos"}


async def _casa(db, *, liberada: bool):
    """`liberada` = a casa ligou a beta da IA no Laboratório (o construtor novo fica ligado nas duas)."""
    tenant = await create_tenant(db)
    tenant.beta_tester = True
    db.add(tenant)
    db.add(FeatureFlag(tenant_id=tenant.id, feature="beta_novo_construtor_site", enabled=True))
    db.add(FeatureFlag(tenant_id=tenant.id, feature="beta_textos_ia_site", enabled=liberada))
    await db.commit()
    return tenant


async def test_so_casa_com_a_beta_ligada_usa_a_ia(client, db, monkeypatch):
    monkeypatch.setattr(site_textos_ia.settings, "ANTHROPIC_API_KEY", "teste")

    async def falsa(db, tenant_id, **kw):
        return ["Seja bem-vindo"]

    monkeypatch.setattr(site_textos_ia, "sugerir", falsa)

    sem = await _casa(db, liberada=False)
    admin = await create_user(db, sem, UserRole.ADMIN)
    assert (await client.get(IA, headers=admin.headers)).json()["disponivel"] is False
    assert (await client.post(f"{IA}/sugestoes", headers=admin.headers, json=BODY)).status_code == 403

    com = await _casa(db, liberada=True)
    admin2 = await create_user(db, com, UserRole.ADMIN, name="admin2")
    r = await client.get(IA, headers=admin2.headers)
    assert r.json()["disponivel"] is True and "LINHAS" not in r.json()["campos"]
    r = await client.post(f"{IA}/sugestoes", headers=admin2.headers, json=BODY)
    assert r.status_code == 200, r.text
    assert r.json()["sugestoes"] == ["Seja bem-vindo"]

    # Só leitura do site: vê o cartão, mas não pede sugestão.
    leitor = await create_user(db, com, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, com, PermissionFeature.SITE, "view")
    assert (await client.post(f"{IA}/sugestoes", headers=leitor.headers, json=BODY)).status_code == 403


async def test_sem_chave_no_servidor_fica_escondido(client, db, monkeypatch):
    monkeypatch.setattr(site_textos_ia.settings, "ANTHROPIC_API_KEY", "")
    casa = await _casa(db, liberada=True)
    admin = await create_user(db, casa, UserRole.ADMIN)
    assert (await client.get(IA, headers=admin.headers)).json() == {"disponivel": False, "campos": {}}
    assert (await client.post(f"{IA}/sugestoes", headers=admin.headers, json=BODY)).status_code == 503
