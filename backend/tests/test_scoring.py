import os, sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.scoring import padel, bowling


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


def test_record_sets():
    events, state = padel.record_sets([(6, 4), (6, 2)])
    assert state["sets"]["A"] == 2
    assert len(events) == (6 + 4 + 6 + 2) * 4


def test_validate_tuple_set_scores():
    # Should not raise when provided with tuple-based scores
    padel.validate_set_scores([(6, 4), (6, 2)])
