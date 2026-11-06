"""Sites anteriores à 3.0.0 mantêm as cores padrão de antes — migração só de DADOS.

Decisão do Leonardo (06/11/2026): na 3.0.0 o padrão do site do terreiro (Meu Site) passou a ser verde
#2E6A4E e dourado #E9B04A. Campo de cor vazio no config de uma seção é preenchido pelo código com o padrão
da versão em uso, então os sites que já existem mudariam de cara sozinhos. Esta migração grava, nos sites
que já existem, as cores que o código antigo usava quando o campo estava vazio:

- HERO: `bg_color` #6366f1, `gradient_from` #6366f1, `gradient_to` #ec4899 (lib.ts › heroBackground).
- Site SEM seção HERO: a cor de marca era o índigo #4f46e5 (siteBrandColor), usada no botão do topo, na barra
  do celular e no destaque do calendário vazio. Fica em `site_brand_color` em todas as seções do site (lida
  por siteBrandColor como reserva) e em `calendar_highlight_color` do calendário, se vazio.
- Site COM Hero: o destaque do calendário vazio segue a cor do Hero, como sempre — não é gravado, para não
  desligar a casa que escolheu outra cor no Hero.

Só preenche o que está vazio (ausente, nulo, "" ou falso: o `||` do JavaScript); nunca troca cor escolhida.
Vale também para as versões salvas (`site_versions.snapshot`), para "Restaurar" uma versão antiga não trazer o
verde de volta. Sites criados depois desta migração seguem com o verde e o dourado. O rodapé "GiraHub" é a
marca do GiraHub e fica verde.

Downgrade: nada a fazer. Os valores gravados são os mesmos que o código antigo usava para o campo vazio;
voltar para a 2.11 não muda nada na tela.

Revision ID: 106_site_cores_padrao_antigas
Revises: 105_consulente_retornos
Create Date: 2026-11-06
"""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "106_site_cores_padrao_antigas"
down_revision: str = "105_consulente_retornos"
branch_labels = None
depends_on = None

HERO_ANTIGO = {"bg_color": "#6366f1", "gradient_from": "#6366f1", "gradient_to": "#ec4899"}
MARCA_SEM_HERO = "#4f46e5"


def _vazio(valor: Any) -> bool:
    return not valor  # o código usa `config.x || padrão`


def preencher_cores_antigas(secoes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Recebe as seções de UM site ({section_type, config}) e devolve os configs com as cores antigas nos vazios.

    Função pura (testada à parte): não muda a lista recebida.
    """
    tem_hero = any(s.get("section_type") == "HERO" for s in secoes)
    saida: list[dict[str, Any]] = []
    for s in secoes:
        config = dict(s.get("config") or {})
        tipo = s.get("section_type")
        if tipo == "HERO":
            for campo, cor in HERO_ANTIGO.items():
                if _vazio(config.get(campo)):
                    config[campo] = cor
        if not tem_hero:
            if _vazio(config.get("site_brand_color")):
                config["site_brand_color"] = MARCA_SEM_HERO
            if tipo == "GIRAS_CALENDAR" and _vazio(config.get("calendar_highlight_color")):
                config["calendar_highlight_color"] = MARCA_SEM_HERO
        saida.append(config)
    return saida


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Seções de cada site (o site é de um terreiro só; a atualização é pela chave da seção).
    linhas = conn.execute(
        sa.text("SELECT id, site_id, section_type::text AS section_type, config FROM tenant_site_sections ORDER BY site_id")
    ).mappings().all()
    por_site: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for r in linhas:
        por_site[r["site_id"]].append(dict(r))
    for secoes in por_site.values():
        novos = preencher_cores_antigas(secoes)
        for secao, novo in zip(secoes, novos):
            if novo != (secao["config"] or {}):
                conn.execute(
                    sa.text("UPDATE tenant_site_sections SET config = CAST(:c AS jsonb) WHERE id = :id"),
                    {"c": json.dumps(novo), "id": secao["id"]},
                )

    # 2) Versões salvas: o snapshot é a lista de seções do site naquele momento.
    versoes = conn.execute(sa.text("SELECT id, snapshot FROM site_versions")).mappings().all()
    for v in versoes:
        snap = v["snapshot"]
        if not isinstance(snap, list):
            continue
        secoes = [s for s in snap if isinstance(s, dict)]
        novos = preencher_cores_antigas(secoes)
        mudou = False
        for secao, novo in zip(secoes, novos):
            if novo != (secao.get("config") or {}):
                secao["config"] = novo
                mudou = True
        if mudou:
            conn.execute(
                sa.text("UPDATE site_versions SET snapshot = CAST(:s AS jsonb) WHERE id = :id"),
                {"s": json.dumps(snap), "id": v["id"]},
            )


def downgrade() -> None:
    # Nada a desfazer: os valores gravados são os padrões que o código 2.11 já usava para o campo vazio.
    pass
