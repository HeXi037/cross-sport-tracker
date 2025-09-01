"""Padel scoring engine.
Tracks points -> games -> sets using simplified tennis rules."""

from typing import Dict


def init_state(config: Dict) -> Dict:
    """Initialise the scoreboard state.

    ``config`` may contain ``tiebreakTo`` – the number of tiebreak points
    required to win a set (default ``7``) – and ``sets`` – the best-of value
    for the match.  If ``sets`` is not provided the match continues until
    stopped externally.
    """

    return {
        "config": {
            "tiebreakTo": config.get("tiebreakTo", 7),
            "sets": config.get("sets"),
            "goldenPoint": config.get("goldenPoint", False),
        },
        "points": {"A": 0, "B": 0},
        "games": {"A": 0, "B": 0},
        "sets": {"A": 0, "B": 0},
        "tiebreak": False,
    }


def _other(side: str) -> str:
    return "B" if side == "A" else "A"


def apply(event: Dict, state: Dict) -> Dict:
    if event.get("type") != "POINT" or event.get("by") not in ("A", "B"):
        raise ValueError("invalid padel event")
    side = event["by"]
    opp = _other(side)

    cfg = state["config"]
    tiebreak_to = cfg.get("tiebreakTo", 7)
    best_of = cfg.get("sets")
    golden_point = cfg.get("goldenPoint", False)
    sets_needed = best_of // 2 + 1 if best_of else None

    # Stop processing if the match is already decided.
    if sets_needed and (
        state["sets"]["A"] >= sets_needed or state["sets"]["B"] >= sets_needed
    ):
        return state

    state["points"][side] += 1
    ps, po = state["points"][side], state["points"][opp]

    if state.get("tiebreak"):
        if ps >= tiebreak_to and ps - po >= 2:
            state["sets"][side] += 1
            state["points"]["A"] = state["points"]["B"] = 0
            state["games"]["A"] = state["games"]["B"] = 0
            state["tiebreak"] = False
        return state

    if ps >= 4 and (ps - po >= 2 or (golden_point and po >= 3)):
        state["games"][side] += 1
        state["points"]["A"] = state["points"]["B"] = 0
        gs, go = state["games"][side], state["games"][opp]
        if (
            tiebreak_to
            and state["games"]["A"] == 6
            and state["games"]["B"] == 6
        ):
            state["tiebreak"] = True
        elif gs >= 6 and gs - go >= 2:
            state["sets"][side] += 1
            state["games"]["A"] = state["games"]["B"] = 0
    return state


def summary(state: Dict) -> Dict:
    return {
        "points": state["points"],
        "games": state["games"],
        "sets": state["sets"],
        "config": state["config"],
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
