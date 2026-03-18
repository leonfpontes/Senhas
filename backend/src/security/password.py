"""Password security utilities with bcrypt (T021)."""
import re
import bcrypt
from ..core.config import settings
from ..core.errors import ValidationError


BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    """Hash password using bcrypt.
    
    Args:
        password: Plain text password
        
    Returns:
        Hashed password
    """
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash.
    
    Args:
        plain_password: Plain text password
        hashed_password: Hashed password from database
        
    Returns:
        True if password matches, False otherwise
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def validate_password_policy(password: str) -> None:
    """Validate password against security policy.
    
    Policy requirements:
    - Minimum length: 12 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special symbol
    
    Args:
        password: Password to validate
        
    Raises:
        ValidationError: If password doesn't meet requirements
    """
    errors = []
    
    # Minimum length
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        errors.append(f"Mínimo {settings.PASSWORD_MIN_LENGTH} caracteres")
    
    # Uppercase
    if settings.PASSWORD_REQUIRE_UPPERCASE and not re.search(r"[A-Z]", password):
        errors.append("Requer letra maiúscula")
    
    # Lowercase
    if settings.PASSWORD_REQUIRE_LOWERCASE and not re.search(r"[a-z]", password):
        errors.append("Requer letra minúscula")
    
    # Digit
    if settings.PASSWORD_REQUIRE_DIGIT and not re.search(r"\d", password):
        errors.append("Requer número")
    
    # Special character
    if settings.PASSWORD_REQUIRE_SYMBOL and not re.search(r'[!@#$%^&*()\-_=+\[\]{};:\'",.<>?/\\|]', password):
        errors.append("Requer símbolo especial")
    
    if errors:
        raise ValidationError(
            "Senha não atende à política de segurança",
            details={"errors": errors},
        )
