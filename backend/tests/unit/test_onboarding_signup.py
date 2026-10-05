"""Cadastro self-service: pergunta "o que você mais precisa resolver"
(principal_dor), validação e gravação em tenant_configs.custom_settings.
"""
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from src.api.v1.public.onboarding import OnboardingRequest, _build_custom_settings
from src.core.onboarding import COMO_CONHECEU_VALUES, PRINCIPAL_DOR_VALUES, read_principal_dor

BASE = {
    "terreiro_nome": "Casa Nova",
    "responsavel_nome": "Maria",
    "email": "maria@example.com",
    "whatsapp": "11999998888",
    "documento": "52998224725",  # CPF válido de teste
    "password": "senhaforte123",
    "aceite_termos": True,
}


def _req(**extra):
    return OnboardingRequest(**{**BASE, **extra})


class TestPrincipalDorSchema:
    @pytest.mark.parametrize("dor", PRINCIPAL_DOR_VALUES)
    def test_accepts_every_known_value(self, dor):
        assert _req(principal_dor=dor).principal_dor == dor

    def test_optional_for_backward_compat(self):
        assert _req().principal_dor is None

    def test_rejects_unknown_value(self):
        with pytest.raises(ValidationError, match="o que você mais precisa resolver"):
            _req(principal_dor="qualquer")


class TestCustomSettings:
    def test_stores_both_answers(self):
        assert _build_custom_settings(_req(como_conheceu="instagram", principal_dor="mediuns")) == {
            "como_conheceu": "instagram",
            "principal_dor": "mediuns",
        }

    def test_stores_only_what_was_answered(self):
        assert _build_custom_settings(_req(principal_dor="senhas")) == {"principal_dor": "senhas"}
        assert _build_custom_settings(_req(como_conheceu="google")) == {"como_conheceu": "google"}

    def test_none_when_nothing_answered(self):
        assert _build_custom_settings(_req()) is None


class TestReadPrincipalDor:
    def test_reads_known_and_ignores_garbage(self):
        assert read_principal_dor({"principal_dor": "estoque"}) == "estoque"
        assert read_principal_dor({"principal_dor": "x"}) is None
        assert read_principal_dor({}) is None
        assert read_principal_dor(None) is None
        assert read_principal_dor("nao-e-dict") is None  # type: ignore[arg-type]


def test_frontend_constants_mirror_backend():
    """frontend/src/constants/onboarding.ts precisa listar os mesmos valores."""
    ts = Path(__file__).resolve().parents[3] / "frontend" / "src" / "constants" / "onboarding.ts"
    content = ts.read_text(encoding="utf-8")

    def values(block_name: str) -> set[str]:
        block = re.search(rf"{block_name}[^=]*=\s*\[(.*?)\]\s*(?:as const)?;", content, re.S)
        assert block, f"{block_name} não encontrado em {ts}"
        return set(re.findall(r"value:\s*'([^']+)'", block.group(1)))

    assert values("PRINCIPAL_DOR_OPTIONS") == set(PRINCIPAL_DOR_VALUES)
    assert values("COMO_CONHECEU_OPTIONS") == set(COMO_CONHECEU_VALUES)
