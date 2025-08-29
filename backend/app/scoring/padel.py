"""Padel scoring engine.
Tracks points -> games -> sets using simplified tennis rules."""

from typing import Dict, Iterable, Sequence, Tuple


def init_state(config: Dict) -> Dict:
    return {
        "config": config,
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
        "points": state["points"],
        "games": state["games"],
        "sets": state["sets"],
    }


def validate_set_scores(set_scores: Iterable) -> None:
    """Validate a sequence of set score objects.

    Each element may be a mapping with ``A``/``B`` keys, a two-item tuple/list,
    or an object exposing ``A`` and ``B`` attributes.  All values must be
    integers.  Raises ``ValueError`` with a descriptive message on failure.
    """

    for idx, s in enumerate(set_scores, start=1):
        if isinstance(s, dict):
            a, b = s.get("A"), s.get("B")
        elif isinstance(s, (list, tuple)) and len(s) == 2:
            a, b = s[0], s[1]
        else:
            a, b = getattr(s, "A", None), getattr(s, "B", None)

        if not isinstance(a, int) or not isinstance(b, int):
            raise ValueError(f"Set #{idx} scores must be integers")


def record_sets(set_scores: Sequence[Tuple[int, int]], state=None):
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
