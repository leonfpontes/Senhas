"""Tests for password hashing and validation."""
import pytest
from unittest.mock import patch

from src.security.password import hash_password, verify_password, validate_password_policy
from src.core.errors import ValidationError


class TestHashPassword:
    """Tests for hash_password function."""

    def test_returns_string(self):
        h = hash_password("SecureP@ss1234")
        assert isinstance(h, str)

    def test_returns_bcrypt_hash(self):
        h = hash_password("SecureP@ss1234")
        assert h.startswith("$2b$") or h.startswith("$2a$")

    def test_different_inputs_different_hashes(self):
        h1 = hash_password("Password1!")
        h2 = hash_password("Password2!")
        assert h1 != h2

    def test_same_input_different_hashes_due_to_salt(self):
        h1 = hash_password("SamePassword1!!")
        h2 = hash_password("SamePassword1!!")
        assert h1 != h2  # bcrypt uses random salt


class TestVerifyPassword:
    """Tests for verify_password function."""

    def test_correct_password_returns_true(self):
        password = "SecureP@ss1234"
        h = hash_password(password)
        assert verify_password(password, h) is True

    def test_wrong_password_returns_false(self):
        h = hash_password("CorrectP@ss123")
        assert verify_password("WrongPass123!!", h) is False

    def test_empty_password_returns_false(self):
        h = hash_password("SecureP@ss1234")
        assert verify_password("", h) is False

    def test_verify_with_known_hash(self):
        password = "TestP@ssword12"
        h = hash_password(password)
        assert verify_password(password, h) is True
        assert verify_password(password + "x", h) is False


class TestValidatePasswordPolicy:
    """Tests for validate_password_policy function."""

    def test_valid_password_passes(self):
        # Should not raise
        validate_password_policy("SecureP@ss1234")

    def test_too_short_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            validate_password_policy("Sh0r!")
        assert "caracteres" in str(exc_info.value.details)

    def test_missing_uppercase_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            validate_password_policy("securep@ss1234")
        assert "maiúscula" in str(exc_info.value.details)

    def test_missing_lowercase_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            validate_password_policy("SECUREP@SS1234")
        assert "minúscula" in str(exc_info.value.details)

    def test_missing_digit_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            validate_password_policy("SecureP@ssword!")
        assert "número" in str(exc_info.value.details)

    def test_missing_symbol_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            validate_password_policy("SecurePassw1234")
        assert "símbolo" in str(exc_info.value.details)

    def test_exactly_min_length_passes(self):
        validate_password_policy("Aa1!xxxxxxxx")  # 12 chars

    def test_multiple_errors_reported(self):
        with pytest.raises(ValidationError) as exc_info:
            validate_password_policy("short")
        errors = exc_info.value.details.get("errors", [])
        assert len(errors) >= 2

    def test_various_special_characters(self):
        for special in ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "-", "_", "=", "+"]:
            password = f"SecurePass12{special}"
            if len(password) >= 12:
                validate_password_policy(password)
