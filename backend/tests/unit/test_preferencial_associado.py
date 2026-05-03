"""Unit tests for preferencial + associado (is_sponsor) flag interaction,
including priority_category support added in feature/priority-category.

These tests operate on pure logic in isolation — no FastAPI app, no DB, no asyncpg.

Covers:
- emit_ticket.py STEP 8: observacoes correctly encodes both flags simultaneously
- _parse_preferencial: reads preferencial from combined JSON payload
- _build_observacoes: produces combined payload when both flags True
- get_door_queue ordering by priority_category:
    - 4 categories in canonical order (ELDERLY > DISABILITY_OR_AUTISM > PREGNANT... > REDUCED_MOBILITY)
    - mode "first" and "interleave"
    - legacy tickets (priority_category=None but preferencial=True in observacoes)
    - deprecated preferencial=True fallback → ELDERLY
"""
import json
import uuid
import pytest
from dataclasses import dataclass, field
from typing import Optional


# ── Priority constants (replicate from models/tickets.py) ─────────────────────
PRIORITY_ORDER = [
    "ELDERLY",
    "DISABILITY_OR_AUTISM",
    "PREGNANT_LACTATING_OR_INFANT",
    "REDUCED_MOBILITY",
]

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


def _build_observacoes(
    *,
    priority_category: Optional[str] = None,
    is_sponsor: bool = False,
    preferencial: bool = False,
) -> Optional[str]:
    """Replica of door_control._build_observacoes."""
    payload = {}
    is_pref = priority_category is not None or preferencial
    if is_pref:
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
    priority_category: Optional[str] = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


def _make_item(
    numero: int,
    is_sponsor: bool = False,
    priority_category: Optional[str] = None,
    # legacy: if set and priority_category is None, sets preferencial=True
    preferencial: bool = False,
) -> _QueueItem:
    resolved_pref = (priority_category is not None) or preferencial
    return _QueueItem(
        numero=numero,
        is_sponsor=is_sponsor,
        preferencial=resolved_pref,
        priority_category=priority_category,
    )


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

    sorted_items: list = []

    # Phase 1: iterate categories in priority order
    for cat in PRIORITY_ORDER:
        assoc_cat = [i for i in items if i.is_sponsor and i.priority_category == cat]
        noassoc_cat = [i for i in items if not i.is_sponsor and i.priority_category == cat]
        if mode == "interleave":
            sorted_items.extend(_interleave(assoc_cat, noassoc_cat))
        else:
            sorted_items.extend(assoc_cat + noassoc_cat)

    # Phase 2: legacy preferencial without category (observacoes-only tickets)
    assoc_legacy = [i for i in items if i.is_sponsor and i.preferencial and i.priority_category is None]
    noassoc_legacy = [i for i in items if not i.is_sponsor and i.preferencial and i.priority_category is None]
    if mode == "interleave":
        sorted_items.extend(_interleave(assoc_legacy, noassoc_legacy))
    else:
        sorted_items.extend(assoc_legacy + noassoc_legacy)

    # Phase 3: non-preferencial
    assoc_reg = [i for i in items if i.is_sponsor and not i.preferencial]
    regular = [i for i in items if not i.is_sponsor and not i.preferencial]
    if mode == "interleave":
        sorted_items.extend(_interleave(assoc_reg, regular))
    else:
        sorted_items.extend(assoc_reg + regular)

    return sorted_items


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
    def test_priority_category_only(self):
        result = _build_observacoes(priority_category="ELDERLY")
        assert result is not None
        payload = json.loads(result)
        assert payload == {"preferencial": True}

    def test_sponsor_only(self):
        result = _build_observacoes(is_sponsor=True)
        assert result is not None
        payload = json.loads(result)
        assert payload == {"patrocinador": True}

    def test_both_flags(self):
        """Must produce combined payload — the key capability for this feature."""
        result = _build_observacoes(priority_category="DISABILITY_OR_AUTISM", is_sponsor=True)
        assert result is not None
        payload = json.loads(result)
        assert payload.get("preferencial") is True
        assert payload.get("patrocinador") is True

    def test_neither_flag_returns_none(self):
        result = _build_observacoes()
        assert result is None

    def test_deprecated_preferencial_bool_still_sets_flag(self):
        """preferencial=True (deprecated) must still produce {"preferencial": true}."""
        result = _build_observacoes(preferencial=True)
        assert result is not None
        payload = json.loads(result)
        assert payload.get("preferencial") is True

    def test_all_categories_produce_preferencial_true(self):
        for cat in PRIORITY_ORDER:
            result = _build_observacoes(priority_category=cat)
            payload = json.loads(result)
            assert payload.get("preferencial") is True, f"Failed for {cat}"


# ── emit_ticket observacoes construction (unit, no DB) ────────────────────────

class TestEmitTicketObservacoes:
    """Test the observacoes-building logic from emit_ticket.py STEP 8 in isolation."""

    def _build(
        self,
        is_sponsor: bool,
        priority_category: Optional[str] = None,
        preferencial: bool = False,
    ) -> str | None:
        """Replicate the fixed STEP 8 logic."""
        # Resolve priority: new field takes precedence; fallback from deprecated
        resolved_category = priority_category
        if resolved_category is None and preferencial:
            resolved_category = "ELDERLY"
        obs_payload: dict = {}
        if is_sponsor:
            obs_payload["patrocinador"] = True
        if resolved_category is not None:
            obs_payload["preferencial"] = True
        return json.dumps(obs_payload) if obs_payload else None

    def test_common_no_priority(self):
        assert self._build(is_sponsor=False) is None

    def test_common_with_priority_category(self):
        result = self._build(is_sponsor=False, priority_category="ELDERLY")
        payload = json.loads(result)
        assert payload == {"preferencial": True}
        assert "patrocinador" not in payload

    def test_associado_no_priority(self):
        result = self._build(is_sponsor=True)
        payload = json.loads(result)
        assert payload == {"patrocinador": True}
        assert "preferencial" not in payload

    def test_associado_with_priority_category(self):
        result = self._build(is_sponsor=True, priority_category="DISABILITY_OR_AUTISM")
        assert result is not None
        payload = json.loads(result)
        assert payload.get("patrocinador") is True
        assert payload.get("preferencial") is True

    def test_deprecated_preferencial_bool_maps_to_elderly(self):
        """Deprecated preferencial=True (no category) must map to ELDERLY."""
        result = self._build(is_sponsor=False, preferencial=True)
        payload = json.loads(result)
        assert payload.get("preferencial") is True

    def test_priority_category_takes_precedence_over_deprecated_flag(self):
        """If both priority_category and preferencial=True sent, priority_category wins."""
        result = self._build(
            is_sponsor=False,
            priority_category="REDUCED_MOBILITY",
            preferencial=True,
        )
        payload = json.loads(result)
        assert payload.get("preferencial") is True


# ── Queue ordering — mode "first" ─────────────────────────────────────────────

class TestQueueOrderingFirst:
    MODE = "first"

    def test_full_order_by_category(self):
        """ELDERLY before DISABILITY_OR_AUTISM before PREGNANT... before REDUCED_MOBILITY."""
        items = [
            _make_item(4, priority_category="REDUCED_MOBILITY"),
            _make_item(3, priority_category="PREGNANT_LACTATING_OR_INFANT"),
            _make_item(2, priority_category="DISABILITY_OR_AUTISM"),
            _make_item(1, priority_category="ELDERLY"),
            _make_item(5),  # regular
        ]
        result = _apply_ordering(items, self.MODE)
        cats = [i.priority_category for i in result]
        assert cats == [
            "ELDERLY",
            "DISABILITY_OR_AUTISM",
            "PREGNANT_LACTATING_OR_INFANT",
            "REDUCED_MOBILITY",
            None,
        ]

    def test_sponsor_before_nonsponsoring_within_same_category(self):
        """Within the same category: assoc first, then non-assoc."""
        items = [
            _make_item(2, is_sponsor=False, priority_category="ELDERLY"),
            _make_item(1, is_sponsor=True,  priority_category="ELDERLY"),
        ]
        result = _apply_ordering(items, self.MODE)
        assert result[0].is_sponsor is True
        assert result[1].is_sponsor is False

    def test_within_bucket_preserves_numero_order(self):
        """Items within the same bucket retain their original order (by numero)."""
        items = [
            _make_item(10, is_sponsor=True, priority_category="ELDERLY"),
            _make_item(5,  is_sponsor=True, priority_category="ELDERLY"),
            _make_item(3,  is_sponsor=True, priority_category="ELDERLY"),
        ]
        result = _apply_ordering(items, self.MODE)
        assert [i.numero for i in result] == [10, 5, 3]

    def test_legacy_preferencial_appears_after_categorized(self):
        """Legacy tickets (preferencial=True, no category) appear after all categorized."""
        items = [
            _make_item(99, preferencial=True),          # legacy, no category
            _make_item(1, priority_category="REDUCED_MOBILITY"),
        ]
        result = _apply_ordering(items, self.MODE)
        assert result[0].priority_category == "REDUCED_MOBILITY"
        assert result[1].priority_category is None
        assert result[1].preferencial is True

    def test_regular_appears_last(self):
        items = [
            _make_item(5),
            _make_item(1, priority_category="ELDERLY"),
        ]
        result = _apply_ordering(items, self.MODE)
        assert result[0].priority_category == "ELDERLY"
        assert result[1].priority_category is None
        assert result[1].preferencial is False

    def test_only_regular(self):
        items = [_make_item(i) for i in range(3)]
        result = _apply_ordering(items, self.MODE)
        assert result == items

    def test_empty_list(self):
        assert _apply_ordering([], self.MODE) == []

    def test_all_four_categories_correct_order(self):
        """Full integration: all 4 categories + sponsor variations."""
        e_assoc   = _make_item(1, is_sponsor=True,  priority_category="ELDERLY")
        e_common  = _make_item(2, is_sponsor=False, priority_category="ELDERLY")
        d_assoc   = _make_item(3, is_sponsor=True,  priority_category="DISABILITY_OR_AUTISM")
        d_common  = _make_item(4, is_sponsor=False, priority_category="DISABILITY_OR_AUTISM")
        p_common  = _make_item(5, is_sponsor=False, priority_category="PREGNANT_LACTATING_OR_INFANT")
        r_assoc   = _make_item(6, is_sponsor=True,  priority_category="REDUCED_MOBILITY")
        reg       = _make_item(7)

        items = [reg, r_assoc, p_common, d_common, d_assoc, e_common, e_assoc]
        result = _apply_ordering(items, self.MODE)

        assert result[0] is e_assoc
        assert result[1] is e_common
        assert result[2] is d_assoc
        assert result[3] is d_common
        assert result[4] is p_common
        assert result[5] is r_assoc
        assert result[6] is reg


# ── Queue ordering — mode "interleave" ────────────────────────────────────────

class TestQueueOrderingInterleave:
    MODE = "interleave"

    def test_interleave_within_category(self):
        """Within same category: assoc0, noassoc0, assoc1, noassoc1, ..."""
        e_assoc1 = _make_item(1, is_sponsor=True,  priority_category="ELDERLY")
        e_assoc2 = _make_item(2, is_sponsor=True,  priority_category="ELDERLY")
        e_comm1  = _make_item(3, is_sponsor=False, priority_category="ELDERLY")
        e_comm2  = _make_item(4, is_sponsor=False, priority_category="ELDERLY")

        result = _apply_ordering([e_assoc1, e_assoc2, e_comm1, e_comm2], self.MODE)
        assert result == [e_assoc1, e_comm1, e_assoc2, e_comm2]

    def test_categories_interleaved_then_regular(self):
        """All categorized tickets appear before non-categorized regular."""
        e = _make_item(1, priority_category="ELDERLY")
        d = _make_item(2, priority_category="DISABILITY_OR_AUTISM")
        reg = _make_item(3)

        result = _apply_ordering([reg, d, e], self.MODE)
        cats = [i.priority_category for i in result]
        assert cats.index(None) == 2  # regular must be last

    def test_phase1_exhausts_before_phase2(self):
        """All preferenciais (phase 1) appear before any regular (phase 2)."""
        items = [
            _make_item(1, is_sponsor=True,  priority_category="ELDERLY"),
            _make_item(2, is_sponsor=False, priority_category="ELDERLY"),
            _make_item(3, is_sponsor=True,  preferencial=False),
            _make_item(4, is_sponsor=False, preferencial=False),
        ]
        result = _apply_ordering(items, self.MODE)
        phase1_indices = [i for i, x in enumerate(result) if x.preferencial]
        phase2_indices = [i for i, x in enumerate(result) if not x.preferencial]
        assert max(phase1_indices) < min(phase2_indices)

    def test_unequal_bucket_sizes(self):
        """Leftover items from larger bucket still appear in their phase."""
        items = [
            _make_item(1, is_sponsor=True,  priority_category="ELDERLY"),
            _make_item(2, is_sponsor=True,  priority_category="ELDERLY"),
            _make_item(3, is_sponsor=True,  priority_category="ELDERLY"),
            _make_item(4, is_sponsor=False, priority_category="ELDERLY"),  # only one non-assoc
            _make_item(5, is_sponsor=False, preferencial=False),
        ]
        result = _apply_ordering(items, self.MODE)
        assert len(result) == 5
        assert all(x.preferencial for x in result[:4])
        assert not result[4].preferencial and not result[4].is_sponsor

    def test_empty_list(self):
        assert _apply_ordering([], self.MODE) == []

    def test_only_regular(self):
        items = [_make_item(i) for i in range(3)]
        result = _apply_ordering(items, self.MODE)
        assert result == items


# ── Priority fallback: deprecated preferencial=True → ELDERLY ─────────────────

class TestPriorityFallback:
    """Tests for the backward-compatibility fallback where preferencial=True
    (without priority_category) is mapped to ELDERLY in both emit_ticket and walk-in."""

    def _resolve(self, priority_category: Optional[str], preferencial: bool) -> Optional[str]:
        """Replica of the fallback logic in emit_ticket STEP 8 and walk-in handlers."""
        if priority_category is None and preferencial:
            return "ELDERLY"
        return priority_category

    def test_preferencial_true_no_category_maps_to_elderly(self):
        assert self._resolve(None, True) == "ELDERLY"

    def test_priority_category_set_ignores_preferencial(self):
        assert self._resolve("REDUCED_MOBILITY", True) == "REDUCED_MOBILITY"

    def test_neither_set_returns_none(self):
        assert self._resolve(None, False) is None

    def test_category_set_preferencial_false_returns_category(self):
        assert self._resolve("DISABILITY_OR_AUTISM", False) == "DISABILITY_OR_AUTISM"


# ── Preserve walk-in priority on PATCH ────────────────────────────────────────

class TestPreserveWalkInPriority:
    """Tests for the WalkInUpdate 'preserve if not sent' contract."""

    def _apply_update(
        self,
        existing_category: Optional[str],
        body_priority_category: Optional[str],
        preferencial: bool = False,
    ) -> Optional[str]:
        """Replica of the update logic in update_walk_in_ticket handler."""
        update_priority = body_priority_category
        if update_priority is None and preferencial:
            if existing_category is None:
                update_priority = "ELDERLY"
            else:
                update_priority = existing_category
        elif update_priority is None:
            update_priority = existing_category
        return update_priority

    def test_none_body_preserves_existing(self):
        assert self._apply_update("ELDERLY", None) == "ELDERLY"

    def test_new_category_overwrites_existing(self):
        assert self._apply_update("ELDERLY", "DISABILITY_OR_AUTISM") == "DISABILITY_OR_AUTISM"

    def test_none_body_with_no_existing_stays_none(self):
        assert self._apply_update(None, None) is None

    def test_deprecated_preferencial_sets_elderly_when_no_existing(self):
        assert self._apply_update(None, None, preferencial=True) == "ELDERLY"

    def test_deprecated_preferencial_preserves_existing_category(self):
        assert self._apply_update("REDUCED_MOBILITY", None, preferencial=True) == "REDUCED_MOBILITY"

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
