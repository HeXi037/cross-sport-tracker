import os, sys
import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from app.scoring import tennis


def _score_game(side, state):
    for _ in range(4):
        state = tennis.apply({"type": "POINT", "by": side}, state)
    return state


def test_tennis_basic_game_win():
    state = tennis.init_state({})
    state = _score_game("A", state)
    assert state["games"] == {"A": 1, "B": 0}
    assert state["points"] == {"A": 0, "B": 0}


def test_tennis_tiebreak():
    state = tennis.init_state({"tiebreakTo": 7})
    for _ in range(6):
        state = _score_game("A", state)
        state = _score_game("B", state)
    assert state["games"] == {"A": 6, "B": 6}
    assert state["tiebreak"] is True

    for _ in range(6):
        state = tennis.apply({"type": "POINT", "by": "A"}, state)
    for _ in range(5):
        state = tennis.apply({"type": "POINT", "by": "B"}, state)
    state = tennis.apply({"type": "POINT", "by": "A"}, state)
    assert state["sets"] == {"A": 1, "B": 0}
    assert state["games"] == {"A": 0, "B": 0}


def test_tennis_match_stops_after_set_limit():
    state = tennis.init_state({"sets": 3})
    for _ in range(2):
        for _ in range(6):
            state = _score_game("A", state)
    assert state["sets"]["A"] == 2
    before = {
        "points": dict(state["points"]),
        "games": dict(state["games"]),
        "sets": dict(state["sets"]),
    }
    state = tennis.apply({"type": "POINT", "by": "A"}, state)
    assert state["points"] == before["points"]
    assert state["games"] == before["games"]
    assert state["sets"] == before["sets"]


def test_tennis_no_set_limit_by_default():
    state = tennis.init_state({})
    for _ in range(3):
        for _ in range(6):
            state = _score_game("A", state)
    assert state["sets"]["A"] == 3
