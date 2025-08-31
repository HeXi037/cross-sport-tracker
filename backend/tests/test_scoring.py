import os, sys
import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.scoring import padel, bowling
from app.services import validate_set_scores, ValidationError


def test_padel_game_win():
    state = padel.init_state({})
    for _ in range(4):
        state = padel.apply({"type": "POINT", "by": "A"}, state)
    assert state["games"]["A"] == 1


def test_bowling_simple_score():
    state = bowling.init_state({})
    for _ in range(20):
        state = bowling.apply({"type": "ROLL", "pins": 1}, state)
    summary = bowling.summary(state)
    assert summary["total"] == 20


def test_bowling_tenth_frame_strike_bonus_allowed():
    state = bowling.init_state({"tenthFrameBonus": True})
    for _ in range(9 * 2):
        state = bowling.apply({"type": "ROLL", "pins": 0}, state)
    for pins in [10, 3, 4]:
        state = bowling.apply({"type": "ROLL", "pins": pins}, state)
    summary = bowling.summary(state)
    assert summary["frames"][9] == [10, 3, 4]
    assert summary["total"] == 17


def test_bowling_tenth_frame_spare_bonus_allowed():
    state = bowling.init_state({"tenthFrameBonus": True})
    for _ in range(9 * 2):
        state = bowling.apply({"type": "ROLL", "pins": 0}, state)
    for pins in [7, 3, 5]:
        state = bowling.apply({"type": "ROLL", "pins": pins}, state)
    summary = bowling.summary(state)
    assert summary["frames"][9] == [7, 3, 5]
    assert summary["total"] == 15


def test_bowling_tenth_frame_strike_no_bonus():
    state = bowling.init_state({"tenthFrameBonus": False})
    for _ in range(9 * 2):
        state = bowling.apply({"type": "ROLL", "pins": 0}, state)
    state = bowling.apply({"type": "ROLL", "pins": 10}, state)
    with pytest.raises(ValueError, match="no rolls left"):
        bowling.apply({"type": "ROLL", "pins": 0}, state)
    summary = bowling.summary(state)
    assert summary["frames"][9] == [10]
    assert summary["total"] == 10


def test_bowling_tenth_frame_spare_no_bonus():
    state = bowling.init_state({"tenthFrameBonus": False})
    for _ in range(9 * 2):
        state = bowling.apply({"type": "ROLL", "pins": 0}, state)
    for pins in [7, 3]:
        state = bowling.apply({"type": "ROLL", "pins": pins}, state)
    with pytest.raises(ValueError, match="no rolls left"):
        bowling.apply({"type": "ROLL", "pins": 5}, state)
    summary = bowling.summary(state)
    assert summary["frames"][9] == [7, 3]
    assert summary["total"] == 10


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
