"""Unit tests for the waitlist email templates (entry + promotion)."""
from src.services.email.templates.waitlist import (
    generate_waitlist_entry_html,
    generate_waitlist_entry_text,
    generate_waitlist_promotion_html,
    generate_waitlist_promotion_text,
)

_ENTRY_KWARGS = dict(
    consulente_name="Maria Silva",
    gira_name="Gira de Oxalá",
    gira_date="15/07/2026 às 19:00",
    position=3,
    tenant_name="Terreiro Central",
)

_PROMOTION_KWARGS = dict(
    ticket_number="0053",
    consulente_name="Maria Silva",
    gira_name="Gira de Oxalá",
    gira_date="15/07/2026 às 19:00",
    gira_location="Rua Exemplo, 123",
    confirm_link="https://app.example.com/public/waitlist/abc-123/confirm",
    confirmation_hours=24,
    tenant_name="Terreiro Central",
)


class TestWaitlistEntryTemplate:
    def test_html_includes_position_and_names(self):
        html = generate_waitlist_entry_html(**_ENTRY_KWARGS)
        assert "Maria Silva" in html
        assert "Gira de Oxalá" in html
        assert "3º" in html
        assert "Terreiro Central" in html

    def test_text_includes_position(self):
        text = generate_waitlist_entry_text(**_ENTRY_KWARGS)
        assert "3º" in text
        assert "Maria Silva" in text

    def test_html_escapes_consulente_name(self):
        kwargs = {**_ENTRY_KWARGS, "consulente_name": '<script>alert(1)</script>'}
        html = generate_waitlist_entry_html(**kwargs)
        assert "<script>" not in html
        assert "&lt;script&gt;" in html


class TestWaitlistPromotionTemplate:
    def test_html_includes_ticket_number_and_confirm_link(self):
        html = generate_waitlist_promotion_html(**_PROMOTION_KWARGS)
        assert "0053" in html
        assert _PROMOTION_KWARGS["confirm_link"] in html
        assert "24h" in html

    def test_text_includes_confirm_link_and_hours(self):
        text = generate_waitlist_promotion_text(**_PROMOTION_KWARGS)
        assert _PROMOTION_KWARGS["confirm_link"] in text
        assert "24h" in text
        assert "0053" in text

    def test_html_escapes_gira_name(self):
        kwargs = {**_PROMOTION_KWARGS, "gira_name": '<img src=x onerror=alert(1)>'}
        html = generate_waitlist_promotion_html(**kwargs)
        assert "<img src=x" not in html

    def test_uses_gira_location_when_no_tenant_address(self):
        html = generate_waitlist_promotion_html(**_PROMOTION_KWARGS)
        assert "Rua Exemplo, 123" in html
