"""Duplas da noite (Porta) — regras puras de `services/duplas_gira.py`."""
import uuid
from types import SimpleNamespace

import pytest

from src.core.errors import ValidationError
from src.services.duplas_gira import (
    NAO_VAI,
    PRESENTE,
    PedidoDupla,
    eh_funcao_cambone,
    situacao_na_area,
    sugerir_cambones,
    validar_duplas,
)


def _m(nome, atendimento=True):
    return SimpleNamespace(id=uuid.uuid4(), nome=nome, is_atendimento=atendimento)


@pytest.fixture
def casa():
    rita, carlos, ana, beto = _m("Mãe Rita"), _m("Pai Carlos"), _m("Ana", False), _m("Beto", False)
    return SimpleNamespace(
        rita=rita, carlos=carlos, ana=ana, beto=beto, pessoas={p.id: p for p in (rita, carlos, ana, beto)}
    )


def test_duplas_validas_e_medium_sem_cambone(casa):
    validar_duplas(
        [PedidoDupla(casa.rita.id, casa.ana.id), PedidoDupla(casa.carlos.id, None)],
        casa.pessoas,
    )


def test_cambone_auxilia_um_medium_por_vez(casa):
    with pytest.raises(ValidationError, match="Ana já é cambone de Mãe Rita"):
        validar_duplas(
            [PedidoDupla(casa.rita.id, casa.ana.id), PedidoDupla(casa.carlos.id, casa.ana.id)], casa.pessoas
        )


def test_medium_da_noite_nao_e_cambone(casa):
    with pytest.raises(ValidationError, match="Pai Carlos está trabalhando como médium"):
        validar_duplas(
            [PedidoDupla(casa.rita.id, casa.carlos.id), PedidoDupla(casa.carlos.id, None)], casa.pessoas
        )


def test_so_cambone_nao_trabalha_como_medium(casa):
    with pytest.raises(ValidationError, match="só como cambone"):
        validar_duplas([PedidoDupla(casa.ana.id, None)], casa.pessoas)


def test_medium_repetido_e_fora_do_cadastro(casa):
    with pytest.raises(ValidationError, match="duas vezes"):
        validar_duplas([PedidoDupla(casa.rita.id, None), PedidoDupla(casa.rita.id, casa.ana.id)], casa.pessoas)
    with pytest.raises(ValidationError, match="não está ativo"):
        validar_duplas([PedidoDupla(uuid.uuid4(), None)], casa.pessoas)
    with pytest.raises(ValidationError, match="cambones não está ativo"):
        validar_duplas([PedidoDupla(casa.rita.id, uuid.uuid4())], casa.pessoas)


def test_cambone_de_si_mesmo(casa):
    with pytest.raises(ValidationError, match="si mesmo"):
        validar_duplas([PedidoDupla(casa.rita.id, casa.rita.id)], casa.pessoas)


def test_sugestao_pelo_historico(casa):
    g = [uuid.uuid4() for _ in range(4)]
    historico = [
        (g[0], "Mãe Rita", "Ana"),
        (g[0], "mãe  rita", "ana"),  # grafia diferente casa com o cadastro
        (g[1], "Mãe Rita", "Ana"),
        (g[2], "Mãe Rita", "Beto"),
        (g[3], "Mãe Rita", None),
        (g[0], "Pai Carlos", "Beto"),  # 1 gira só: abaixo do mínimo
        (g[1], "Desconhecido", "Ana"),
    ]
    sugestoes = sugerir_cambones(historico, list(casa.pessoas.values()))
    assert len(sugestoes) == 1
    s = sugestoes[0]
    assert (s.medium_id, s.cambone_id, s.juntos, s.giras_do_medium) == (casa.rita.id, casa.ana.id, 2, 4)


def test_sugestao_ignora_nome_ambiguo(casa):
    outra_ana = _m("Ana", False)
    g = [uuid.uuid4(), uuid.uuid4()]
    historico = [(g[0], "Mãe Rita", "Ana"), (g[1], "Mãe Rita", "Ana")]
    assert sugerir_cambones(historico, [*casa.pessoas.values(), outra_ana]) == []


def _p(**kw):
    base = dict(dispensado_em=None, presenca="nao_registrada", resposta="sem_resposta")
    base.update(kw)
    return SimpleNamespace(**base)


def test_situacao_na_area():
    assert situacao_na_area(_p(resposta="vou")) == "vou"
    assert situacao_na_area(_p(resposta="nao_vou")) == NAO_VAI
    assert situacao_na_area(_p(resposta="nao_vou", presenca="presente")) == PRESENTE
    assert situacao_na_area(_p(resposta="vou", dispensado_em=object())) is None
    assert situacao_na_area(_p()) is None


def test_funcao_cambone():
    assert eh_funcao_cambone("Cambone")
    assert eh_funcao_cambone(" cambones ")
    assert not eh_funcao_cambone("Porteiro")
    assert not eh_funcao_cambone(None)
