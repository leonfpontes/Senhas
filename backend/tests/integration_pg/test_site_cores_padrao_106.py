"""Migração 106 — sites anteriores à 3.0.0 mantêm as cores padrão de antes (decisão do Leonardo, 06/11/2026).

Cenários, num Postgres real com o schema das migrações:
- Hero sem cor recebe índigo e rosa (#6366f1 / #ec4899);
- Hero com cor escolhida não muda (só o campo vazio é preenchido);
- site sem Hero recebe a marca índigo #4f46e5 (`site_brand_color`) e o destaque do calendário vazio;
- site com Hero não ganha destaque gravado no calendário (continua seguindo a cor do Hero);
- seção sem nenhuma cor (Contato) só ganha a marca quando o site não tem Hero;
- versão salva (snapshot) recebe o mesmo tratamento;
- rodar de novo não muda nada (idempotente); o downgrade não mexe nos dados.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import uuid

from sqlalchemy import text

from .conftest import BACKEND_DIR
from .factories import create_tenant

MIGRACAO = BACKEND_DIR / "alembic" / "versions" / "106_site_cores_padrao_antigas.py"


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


def _modulo():
    spec = importlib.util.spec_from_file_location("migracao_106", MIGRACAO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def test_funcao_pura_so_preenche_o_vazio():
    m = _modulo()
    com_hero = m.preencher_cores_antigas(
        [
            {"section_type": "HERO", "config": {"gradient_from": "#123456", "gradient_to": "", "bg_color": None}},
            {"section_type": "GIRAS_CALENDAR", "config": {}},
        ]
    )
    assert com_hero[0] == {"gradient_from": "#123456", "gradient_to": "#ec4899", "bg_color": "#6366f1"}
    assert com_hero[1] == {}  # com Hero, o calendário segue a cor do Hero
    sem_hero = m.preencher_cores_antigas(
        [{"section_type": "GIRAS_CALENDAR", "config": {"calendar_highlight_color": "#ff0000"}}, {"section_type": "ABOUT"}]
    )
    assert sem_hero[0] == {"calendar_highlight_color": "#ff0000", "site_brand_color": "#4f46e5"}
    assert sem_hero[1] == {"site_brand_color": "#4f46e5"}


async def _site(conn, tenant_id, secoes):
    site_id = uuid.uuid4()
    await conn.execute(
        text("INSERT INTO tenant_sites (id, tenant_id, slug, status, template) VALUES (:id, :t, :slug, 'PUBLISHED', 'moderno')"),
        {"id": site_id, "t": tenant_id, "slug": f"site-{site_id.hex[:8]}"},
    )
    ids = []
    for i, (tipo, config) in enumerate(secoes):
        sid = uuid.uuid4()
        await conn.execute(
            text(
                "INSERT INTO tenant_site_sections (id, site_id, tenant_id, section_type, order_index, config) "
                "VALUES (:id, :s, :t, CAST(:tipo AS site_section_type), :o, CAST(:c AS jsonb))"
            ),
            {"id": sid, "s": site_id, "t": tenant_id, "tipo": tipo, "o": i, "c": json.dumps(config)},
        )
        ids.append(sid)
    return site_id, ids


async def _config(conn, section_id):
    return (await conn.execute(text("SELECT config FROM tenant_site_sections WHERE id = :id"), {"id": section_id})).scalar_one()


async def test_migracao_106_grava_as_cores_antigas_so_no_que_esta_vazio(db):
    from src.core.database import engine

    t1 = await create_tenant(db, name="Casa Hero Vazio")
    t2 = await create_tenant(db, name="Casa Hero Escolhido")
    t3 = await create_tenant(db, name="Casa Sem Hero")
    await db.commit()
    await db.close()

    async with engine.begin() as conn:
        site_a, (hero_a, cal_a) = await _site(conn, t1.id, [("HERO", {"title": "Bem-vindos"}), ("GIRAS_CALENDAR", {"title": "Giras"})])
        _, (hero_b,) = await _site(
            conn, t2.id, [("HERO", {"bg_type": "gradient", "gradient_from": "#123456", "gradient_to": "#abcdef", "bg_color": ""})]
        )
        _, (about_c, cal_c, contato_c) = await _site(
            conn, t3.id, [("ABOUT", {"title": "Sobre"}), ("GIRAS_CALENDAR", {}), ("CONTACT", {})]
        )
        versao = uuid.uuid4()
        await conn.execute(
            text("INSERT INTO site_versions (id, site_id, tenant_id, snapshot, label) VALUES (:id, :s, :t, CAST(:snap AS jsonb), 'v1')"),
            {
                "id": versao,
                "s": site_a,
                "t": t1.id,
                "snap": json.dumps([{"section_type": "HERO", "order_index": 0, "config": {"title": "Antes"}}]),
            },
        )

    # A 106 já está aplicada; desce para a 105 (no-op) e sobe de novo para rodar sobre estes sites.
    _alembic("downgrade", "105_consulente_retornos")
    async with engine.connect() as conn:
        assert await _config(conn, hero_a) == {"title": "Bem-vindos"}  # downgrade não mexe em dado
    _alembic("upgrade", "head")

    async with engine.connect() as conn:
        assert await _config(conn, hero_a) == {
            "title": "Bem-vindos",
            "bg_color": "#6366f1",
            "gradient_from": "#6366f1",
            "gradient_to": "#ec4899",
        }
        assert await _config(conn, cal_a) == {"title": "Giras"}  # com Hero: o calendário segue o Hero
        assert await _config(conn, hero_b) == {
            "bg_type": "gradient",
            "gradient_from": "#123456",
            "gradient_to": "#abcdef",
            "bg_color": "#6366f1",  # só o vazio
        }
        assert await _config(conn, about_c) == {"title": "Sobre", "site_brand_color": "#4f46e5"}
        assert await _config(conn, cal_c) == {"site_brand_color": "#4f46e5", "calendar_highlight_color": "#4f46e5"}
        assert await _config(conn, contato_c) == {"site_brand_color": "#4f46e5"}
        snap = (await conn.execute(text("SELECT snapshot FROM site_versions WHERE id = :id"), {"id": versao})).scalar_one()
        assert snap[0]["config"] == {"title": "Antes", "bg_color": "#6366f1", "gradient_from": "#6366f1", "gradient_to": "#ec4899"}
        antes = {sid: await _config(conn, sid) for sid in (hero_a, cal_a, hero_b, about_c, cal_c, contato_c)}

    # Idempotente: rodar de novo não muda nada.
    _alembic("downgrade", "105_consulente_retornos")
    _alembic("upgrade", "head")
    async with engine.connect() as conn:
        for sid, config in antes.items():
            assert await _config(conn, sid) == config
