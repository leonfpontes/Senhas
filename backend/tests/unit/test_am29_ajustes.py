"""AM-29 — ajustes do piloto da Área do Médium (regras puras e contratos).

- "Pôr na escala" com grupos: `planejar_convocacao` (quem entra, quem já estava, quem o tipo não
  alcança; pedido um a um ganha do grupo; ninguém conta duas vezes) e o corpo do POST.
- Início: `pix_disponivel` é só um sim/não (o schema não tem campo de chave).
- Perfil: tirar a foto limpa o binário e o caminho legado.
O comportamento com Postgres real está em `tests/integration_pg/test_am29_ajustes.py`.
"""
import uuid

import pytest
from pydantic import ValidationError

from src.services.presenca import planejar_convocacao

A, B, C, D, E = (uuid.uuid4() for _ in range(5))
G1, G2 = uuid.uuid4(), uuid.uuid4()


def test_grupo_entra_quem_e_elegivel_e_ainda_nao_esta_na_escala():
    plano = planejar_convocacao(
        pedidos=[],
        membros=[(A, G1), (B, G1), (C, G1)],
        elegiveis={A, B},
        na_escala={B},
    )
    assert plano.do_grupo == [(A, G1)]
    assert (plano.novos, plano.ja_estavam) == (1, 1)
    assert plano.fora_da_elegibilidade == [C]
    assert plano.manuais == []


def test_pedido_um_a_um_ganha_do_grupo_e_nao_conta_duas_vezes():
    plano = planejar_convocacao(
        pedidos=[A, D, A],
        membros=[(A, G1), (B, G1), (B, G2), (E, G2)],
        elegiveis={A, B},  # E fora; A também está no grupo mas foi pedido um a um
        na_escala={D},
    )
    assert plano.manuais == [A, D]
    # B está em G1 e G2: entra uma vez, com o primeiro grupo pedido.
    assert plano.do_grupo == [(B, G1)]
    assert plano.fora_da_elegibilidade == [E]
    assert (plano.novos, plano.ja_estavam) == (2, 1)  # A e B novos; D já estava


def test_pedido_um_a_um_nao_passa_pela_elegibilidade():
    plano = planejar_convocacao(pedidos=[C], membros=[(C, G1)], elegiveis=set(), na_escala=set())
    assert plano.manuais == [C] and plano.do_grupo == [] and plano.fora_da_elegibilidade == []
    assert plano.novos == 1


def test_corpo_do_convocar_pede_mediuns_ou_grupos():
    from src.api.v1.admin.atividades_presenca import ConvocarBody

    with pytest.raises(ValidationError):
        ConvocarBody()
    with pytest.raises(ValidationError):
        ConvocarBody(medium_ids=[], grupo_ids=[])
    assert ConvocarBody(grupo_ids=[G1]).medium_ids == []
    assert ConvocarBody(medium_ids=[A]).grupo_ids == []
    with pytest.raises(ValidationError):
        ConvocarBody(grupo_ids=[uuid.uuid4() for _ in range(51)])


def test_resposta_do_convocar_traz_o_resultado():
    from src.api.v1.admin.atividades_presenca import ConvocarResponse, ConvocarResultado, ListaResponse

    assert issubclass(ConvocarResponse, ListaResponse)
    assert set(ConvocarResultado.model_fields) == {
        "novos",
        "ja_estavam",
        "fora_da_elegibilidade",
        "fora_da_elegibilidade_nomes",
    }


def test_inicio_so_diz_se_ha_chave_pix():
    from src.api.v1.medium.inicio import MensalidadeInicio

    campos = set(MensalidadeInicio.model_fields)
    assert "pix_disponivel" in campos
    assert not {c for c in campos if "chave" in c or c in {"pix", "pix_tipo", "copia_e_cola"}}
    assert MensalidadeInicio(mes="2026-10", status="pendente").pix_disponivel is False


def test_tirar_a_foto_limpa_binario_e_caminho_legado():
    from types import SimpleNamespace

    from src.api.v1.auth.profile import clear_profile_photo, has_profile_photo

    user = SimpleNamespace(
        profile_photo_data=b"\xff\xd8", profile_photo_content_type="image/jpeg", profile_photo_url="/uploads/x.jpg"
    )
    assert has_profile_photo(user)
    clear_profile_photo(user)
    assert (user.profile_photo_data, user.profile_photo_content_type, user.profile_photo_url) == (None, None, None)
    assert not has_profile_photo(user)
    assert has_profile_photo(SimpleNamespace(profile_photo_data=None, profile_photo_url="https://x/y.png"))
