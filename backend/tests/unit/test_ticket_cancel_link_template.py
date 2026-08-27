"""Tests for the self-service cancel link block in ticket emission emails.

The "Cancelar minha senha" block must appear — HTML and plain text, sponsor and
regular variants — only when the caller passes cancel_link, and never for the
waitlist-entry email (which doesn't hold a slot to release).

Also covers the cancellation confirmation email templates.
"""
from src.services.email.templates.ticket_cancelled import (
    generate_ticket_cancelled_html,
    generate_ticket_cancelled_text,
)
from src.services.email.templates.ticket_emission import (
    generate_plain_text_fallback,
    generate_ticket_emission_html,
)

_CANCEL_LINK = "https://girahub.com.br/public/ticket/abc-123/cancelar"

_BASE_KWARGS = dict(
    ticket_number="0001",
    consulente_name="Maria Silva",
    gira_name="Gira de Caboclos",
    gira_date="01/07/2026 às 19:00",
    gira_location="",
    rescue_link="https://girahub.com.br/public/x/ticket/1",
    tenant_name="Templo Modelo",
    tenant_logo_url="",
    tenant_color="#2E7D32",
    tenant_address="Rua das Oliveiras, 100",
    primary_color="#2E7D32",
    secondary_color="#1B5E20",
    consulente_email="maria@example.com",
    consulente_phone="",
)

_TEXT_KWARGS = dict(
    ticket_number="0001",
    consulente_name="Maria Silva",
    gira_name="Gira de Caboclos",
    gira_date="01/07/2026 às 19:00",
    gira_location="",
    rescue_link="https://girahub.com.br/public/x/ticket/1",
    tenant_address="Rua das Oliveiras, 100",
    tenant_name="Templo Modelo",
    consulente_email="maria@example.com",
    consulente_phone="",
)


class TestHtmlCancelBlock:
    def test_regular_variant_renders_link(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS, cancel_link=_CANCEL_LINK)
        assert "Cancelar minha senha" in html
        assert _CANCEL_LINK in html

    def test_sponsor_variant_renders_link(self):
        html = generate_ticket_emission_html(
            **_BASE_KWARGS, is_sponsor=True, cancel_link=_CANCEL_LINK
        )
        assert "Cancelar minha senha" in html
        assert _CANCEL_LINK in html

    def test_absent_when_not_passed(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS)
        assert "Cancelar minha senha" not in html

    def test_absent_when_none(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS, cancel_link=None)
        assert "Cancelar minha senha" not in html


class TestTextCancelBlock:
    def test_renders_link(self):
        text = generate_plain_text_fallback(**_TEXT_KWARGS, cancel_link=_CANCEL_LINK)
        assert "Não vai poder comparecer?" in text
        assert _CANCEL_LINK in text

    def test_absent_when_not_passed(self):
        text = generate_plain_text_fallback(**_TEXT_KWARGS)
        assert "Não vai poder comparecer?" not in text


class TestCancelledConfirmationTemplates:
    def test_html_contains_number_and_gira(self):
        html = generate_ticket_cancelled_html(
            ticket_number="0042",
            consulente_name="Maria Silva",
            gira_name="Gira de Caboclos",
            gira_date="01/07/2026 às 19:00",
            tenant_name="Templo Modelo",
        )
        assert "SENHA CANCELADA" in html
        assert "0042" in html
        assert "Gira de Caboclos" in html

    def test_html_escapes_user_content(self):
        html = generate_ticket_cancelled_html(
            ticket_number="0042",
            consulente_name="<script>alert(1)</script>",
            gira_name="Gira",
            gira_date="",
            tenant_name="Templo",
        )
        assert "<script>" not in html

    def test_text_contains_number_and_gira(self):
        text = generate_ticket_cancelled_text(
            ticket_number="0042",
            consulente_name="Maria Silva",
            gira_name="Gira de Caboclos",
            gira_date="01/07/2026 às 19:00",
            tenant_name="Templo Modelo",
        )
        assert "SENHA CANCELADA" in text
        assert "0042" in text
        assert "Gira de Caboclos" in text
