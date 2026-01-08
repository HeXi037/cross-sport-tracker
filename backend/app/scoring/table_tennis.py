"""Table tennis scoring engine.

Rally-point scoring to 11 points with a win-by-2 requirement.
Matches default to best-of-5 games.
"""

from typing import Dict


def init_state(config: Dict) -> Dict:
    """Initialise scoreboard state for table tennis."""
    return {
        "config": {
            "pointsTo": config.get("pointsTo", 11),
            "winBy": config.get("winBy", 2),
            "bestOf": config.get("bestOf", 5),
        },
        "points": {"A": 0, "B": 0},
        "games": {"A": 0, "B": 0},
    }


def _other(side: str) -> str:
    return "B" if side == "A" else "A"


def apply(event: Dict, state: Dict) -> Dict:
    """Apply a POINT event to the current state."""
    if event.get("type") != "POINT" or event.get("by") not in ("A", "B"):
        raise ValueError("invalid table tennis event")

    side = event["by"]
    opp = _other(side)

    cfg = state["config"]
    points_to = cfg.get("pointsTo", 11)
    win_by = cfg.get("winBy", 2)
    best_of = cfg.get("bestOf")
    games_needed = best_of // 2 + 1 if best_of else None

    if games_needed and (
        state["games"]["A"] >= games_needed
        or state["games"]["B"] >= games_needed
    ):
        return state

    state["points"][side] += 1
    ps, po = state["points"][side], state["points"][opp]

    if ps >= points_to and ps - po >= win_by:
        state["games"][side] += 1
        state["points"]["A"] = state["points"]["B"] = 0

    return state


def summary(state: Dict) -> Dict:
    return {
        "points": state["points"],
        "games": state["games"],
        "config": state["config"],
    }
