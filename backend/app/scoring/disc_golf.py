"""Disc golf stroke-per-hole scoring engine."""
from typing import Dict, List


def init_state(config: Dict) -> Dict:
    holes = int(config.get("holes", 18))
    if holes <= 0:
        raise ValueError("holes must be positive")
    pars: List[int] = config.get("pars") or [3] * holes
    if len(pars) != holes:
        raise ValueError("pars length must equal holes")
    pars = [int(p) for p in pars]
    return {
        "config": {"holes": holes, "pars": pars},
        "scores": {"A": [None] * holes, "B": [None] * holes},
    }


def apply(event: Dict, state: Dict) -> Dict:
    if event.get("type") != "HOLE":
        raise ValueError("invalid disc golf event")
    side = event.get("side")
    if side not in ("A", "B"):
        raise ValueError("invalid side")
    hole = int(event.get("hole", 0))
    holes = state["config"]["holes"]
    if not 1 <= hole <= holes:
        raise ValueError("hole out of range")
    strokes = int(event.get("strokes", 0))
    if strokes <= 0:
        raise ValueError("strokes must be positive")
    state["scores"][side][hole - 1] = strokes
    return state


def summary(state: Dict) -> Dict:
    pars = state["config"]["pars"]
    totals = {}
    for side in ("A", "B"):
        scores = [s for s in state["scores"][side] if s is not None]
        totals[side] = sum(scores)
    par_total = sum(pars)
    to_par = {side: totals[side] - par_total for side in ("A", "B")}
    return {
        "scores": state["scores"],
        "pars": pars,
        "totals": totals,
        "parTotal": par_total,
        "toPar": to_par,
    }
