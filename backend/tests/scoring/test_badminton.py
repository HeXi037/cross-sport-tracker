from backend.app.scoring import badminton


def test_game_wins_at_21_with_two_point_margin():
    state = badminton.init_state({})

    for _ in range(21):
        state = badminton.apply({"type": "POINT", "by": "A"}, state)

    assert state["games"] == {"A": 1, "B": 0}
    assert state["points"] == {"A": 0, "B": 0}


def test_requires_two_point_gap_and_caps_at_30():
    state = badminton.init_state({})

    for _ in range(20):
        state = badminton.apply({"type": "POINT", "by": "A"}, state)
        state = badminton.apply({"type": "POINT", "by": "B"}, state)

    # Push beyond 21 but without two-point lead
    state = badminton.apply({"type": "POINT", "by": "A"}, state)
    state = badminton.apply({"type": "POINT", "by": "B"}, state)
    assert state["games"] == {"A": 0, "B": 0}
    assert state["points"] == {"A": 21, "B": 21}

    # Run to the cap; final point should end the game
    for _ in range(8):
        state = badminton.apply({"type": "POINT", "by": "A"}, state)
        state = badminton.apply({"type": "POINT", "by": "B"}, state)

    state = badminton.apply({"type": "POINT", "by": "A"}, state)
    assert state["games"] == {"A": 1, "B": 0}
    assert state["points"] == {"A": 0, "B": 0}


def test_best_of_three_halts_after_two_wins():
    state = badminton.init_state({"bestOf": 3})

    for _ in range(2):
        for _ in range(21):
            state = badminton.apply({"type": "POINT", "by": "A"}, state)

    state = badminton.apply({"type": "POINT", "by": "A"}, state)
    assert state["games"] == {"A": 2, "B": 0}
    assert state["points"] == {"A": 0, "B": 0}
