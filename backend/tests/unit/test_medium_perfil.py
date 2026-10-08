"""AM-13 — Perfil do médium: regras sem banco (schema fechado, campos travados, normalização,
frase da auditoria, token da troca de e-mail, e-mails discretos e guards das rotas).

O comportamento HTTP com Postgres real está em tests/integration_pg/test_am13_perfil.py.
"""
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.routing import APIRoute, iter_route_contexts
from pydantic import ValidationError as PydanticValidationError

from src.api.dependencies import require_medium, require_not_impersonated
from src.api.v1.medium.perfil import DadosDaCasa, MediumPerfilResponse, MediumPerfilUpdate, TrocarEmailRequest
from src.core import public_links as pl
from src.core.reserved_slugs import RESERVED_SLUGS
from src.main import create_app
from src.services.email.templates.email_troca import (
    email_troca_aviso_subject,
    email_troca_aviso_text,
    email_troca_confirmacao_subject,
    email_troca_confirmacao_text,
    render_email_troca_aviso,
    render_email_troca_confirmacao,
)
from src.services.medium_perfil import (
    EMAIL_TROCA_VALIDADE_HORAS,
    campos_alterados,
    frase_auditoria,
    grupos_alterados,
    hash_token,
    iniciar_troca,
    limpar_troca_pendente,
    normalizar_cep,
    normalizar_telefone,
    texto_curto,
    tipo_do_medium,
    troca_pendente_valida,
    validar_nascimento,
)

REPO = Path(__file__).resolve().parents[3]

# ── Schema da resposta: lista fechada ─────────────────────────────────────────

CAMPOS_DA_RESPOSTA = {
    "casa",
    "telefone",
    "data_nascimento",
    "cep",
    "logradouro",
    "numero",
    "bairro",
    "cidade",
    "foto_url",
    "email",
    "email_pendente",
    "email_pendente_expira_em",
    "mostrar_aniversario",  # AM-20: o opt-in do próprio médium (só sim/não)
}
INTERNOS = {"observacoes", "data_saida", "registrado_por", "user_id", "tenant_id", "deleted_at",
            "area_consentimento_em", "password_hash", "reset_token_hash", "email_pendente_token_hash"}


def test_resposta_do_perfil_e_uma_lista_fechada_sem_campos_internos():
    assert set(MediumPerfilResponse.model_fields) == CAMPOS_DA_RESPOSTA
    assert set(DadosDaCasa.model_fields) == {"nome", "data_entrada", "tipo", "isento_mensalidade"}
    todos = set(MediumPerfilResponse.model_fields) | set(DadosDaCasa.model_fields)
    assert not todos & INTERNOS


def test_update_aceita_so_os_campos_do_medium():
    assert set(MediumPerfilUpdate.model_fields) == {
        "telefone", "data_nascimento", "cep", "logradouro", "numero", "bairro", "cidade",
    }
    MediumPerfilUpdate(telefone="(11) 98765-4321")


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("nome", "Outro Nome"),
        ("data_entrada", "2020-01-01"),
        ("is_atendimento", True),
        ("mensalidade_isento", True),
        ("observacoes", "x"),
        ("data_saida", "2026-01-01"),
        ("email", "novo@example.com"),
        ("medium_id", "00000000-0000-0000-0000-000000000000"),
    ],
)
def test_update_recusa_campo_da_casa_ou_desconhecido(campo, valor):
    with pytest.raises(PydanticValidationError):
        MediumPerfilUpdate(**{campo: valor})


def test_troca_de_email_exige_senha_e_email_valido():
    with pytest.raises(PydanticValidationError):
        TrocarEmailRequest(novo_email="nao-e-email", senha_atual="x")
    with pytest.raises(PydanticValidationError):
        TrocarEmailRequest(novo_email="ok@example.com")


# ── Normalização (mesmo formato do painel) ───────────────────────────────────


def test_telefone_e_cep_so_com_digitos():
    assert normalizar_telefone("(11) 98765-4321") == "11987654321"
    assert normalizar_telefone("  ") is None
    assert normalizar_telefone(None) is None
    with pytest.raises(ValueError):
        normalizar_telefone("1234")
    assert normalizar_cep("01310-100") == "01310100"
    assert normalizar_cep("") is None
    with pytest.raises(ValueError):
        normalizar_cep("0131")


def test_texto_curto_apara_e_limita():
    assert texto_curto("  Rua   das  Flores ", 255) == "Rua das Flores"
    assert texto_curto("   ", 10) is None
    with pytest.raises(ValueError):
        texto_curto("x" * 21, 20)


def test_nascimento_nao_pode_ser_no_futuro():
    hoje = date(2026, 10, 7)
    assert validar_nascimento(date(1990, 5, 1), hoje) == date(1990, 5, 1)
    assert validar_nascimento(None, hoje) is None
    with pytest.raises(ValueError):
        validar_nascimento(date(2026, 10, 8), hoje)
    with pytest.raises(ValueError):
        validar_nascimento(date(1850, 1, 1), hoje)


# ── O que mudou e a frase da auditoria (sem valores) ─────────────────────────


def _medium(**kw):
    base = dict(telefone="11987654321", data_nascimento=None, cep=None, logradouro=None, numero=None,
                bairro=None, cidade=None, is_atendimento=True)
    base.update(kw)
    return SimpleNamespace(**base)


def test_campos_alterados_ignora_o_que_nao_mudou():
    m = _medium()
    assert campos_alterados(m, {"telefone": "11987654321"}) == []
    assert campos_alterados(m, {"telefone": "11900000000", "cep": "01310100", "cidade": "São Paulo"}) == [
        "telefone", "cep", "cidade",
    ]


def test_frase_da_auditoria():
    assert grupos_alterados(["telefone"]) == ["telefone"]
    assert grupos_alterados(["cep", "cidade", "numero"]) == ["endereco"]
    assert frase_auditoria(["telefone"]) == "médium atualizou o telefone"
    assert frase_auditoria(["telefone", "endereco"]) == "médium atualizou o telefone e o endereço"
    assert frase_auditoria(["telefone", "endereco", "data_nascimento"]) == (
        "médium atualizou o telefone, o endereço e a data de nascimento"
    )


def test_tipo_do_medium():
    assert tipo_do_medium(_medium(is_atendimento=True)) == "atendimento"
    assert tipo_do_medium(_medium(is_atendimento=False)) == "cambone"


# ── Token da troca de e-mail ──────────────────────────────────────────────────


def _conta():
    return SimpleNamespace(email="ana@example.com", email_pendente=None, email_pendente_token_hash=None,
                           email_pendente_expira_em=None)


def test_iniciar_troca_guarda_so_o_hash_e_vale_24h():
    u = _conta()
    agora = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)
    token = iniciar_troca(u, "nova@example.com", agora)
    assert len(token) >= 40
    assert u.email == "ana@example.com"  # só muda na confirmação
    assert u.email_pendente == "nova@example.com"
    assert u.email_pendente_token_hash == hash_token(token) != token
    assert u.email_pendente_expira_em == agora + timedelta(hours=EMAIL_TROCA_VALIDADE_HORAS)
    assert EMAIL_TROCA_VALIDADE_HORAS == 24
    assert troca_pendente_valida(u, agora + timedelta(hours=23))
    assert not troca_pendente_valida(u, agora + timedelta(hours=24, seconds=1))


def test_novo_pedido_invalida_o_link_anterior_e_limpar_zera_tudo():
    u = _conta()
    primeiro = iniciar_troca(u, "a@example.com")
    segundo = iniciar_troca(u, "b@example.com")
    assert u.email_pendente_token_hash == hash_token(segundo) != hash_token(primeiro)
    limpar_troca_pendente(u)
    assert (u.email_pendente, u.email_pendente_token_hash, u.email_pendente_expira_em) == (None, None, None)
    assert not troca_pendente_valida(u)


# ── E-mails discretos (§6.8) ──────────────────────────────────────────────────

TERMOS_RELIGIOSOS = ("médium", "medium", "gira", "giras", "terreiro", "orixá", "umbanda", "corrente")


def test_emails_da_troca_sao_discretos():
    link = "https://girahub.com.br/confirmar-email/tok"
    textos = [
        email_troca_confirmacao_subject("Casa Luz"),
        email_troca_confirmacao_text("Ana", "Casa Luz", link, 24),
        render_email_troca_confirmacao("Ana", "Casa Luz", link, 24),
        email_troca_aviso_subject("Casa Luz"),
        email_troca_aviso_text("Ana", "Casa Luz", "no•••@example.com"),
        render_email_troca_aviso("Ana", "Casa Luz", "no•••@example.com"),
    ]
    for t in textos:
        for termo in TERMOS_RELIGIOSOS:
            assert not re.search(rf"\b{termo}\b", t.lower()), (termo, t[:80])
    assert link in textos[1] and link in textos[2]
    assert "24 horas" in textos[1]


def test_aviso_escapa_html_do_nome_da_casa():
    html = render_email_troca_aviso("<b>", "<script>x</script>", "a•••@x.com")
    assert "<script>" not in html


# ── Link público e página do frontend ─────────────────────────────────────────


def test_link_de_confirmacao_tem_pagina_e_slug_reservado():
    assert pl.confirmar_email_link("https://girahub.com.br/", "abc") == "https://girahub.com.br/confirmar-email/abc"
    pagina = REPO / "frontend" / "src" / "pages" / "confirmar-email" / "[token].tsx"
    assert pagina.exists()
    assert "confirmar-email" in RESERVED_SLUGS


# ── Rotas: só "minhas", escrita recusada sob impersonação ─────────────────────


def _deps(rota):
    out, pilha = [], list(rota.dependant.dependencies)
    while pilha:
        d = pilha.pop()
        out.append(d.call)
        pilha.extend(d.dependencies)
    return out


def _rotas():
    return {
        (m, ctx.path): ctx.original_route
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path.startswith("/api/v1/medium/perfil")
        for m in ctx.original_route.methods
    }


def test_rotas_do_perfil():
    rotas = _rotas()
    assert set(rotas) == {
        ("GET", "/api/v1/medium/perfil"),
        ("PATCH", "/api/v1/medium/perfil"),
        ("POST", "/api/v1/medium/perfil/foto"),
        ("DELETE", "/api/v1/medium/perfil/foto"),
        ("POST", "/api/v1/medium/perfil/senha"),
        ("POST", "/api/v1/medium/perfil/email"),
        ("DELETE", "/api/v1/medium/perfil/email"),
        ("PUT", "/api/v1/medium/perfil/aniversario"),  # AM-20
    }
    for (metodo, _), rota in rotas.items():
        deps = _deps(rota)
        assert require_medium in deps
        nomes = {p.name for p in rota.dependant.query_params + rota.dependant.path_params}
        assert not nomes, nomes  # nada de medium_id na URL
        if metodo == "GET":
            assert require_not_impersonated not in deps
        else:
            assert require_not_impersonated in deps
