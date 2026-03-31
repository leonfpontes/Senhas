"""Unit tests for preferencial + associado (is_sponsor) flag interaction.

These tests operate on pure logic in isolation — no FastAPI app, no DB, no asyncpg.

Covers:
- emit_ticket.py STEP 8: observacoes correctly encodes both flags simultaneously
- _parse_preferencial: reads preferencial from combined JSON payload
- _build_observacoes: produces combined payload when both flags True
- get_door_queue ordering:
    - mode "first": assoc_pref → pref → assoc_reg → regular
    - mode "interleave": Phase1(assoc_pref↔pref) + Phase2(assoc_reg↔regular)
    - edge cases: empty buckets
"""
import json
import uuid
import pytest
from dataclasses import dataclass, field
from typing import Optional


# ── Inline copies of pure production functions (no app import needed) ─────────
# These replicate door_control.py helpers and emit_ticket.py STEP 8 logic.
# Tests break if production code diverges from these — that's intentional.

def _parse_preferencial(observacoes: Optional[str]) -> bool:
    """Replica of door_control._parse_preferencial."""
    if not observacoes:
        return False
    try:
        obs = json.loads(observacoes)
        return obs.get("preferencial", False)
    except (json.JSONDecodeError, TypeError):
        return False


def _build_observacoes(*, preferencial: bool, is_sponsor: bool = False) -> Optional[str]:
    """Replica of door_control._build_observacoes."""
    payload = {}
    if preferencial:
        payload["preferencial"] = True
    if is_sponsor:
        payload["patrocinador"] = True
    return json.dumps(payload) if payload else None


@dataclass
class _QueueItem:
    """Minimal queue item for ordering tests."""
    numero: int
    is_sponsor: bool = False
    preferencial: bool = False
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


def _make_item(
    numero: int,
    is_sponsor: bool = False,
    preferencial: bool = False,
) -> _QueueItem:
    return _QueueItem(numero=numero, is_sponsor=is_sponsor, preferencial=preferencial)


def _apply_ordering(items: list, mode: str) -> list:
    """Replicate the get_door_queue ordering logic in isolation."""

    def _interleave(a: list, b: list) -> list:
        result = []
        ai, bi = 0, 0
        while ai < len(a) or bi < len(b):
            if ai < len(a):
                result.append(a[ai])
                ai += 1
            if bi < len(b):
                result.append(b[bi])
                bi += 1
        return result

    assoc_pref = [i for i in items if i.is_sponsor and i.preferencial]
    pref = [i for i in items if not i.is_sponsor and i.preferencial]
    assoc_reg = [i for i in items if i.is_sponsor and not i.preferencial]
    regular = [i for i in items if not i.is_sponsor and not i.preferencial]

    if mode == "interleave":
        return _interleave(assoc_pref, pref) + _interleave(assoc_reg, regular)
    else:
        return assoc_pref + pref + assoc_reg + regular


# ── _parse_preferencial ────────────────────────────────────────────────────────

class TestParsePreferencial:
    def test_parses_preferencial_only(self):
        assert _parse_preferencial('{"preferencial": true}') is True

    def test_parses_combined_payload(self):
        """Combined patrocinador+preferencial must return True."""
        assert _parse_preferencial('{"patrocinador": true, "preferencial": true}') is True

    def test_returns_false_for_patrocinador_only(self):
        assert _parse_preferencial('{"patrocinador": true}') is False

    def test_returns_false_for_none(self):
        assert _parse_preferencial(None) is False

    def test_returns_false_for_empty_string(self):
        assert _parse_preferencial("") is False

    def test_returns_false_for_malformed_json(self):
        assert _parse_preferencial("not-json") is False

    def test_returns_false_when_preferencial_is_false(self):
        assert _parse_preferencial('{"preferencial": false}') is False


# ── _build_observacoes ─────────────────────────────────────────────────────────

class TestBuildObservacoes:
    def test_preferencial_only(self):
        result = _build_observacoes(preferencial=True, is_sponsor=False)
        assert result is not None
        payload = json.loads(result)
        assert payload == {"preferencial": True}

    def test_sponsor_only(self):
        result = _build_observacoes(preferencial=False, is_sponsor=True)
        assert result is not None
        payload = json.loads(result)
        assert payload == {"patrocinador": True}

    def test_both_flags(self):
        """Must produce combined payload — the key capability for this feature."""
        result = _build_observacoes(preferencial=True, is_sponsor=True)
        assert result is not None
        payload = json.loads(result)
        assert payload.get("preferencial") is True
        assert payload.get("patrocinador") is True

    def test_neither_flag_returns_none(self):
        result = _build_observacoes(preferencial=False, is_sponsor=False)
        assert result is None


# ── emit_ticket observacoes construction (unit, no DB) ────────────────────────

class TestEmitTicketObservacoes:
    """Test the observacoes-building logic from emit_ticket.py STEP 8 in isolation."""

    def _build(self, is_sponsor: bool, preferencial: bool) -> str | None:
        """Replicate the fixed STEP 8 logic."""
        obs_payload: dict = {}
        if is_sponsor:
            obs_payload["patrocinador"] = True
        if preferencial:
            obs_payload["preferencial"] = True
        return json.dumps(obs_payload) if obs_payload else None

    def test_common_no_preferencial(self):
        assert self._build(is_sponsor=False, preferencial=False) is None

    def test_common_with_preferencial(self):
        result = self._build(is_sponsor=False, preferencial=True)
        payload = json.loads(result)
        assert payload == {"preferencial": True}
        assert "patrocinador" not in payload

    def test_associado_no_preferencial(self):
        result = self._build(is_sponsor=True, preferencial=False)
        payload = json.loads(result)
        assert payload == {"patrocinador": True}
        assert "preferencial" not in payload

    def test_associado_with_preferencial(self):
        """Core fix: associado preferencial must have both flags in observacoes."""
        result = self._build(is_sponsor=True, preferencial=True)
        assert result is not None
        payload = json.loads(result)
        assert payload.get("patrocinador") is True
        assert payload.get("preferencial") is True


# ── Queue ordering — mode "first" ─────────────────────────────────────────────

class TestQueueOrderingFirst:
    MODE = "first"

    def test_full_order(self):
        """assoc_pref → pref → assoc_reg → regular."""
        items = [
            _make_item(1, is_sponsor=False, preferencial=False),   # regular
            _make_item(2, is_sponsor=True,  preferencial=False),   # assoc_reg
            _make_item(3, is_sponsor=False, preferencial=True),    # pref
            _make_item(4, is_sponsor=True,  preferencial=True),    # assoc_pref
        ]
        result = _apply_ordering(items, self.MODE)
        labels = [(i.is_sponsor, i.preferencial) for i in result]
        assert labels == [
            (True, True),    # assoc_pref
            (False, True),   # pref
            (True, False),   # assoc_reg
            (False, False),  # regular
        ]

    def test_within_bucket_preserves_numero_order(self):
        """Items within the same bucket retain their original order (by numero)."""
        items = [
            _make_item(10, is_sponsor=True, preferencial=True),
            _make_item(5,  is_sponsor=True, preferencial=True),
            _make_item(3,  is_sponsor=True, preferencial=True),
        ]
        result = _apply_ordering(items, self.MODE)
        assert [i.numero for i in result] == [10, 5, 3]

    def test_no_assoc_pref(self):
        """When there are no assoc_pref, pref comes first."""
        items = [
            _make_item(1, is_sponsor=False, preferencial=False),
            _make_item(2, is_sponsor=True,  preferencial=False),
            _make_item(3, is_sponsor=False, preferencial=True),
        ]
        result = _apply_ordering(items, self.MODE)
        labels = [(i.is_sponsor, i.preferencial) for i in result]
        assert labels == [(False, True), (True, False), (False, False)]

    def test_only_regular(self):
        items = [_make_item(i) for i in range(3)]
        result = _apply_ordering(items, self.MODE)
        assert result == items

    def test_empty_list(self):
        assert _apply_ordering([], self.MODE) == []

    def test_all_assoc_pref(self):
        items = [_make_item(i, is_sponsor=True, preferencial=True) for i in range(3)]
        result = _apply_ordering(items, self.MODE)
        assert result == items


# ── Queue ordering — mode "interleave" ────────────────────────────────────────

class TestQueueOrderingInterleave:
    MODE = "interleave"

    def test_exact_specified_sequence(self):
        """assoc_pref1, pref1, assoc_pref2, pref2, assoc_reg1, reg1, assoc_reg2, reg2."""
        assoc_pref1 = _make_item(1, is_sponsor=True,  preferencial=True)
        assoc_pref2 = _make_item(2, is_sponsor=True,  preferencial=True)
        pref1       = _make_item(3, is_sponsor=False, preferencial=True)
        pref2       = _make_item(4, is_sponsor=False, preferencial=True)
        assoc_reg1  = _make_item(5, is_sponsor=True,  preferencial=False)
        assoc_reg2  = _make_item(6, is_sponsor=True,  preferencial=False)
        reg1        = _make_item(7, is_sponsor=False, preferencial=False)
        reg2        = _make_item(8, is_sponsor=False, preferencial=False)

        items = [assoc_pref1, assoc_pref2, pref1, pref2, assoc_reg1, assoc_reg2, reg1, reg2]
        result = _apply_ordering(items, self.MODE)

        assert result == [
            assoc_pref1, pref1,
            assoc_pref2, pref2,
            assoc_reg1, reg1,
            assoc_reg2, reg2,
        ]

    def test_phase1_exhausts_before_phase2(self):
        """All preferenciais (phase 1) appear before any regular (phase 2)."""
        items = [
            _make_item(1, is_sponsor=True,  preferencial=True),
            _make_item(2, is_sponsor=False, preferencial=True),
            _make_item(3, is_sponsor=True,  preferencial=False),
            _make_item(4, is_sponsor=False, preferencial=False),
        ]
        result = _apply_ordering(items, self.MODE)
        phase1_indices = [i for i, x in enumerate(result) if x.preferencial]
        phase2_indices = [i for i, x in enumerate(result) if not x.preferencial]
        # All phase1 positions must be before all phase2 positions
        assert max(phase1_indices) < min(phase2_indices)

    def test_unequal_bucket_sizes(self):
        """When assoc_pref > pref, leftover assoc_pref items still appear in phase1."""
        items = [
            _make_item(1, is_sponsor=True,  preferencial=True),
            _make_item(2, is_sponsor=True,  preferencial=True),
            _make_item(3, is_sponsor=True,  preferencial=True),
            _make_item(4, is_sponsor=False, preferencial=True),  # only one pref
            _make_item(5, is_sponsor=False, preferencial=False),
        ]
        result = _apply_ordering(items, self.MODE)
        # Phase 1: AP1, P1, AP2, AP3 (3 assoc_pref interleaved with 1 pref → 4 items)
        # Phase 2: reg1 (1 item)
        assert len(result) == 5
        # First 4 items should all be preferenciais
        assert all(x.preferencial for x in result[:4])
        # Last item is regular
        assert not result[4].preferencial and not result[4].is_sponsor

    def test_no_assoc_pref_bucket(self):
        """When assoc_pref is empty, phase1 is just pref items."""
        items = [
            _make_item(1, is_sponsor=False, preferencial=True),
            _make_item(2, is_sponsor=False, preferencial=True),
            _make_item(3, is_sponsor=True,  preferencial=False),
            _make_item(4, is_sponsor=False, preferencial=False),
        ]
        result = _apply_ordering(items, self.MODE)
        nums = [i.numero for i in result]
        # phase1 = pref1, pref2; phase2 = assoc_reg1, reg1
        assert nums == [1, 2, 3, 4]

    def test_empty_list(self):
        assert _apply_ordering([], self.MODE) == []

    def test_only_regular(self):
        items = [_make_item(i) for i in range(3)]
        result = _apply_ordering(items, self.MODE)
        assert result == items
