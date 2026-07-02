"""Tests for the 'Recados' block in ticket emission emails (Gira.recados).

Recados is an optional free-text field on Gira (investment amount, donation
items, notices) that should appear as its own section in the ticket-emission
email — HTML and plain text — only when non-blank, for both the sponsor and
regular templates.
"""
from src.services.email.templates.ticket_emission import (
    generate_ticket_emission_html,
    generate_plain_text_fallback,
)

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


class TestHtmlRecadosBlockRegular:
    def test_block_appears_with_content(self):
        html = generate_ticket_emission_html(
            **_BASE_KWARGS, recados="Investimento sugerido: R$ 20."
        )
        assert "Recados" in html
        assert "Investimento sugerido: R$ 20." in html

    def test_block_absent_when_none(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS, recados=None)
        assert "Recados" not in html

    def test_block_absent_when_empty_string(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS, recados="")
        assert "Recados" not in html

    def test_block_absent_when_whitespace_only(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS, recados="   \n  ")
        assert "Recados" not in html

    def test_block_absent_when_omitted(self):
        """Backward compatibility: existing callers that don't pass recados
        at all must keep working exactly as before."""
        html = generate_ticket_emission_html(**_BASE_KWARGS)
        assert "Recados" not in html

    def test_content_is_html_escaped(self):
        html = generate_ticket_emission_html(
            **_BASE_KWARGS, recados="<script>alert(1)</script> & \"quote\""
        )
        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;" in html
        assert "&amp;" in html

    def test_line_breaks_preserved(self):
        html = generate_ticket_emission_html(
            **_BASE_KWARGS, recados="Linha 1\nLinha 2"
        )
        assert "Linha 1<br>Linha 2" in html

    def test_leading_trailing_whitespace_stripped(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS, recados="  Trazer vela.  ")
        assert ">Trazer vela.<" in html


class TestHtmlRecadosBlockSponsor:
    def test_block_appears_with_content(self):
        html = generate_ticket_emission_html(
            **_BASE_KWARGS, is_sponsor=True, recados="Item de doação: 1kg de arroz."
        )
        assert "Recados" in html
        assert "Item de doação: 1kg de arroz." in html

    def test_block_absent_when_blank(self):
        html = generate_ticket_emission_html(**_BASE_KWARGS, is_sponsor=True, recados="")
        assert "Recados" not in html


class TestPlainTextRecadosBlock:
    def test_section_appears_with_content(self):
        text = generate_plain_text_fallback(
            **_TEXT_KWARGS, recados="Investimento sugerido: R$ 20."
        )
        assert "Recados:" in text
        assert "Investimento sugerido: R$ 20." in text

    def test_section_absent_when_none(self):
        text = generate_plain_text_fallback(**_TEXT_KWARGS, recados=None)
        assert "Recados:" not in text

    def test_section_absent_when_blank(self):
        text = generate_plain_text_fallback(**_TEXT_KWARGS, recados="   ")
        assert "Recados:" not in text

    def test_section_absent_when_omitted(self):
        text = generate_plain_text_fallback(**_TEXT_KWARGS)
        assert "Recados:" not in text

    def test_sponsor_variant_also_includes_recados(self):
        text = generate_plain_text_fallback(
            **_TEXT_KWARGS, is_sponsor=True, recados="Traga uma vela branca."
        )
        assert "Recados:" in text
        assert "Traga uma vela branca." in text
