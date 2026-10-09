"""F-05/AM-19 — regras puras da ficha espiritual (sem banco).

- versão do texto de consentimento espelhada no frontend;
- modelos de Umbanda e Candomblé conservadores (só o orixá de cabeça visível ao médium, nenhum
  campo com sugestão);
- normalização de valor por tipo, opções de lista, chave do campo;
- feature fora do grupo padrão e no plano Pro;
- `MediumResponse` (cadastro de médiuns) sem nenhuma coluna de consentimento/ficha;
- e-mail de autorização retirada discreto;
- toda rota do painel com o gate de plano e o grupo FICHA_ESPIRITUAL; toda rota da Área com o
  gate da ficha.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest

from src.core.errors import ValidationError
from src.models.ficha_espiritual import FichaCampo
from src.models.permission_groups import FEATURES_FORA_DO_GRUPO_PADRAO, PermissionFeature
from src.services import ficha_espiritual as fe
from src.services.plan_features import PlanType, feature_min_plan

FRONTEND = Path(__file__).resolve().parents[3] / "frontend" / "src" / "constants" / "fichaEspiritual.ts"


def _campo(tipo: str, opcoes=None) -> FichaCampo:
    return FichaCampo(id=uuid.uuid4(), tenant_id=uuid.uuid4(), chave="x", rotulo="Campo", tipo=tipo, opcoes=opcoes)


def test_versao_do_consentimento_espelhada_no_frontend():
    m = re.search(r"FICHA_CONSENTIMENTO_VERSAO = '([^']+)'", FRONTEND.read_text(encoding="utf-8"))
    assert m and m.group(1) == fe.CONSENTIMENTO_FICHA_VERSAO


def test_modelos_sao_conservadores():
    for tradicao, modelo in fe.MODELOS.items():
        visiveis = [c[1] for c in modelo["campos"] if c[3]]
        assert visiveis == ["Orixá de cabeça"], tradicao
        chaves = [c[0] for c in modelo["campos"]]
        assert len(chaves) == len(set(chaves))
    todas = [c[0] for m in fe.MODELOS.values() for c in m["campos"]]
    assert len(todas) == len(set(todas))  # aplicar os dois modelos não colide


@pytest.mark.parametrize(
    "rotulo,chave",
    [("Orixá de cabeça", "orixa_de_cabeca"), ("  Guia/Frente!! ", "guia_frente"), ("***", "campo")],
)
def test_chave_de(rotulo, chave):
    assert fe.chave_de(rotulo) == chave


def test_normalizar_valor_por_tipo():
    assert fe.normalizar_valor(_campo("texto"), "  <b>Oxóssi</b> ") == "Oxóssi"
    assert fe.normalizar_valor(_campo("texto"), "   ") is None
    assert fe.normalizar_valor(_campo("data"), "2019-03-10") == "2019-03-10"
    with pytest.raises(ValidationError):
        fe.normalizar_valor(_campo("data"), "10/03/2019")
    assert fe.normalizar_valor(_campo("sim_nao"), "SIM") == "sim"
    with pytest.raises(ValidationError):
        fe.normalizar_valor(_campo("sim_nao"), "talvez")
    lista = _campo("lista", ["Ketu", "Angola"])
    assert fe.normalizar_valor(lista, "ketu") == "Ketu"
    with pytest.raises(ValidationError):
        fe.normalizar_valor(lista, "Jeje")
    with pytest.raises(ValidationError):
        fe.normalizar_valor(_campo("texto"), "x" * 501)


def test_opcoes_da_lista():
    assert fe.limpar_opcoes("texto", ["a"]) is None
    assert fe.limpar_opcoes("lista", [" Ketu ", "ketu", "", "Angola"]) == ["Ketu", "Angola"]
    with pytest.raises(ValidationError):
        fe.limpar_opcoes("lista", [])


def test_consentimento_registrar_e_revogar():
    from src.models import Medium

    m = Medium(nome="Ana", tenant_id=uuid.uuid4())
    assert not fe.tem_consentimento(m)
    with pytest.raises(fe.FichaSemConsentimentoError):
        fe.exigir_consentimento(m)
    user = uuid.uuid4()
    fe.registrar_consentimento(m, user)
    assert fe.tem_consentimento(m) and m.consentimento_dado_religioso_por == user
    assert m.consentimento_dado_religioso_versao == fe.CONSENTIMENTO_FICHA_VERSAO
    assert fe.revogar_consentimento(m) is True
    assert not fe.tem_consentimento(m) and m.consentimento_dado_religioso_revogado_em is not None
    assert m.consentimento_dado_religioso_por is None
    assert fe.revogar_consentimento(m) is False
    with pytest.raises(ValidationError):
        fe.conferir_versao("0")


def test_feature_fora_do_grupo_padrao_e_no_pro():
    assert PermissionFeature.FICHA_ESPIRITUAL in FEATURES_FORA_DO_GRUPO_PADRAO
    assert feature_min_plan("ficha_espiritual") == PlanType.PRO


def test_cadastro_de_mediuns_nao_expoe_ficha_nem_consentimento():
    from src.api.v1.admin.mediuns import MediumCreate, MediumResponse, MediumUpdate

    for schema in (MediumResponse, MediumCreate, MediumUpdate):
        assert not any("consentimento" in f or "ficha" in f for f in schema.model_fields), schema


def test_email_de_autorizacao_retirada_e_discreto():
    from src.services.email.templates.ficha_autorizacao_retirada import (
        ficha_autorizacao_retirada_subject,
        render_ficha_autorizacao_retirada_email,
    )

    html = render_ficha_autorizacao_retirada_email("Tenda <Luz>", "https://x/admin/mediuns/ficha")
    texto = (ficha_autorizacao_retirada_subject("Tenda Luz") + html).lower()
    assert "tenda &lt;luz&gt;" in texto
    for proibido in ("orixá", "religi", "umbanda", "candomblé", "espiritual", "obrigação"):
        assert proibido not in texto


def _deps(route) -> list:
    return [d.dependency for d in route.dependencies]


def test_rotas_do_painel_tem_plano_e_grupo_ficha():
    from src.api.v1.admin.ficha_espiritual import router

    assert any(getattr(d.dependency, "plan_feature", None) == "ficha_espiritual" for d in router.dependencies)
    for route in router.routes:
        closures = [
            c.cell_contents
            for dep in _deps(route)
            for c in (getattr(dep, "__closure__", None) or ())
        ]
        assert PermissionFeature.FICHA_ESPIRITUAL in closures, route.path


def test_rotas_da_area_exigem_a_ficha_no_plano():
    from src.api.v1.medium.ficha import require_ficha_na_area, router

    for route in router.routes:
        nomes = {getattr(d.call, "__name__", "") for d in route.dependant.dependencies}
        assert require_ficha_na_area.__name__ in nomes, route.path
        if "GET" not in route.methods:
            assert "require_not_impersonated" in nomes, route.path
