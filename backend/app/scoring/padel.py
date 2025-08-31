"""Padel scoring engine.
Tracks points -> games -> sets using simplified tennis rules."""

from typing import Dict


def init_state(config: Dict) -> Dict:
    """Create an initial padel scoreboard state.

    Recognises ``goldenPoint`` in ``config`` which, when enabled, causes a
    game to be decided on the next point once both sides reach three points
    (40-40).
    """

    cfg = dict(config)
    cfg.setdefault("goldenPoint", False)
    return {
        "config": cfg,
        "points": {"A": 0, "B": 0},
        "games": {"A": 0, "B": 0},
        "sets": {"A": 0, "B": 0},
    }


def _other(side: str) -> str:
    return "B" if side == "A" else "A"


def apply(event: Dict, state: Dict) -> Dict:
    if event.get("type") != "POINT" or event.get("by") not in ("A", "B"):
        raise ValueError("invalid padel event")
    side = event["by"]
    opp = _other(side)
    state["points"][side] += 1
    ps, po = state["points"][side], state["points"][opp]
    golden = state["config"].get("goldenPoint")

    if golden and ps == 4 and po == 3:
        state["games"][side] += 1
        state["points"]["A"] = state["points"]["B"] = 0
        gs, go = state["games"][side], state["games"][opp]
        if gs >= 6 and gs - go >= 2:
            state["sets"][side] += 1
            state["games"]["A"] = state["games"]["B"] = 0
        return state

    if ps >= 4 and ps - po >= 2:
        state["games"][side] += 1
        state["points"]["A"] = state["points"]["B"] = 0
        gs, go = state["games"][side], state["games"][opp]
        if gs >= 6 and gs - go >= 2:
            state["sets"][side] += 1
            state["games"]["A"] = state["games"]["B"] = 0
    return state


def summary(state: Dict) -> Dict:
    return {
        "config": state["config"],
        "points": state["points"],
        "games": state["games"],
        "sets": state["sets"],
    }


def record_sets(set_scores, state=None):
    """Generate point events to reach the provided set scores.

    ``set_scores`` is an iterable of ``(games_A, games_B)`` tuples.  The
    returned state represents the scoreboard after applying all generated
    events.
    """

    state = state or init_state({})
    events = []

    for ga, gb in set_scores:
        # Determine winner/loser for this set.
        if ga == gb:
            raise ValueError("sets cannot be tied")
        winner = "A" if ga > gb else "B"
        loser = "B" if winner == "A" else "A"
        win_games = ga if winner == "A" else gb
        lose_games = gb if winner == "A" else ga

        # Winner captures all but the final game first, then the loser wins
        # their games, and finally the winner secures the set with the last
        # game.  This yields a deterministic sequence that respects the final
        # game totals.
        for _ in range(win_games - 1):
            for _ in range(4):
                ev = {"type": "POINT", "by": winner}
                events.append(ev)
                state = apply(ev, state)

        for _ in range(lose_games):
            for _ in range(4):
                ev = {"type": "POINT", "by": loser}
                events.append(ev)
                state = apply(ev, state)

        for _ in range(4):
            ev = {"type": "POINT", "by": winner}
            events.append(ev)
            state = apply(ev, state)

    return events, state
