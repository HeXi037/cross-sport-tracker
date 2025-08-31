import os, sys
import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.scoring import padel, bowling
from app.services import validate_set_scores, ValidationError


def test_padel_game_win():
    state = padel.init_state({})
    for _ in range(4):
        state = padel.apply({"type": "POINT", "by": "A"}, state)
    summary = padel.summary(state)
    assert summary["games"]["A"] == 1
    assert summary["config"]["goldenPoint"] is False


def test_padel_golden_point_game_win():
    state = padel.init_state({"goldenPoint": True})
    for _ in range(3):
        state = padel.apply({"type": "POINT", "by": "A"}, state)
        state = padel.apply({"type": "POINT", "by": "B"}, state)
    state = padel.apply({"type": "POINT", "by": "A"}, state)
    summary = padel.summary(state)
    assert summary["games"]["A"] == 1
    assert summary["points"] == {"A": 0, "B": 0}
    assert summary["config"]["goldenPoint"] is True


def test_bowling_simple_score():
    state = bowling.init_state({})
    for _ in range(20):
        state = bowling.apply({"type": "ROLL", "pins": 1}, state)
    summary = bowling.summary(state)
    assert summary["total"] == 20


def test_record_sets():
    events, state = padel.record_sets([(6, 4), (6, 2)])
    assert state["sets"]["A"] == 2
    assert len(events) == (6 + 4 + 6 + 2) * 4


def test_validate_set_scores_negative():
    with pytest.raises(ValidationError, match=">= 0"):
        validate_set_scores([{"A": 6, "B": -4}])


def test_validate_set_scores_tie():
    with pytest.raises(ValidationError, match="cannot be a tie"):
        validate_set_scores([{"A": 4, "B": 4}])
