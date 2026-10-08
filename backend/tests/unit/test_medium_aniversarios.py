"""AM-20 — regras puras dos aniversariantes da corrente (`services/medium_aniversarios.py`)."""
from datetime import date

import pytest

from fastapi.routing import APIRoute, iter_route_contexts

from src.api.dependencies import require_medium, require_not_impersonated
from src.main import create_app
from src.services import medium_aniversarios as ma
from src.services.email.templates.medium_acesso_encerrado import (
    medium_acesso_encerrado_subject,
    medium_acesso_encerrado_text,
    render_medium_acesso_encerrado_email,
)


def test_semana_de_segunda_a_domingo():
    assert ma.semana_de(date(2026, 10, 14)) == (date(2026, 10, 12), date(2026, 10, 18))
    assert ma.semana_de(date(2026, 10, 12)) == (date(2026, 10, 12), date(2026, 10, 18))
    assert ma.semana_de(date(2026, 10, 18)) == (date(2026, 10, 12), date(2026, 10, 18))


def test_29_de_fevereiro_vira_1_de_marco_fora_do_bissexto():
    assert ma.aniversario_no_ano(date(1992, 2, 29), 2027) == date(2027, 3, 1)
    assert ma.aniversario_no_ano(date(1992, 2, 29), 2028) == date(2028, 2, 29)
    assert ma.faz_aniversario_hoje(date(1992, 2, 29), date(2027, 3, 1))
    assert not ma.faz_aniversario_hoje(None, date(2027, 3, 1))


def test_semana_que_cruza_o_ano():
    # Quinta 31/12/2026: semana de 28/12/2026 a 03/01/2027.
    hoje = date(2026, 12, 31)
    assert ma.aniversario_na_semana(date(1990, 1, 2), hoje) == date(2027, 1, 2)
    assert ma.aniversario_na_semana(date(1990, 12, 28), hoje) == date(2026, 12, 28)
    assert ma.aniversario_na_semana(date(1990, 1, 4), hoje) is None
    assert ma.aniversario_na_semana(date(1990, 12, 27), hoje) is None


def test_lista_ordenada_so_com_primeiro_nome_dia_e_mes():
    hoje = date(2026, 10, 14)
    pessoas = [
        ("c", "Caio Lima", date(1979, 10, 18)),
        ("b", "Bia Santos", date(1991, 10, 12)),
        ("x", "Sem Data", None),
        ("f", "Fora Semana", date(1990, 10, 19)),
        ("e", "  ", date(1990, 10, 13)),
        ("eu", "Ana Paula", date(1985, 10, 14)),
    ]
    lista = [a.as_dict() for a in ma.aniversariantes_da_semana(hoje, pessoas, "eu")]
    assert lista == [
        {"primeiro_nome": "Bia", "dia": 12, "mes": 10, "hoje": False, "sou_eu": False},
        {"primeiro_nome": "Ana", "dia": 14, "mes": 10, "hoje": True, "sou_eu": True},
        {"primeiro_nome": "Caio", "dia": 18, "mes": 10, "hoje": False, "sou_eu": False},
    ]
    assert "1985" not in str(lista)


def test_mensagem_padrao_e_da_casa():
    assert ma.mensagem_aniversario("Tenda Luz", "Ana Paula", None) == "A Tenda Luz deseja um feliz aniversário, Ana! Axé!"
    assert ma.mensagem_aniversario("Tenda Luz", "", "  ") == "A Tenda Luz deseja um feliz aniversário! Axé!"
    assert ma.mensagem_aniversario("Tenda Luz", "Ana Paula", "Parabéns, {nome}!") == "Parabéns, Ana!"
    assert ma.mensagem_aniversario("Tenda Luz", "Ana", "Feliz dia!") == "Feliz dia!"


def test_limpar_mensagem():
    assert ma.limpar_mensagem(None) is None
    assert ma.limpar_mensagem("   ") is None
    assert ma.limpar_mensagem(" Axé,\n <b>{nome}</b>! ") == "Axé, {nome}!"
    assert ma.limpar_mensagem("a" * 200) == "a" * 200
    with pytest.raises(ValueError):
        ma.limpar_mensagem("a" * 201)


# ── AM-14: rotas de Meus dados e o e-mail aos administradores ───────────────


def _deps(rota):
    out, pilha = [], list(rota.dependant.dependencies)
    while pilha:
        d = pilha.pop()
        out.append(d.call)
        pilha.extend(d.dependencies)
    return out


def test_rotas_de_meus_dados_sao_minhas_e_recusam_impersonacao():
    rotas = {
        (m, ctx.path): ctx.original_route
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path.startswith("/api/v1/medium/meus-dados")
        for m in ctx.original_route.methods
    }
    assert set(rotas) == {
        ("GET", "/api/v1/medium/meus-dados/exportar"),
        ("POST", "/api/v1/medium/meus-dados/encerrar"),
    }
    for rota in rotas.values():
        deps = _deps(rota)
        assert require_medium in deps and require_not_impersonated in deps
        assert not {p.name for p in rota.dependant.query_params + rota.dependant.path_params}


def test_email_aos_admins_so_com_o_primeiro_nome_e_escapado():
    assert medium_acesso_encerrado_subject("Ana") == "Ana encerrou o acesso à Área do Médium"
    assert medium_acesso_encerrado_subject("") == "Um médium encerrou o acesso à Área do Médium"
    texto = medium_acesso_encerrado_text("Ana", "Tenda Luz", "08/10/2026 às 10:00", "https://x/admin/mediuns")
    assert "O cadastro continua com a casa" in texto and "Médiuns → Acesso à Área" in texto
    html = render_medium_acesso_encerrado_email("<b>Ana</b>", "Tenda & Luz", "hoje", "https://x")
    assert "<b>Ana</b>" not in html and "&lt;b&gt;Ana&lt;/b&gt;" in html and "Tenda &amp; Luz" in html
