from backend.app.scoring import table_tennis


def test_game_wins_at_11_with_two_point_margin():
    state = table_tennis.init_state({})

    for _ in range(11):
        state = table_tennis.apply({"type": "POINT", "by": "A"}, state)

    assert state["games"] == {"A": 1, "B": 0}
    assert state["points"] == {"A": 0, "B": 0}


def test_requires_two_point_gap_in_deuce():
    state = table_tennis.init_state({})

    for _ in range(10):
        state = table_tennis.apply({"type": "POINT", "by": "A"}, state)
        state = table_tennis.apply({"type": "POINT", "by": "B"}, state)

    state = table_tennis.apply({"type": "POINT", "by": "A"}, state)
    state = table_tennis.apply({"type": "POINT", "by": "B"}, state)

    assert state["games"] == {"A": 0, "B": 0}
    assert state["points"] == {"A": 11, "B": 11}

    state = table_tennis.apply({"type": "POINT", "by": "A"}, state)
    assert state["games"] == {"A": 0, "B": 0}

    state = table_tennis.apply({"type": "POINT", "by": "A"}, state)
    assert state["games"] == {"A": 1, "B": 0}
    assert state["points"] == {"A": 0, "B": 0}


def test_best_of_five_halts_after_three_wins():
    state = table_tennis.init_state({"bestOf": 5})

    for _ in range(3):
        for _ in range(11):
            state = table_tennis.apply({"type": "POINT", "by": "A"}, state)

    before = {"points": dict(state["points"]), "games": dict(state["games"])}
    state = table_tennis.apply({"type": "POINT", "by": "A"}, state)

    assert state["games"] == before["games"]
    assert state["points"] == before["points"]
