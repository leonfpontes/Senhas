# Templates module
from src.services.email.templates.ticket_emission import (
    generate_ticket_emission_html,
    generate_plain_text_fallback,
)

__all__ = [
    "generate_ticket_emission_html",
    "generate_plain_text_fallback",
]
