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
    "password": "Senha-forte-123",
    "como_conheceu": "google",
    "principal_dor": "senhas",
    "aceite_termos": True,
}


def _req(**extra):
    return OnboardingRequest(**{**BASE, **extra})


class TestPrincipalDorSchema:
    @pytest.mark.parametrize("dor", PRINCIPAL_DOR_VALUES)
    def test_accepts_every_known_value(self, dor):
        assert _req(principal_dor=dor).principal_dor == dor

    @pytest.mark.parametrize("campo,mensagem", [
        ("principal_dor", "Conte o que você mais precisa resolver"),
        ("como_conheceu", "Conte como você conheceu o GiraHub"),
    ])
    @pytest.mark.parametrize("ausente", ["omitido", None, ""])
    def test_both_questions_are_required_with_clear_message(self, campo, mensagem, ausente):
        body = {k: v for k, v in BASE.items() if k != campo}
        if ausente != "omitido":
            body[campo] = ausente
        with pytest.raises(ValidationError, match=mensagem) as exc:
            OnboardingRequest(**body)
        assert [e["loc"] for e in exc.value.errors()] == [(campo,)]

    def test_still_learning_and_other_are_valid_answers(self):
        r = _req(principal_dor="outro", como_conheceu="outro")
        assert (r.principal_dor, r.como_conheceu) == ("outro", "outro")

    def test_rejects_unknown_value(self):
        with pytest.raises(ValidationError, match="o que você mais precisa resolver"):
            _req(principal_dor="qualquer")


class TestSignupPasswordAndEmail:
    """Cadastro usa a mesma política de senha do resto do sistema e grava o
    e-mail de login em minúsculas."""

    def test_rejects_password_that_only_has_8_chars(self):
        with pytest.raises(ValidationError, match="política de segurança"):
            _req(password="senhaforte123")

    def test_accepts_policy_compliant_password(self):
        assert _req(password="Outra-Senha-456").password == "Outra-Senha-456"

    def test_email_is_lowercased(self):
        assert _req(email="Maria.Silva@Example.COM").email == "maria.silva@example.com"


class TestContaExistente:
    """`conta_existente=True`: `password` é a senha de uma conta que já existe em outro
    terreiro (2026-10-08) — pode ser anterior à regra atual, então a regra não se aplica."""

    def test_default_is_false_and_policy_applies(self):
        assert _req().conta_existente is False
        with pytest.raises(ValidationError, match="política de segurança"):
            _req(password="antiga123")

    def test_existing_account_password_skips_policy(self):
        r = _req(conta_existente=True, password="antiga123")
        assert (r.conta_existente, r.password) == (True, "antiga123")

    def test_existing_account_password_cannot_be_empty_or_beyond_bcrypt(self):
        with pytest.raises(ValidationError, match="Digite a senha da sua conta GiraHub") as exc:
            _req(conta_existente=True, password="")
        assert [e["loc"] for e in exc.value.errors()] == [("password",)]
        with pytest.raises(ValidationError, match="Senha muito longa"):
            _req(conta_existente=True, password="a" * 73)

    def test_flag_is_declared_before_password(self):
        # O validador da senha lê `conta_existente` em info.data: a ordem dos campos importa.
        campos = list(OnboardingRequest.model_fields)
        assert campos.index("conta_existente") < campos.index("password")


class TestCustomSettings:
    def test_stores_both_answers(self):
        assert _build_custom_settings(_req(como_conheceu="instagram", principal_dor="mediuns")) == {
            "como_conheceu": "instagram",
            "principal_dor": "mediuns",
        }

    def test_stores_only_what_was_answered(self):
        # Corpo montado sem validação (as duas respostas são obrigatórias no schema): a
        # função continua tolerante a ausência para quem a chamar com dados antigos.
        parcial = OnboardingRequest.model_construct(**{**BASE, "como_conheceu": None})
        assert _build_custom_settings(parcial) == {"principal_dor": "senhas"}
        vazio = OnboardingRequest.model_construct(**{**BASE, "como_conheceu": None, "principal_dor": None})
        assert _build_custom_settings(vazio) is None


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
