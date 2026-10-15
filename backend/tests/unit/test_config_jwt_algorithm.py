"""Pentest L6: ALGORITHM do JWT só aceita HMAC (allowlist)."""

import pytest
from pydantic import ValidationError

from src.core.config import Settings


@pytest.mark.parametrize("alg", ["HS256", "HS384", "HS512"])
def test_aceita_hmac(alg):
    assert Settings(ALGORITHM=alg).ALGORITHM == alg


@pytest.mark.parametrize("alg", ["none", "RS256", "ES256", "hs256", ""])
def test_recusa_fora_da_allowlist(alg):
    with pytest.raises(ValidationError):
        Settings(ALGORITHM=alg)
