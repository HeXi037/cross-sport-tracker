import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from app.scoring import pickleball


def _score_points(side, count, state):
    for _ in range(count):
        state = pickleball.apply({"type": "POINT", "by": side}, state)
    return state


def test_game_win():
    state = pickleball.init_state({})
    state = _score_points("A", 11, state)
    assert state["games"]["A"] == 1
    assert state["points"] == {"A": 0, "B": 0}


def test_win_by_two():
    state = pickleball.init_state({})
    state = _score_points("A", 10, state)
    state = _score_points("B", 10, state)
    state = pickleball.apply({"type": "POINT", "by": "A"}, state)
    assert state["games"]["A"] == 0
    state = pickleball.apply({"type": "POINT", "by": "A"}, state)
    assert state["games"]["A"] == 1


def test_match_stops_after_best_of_three():
    state = pickleball.init_state({"bestOf": 3})
    for _ in range(2):
        state = _score_points("A", 11, state)
    before = {"points": dict(state["points"]), "games": dict(state["games"])}
    state = pickleball.apply({"type": "POINT", "by": "A"}, state)
    assert state["points"] == before["points"]
    assert state["games"] == before["games"]
