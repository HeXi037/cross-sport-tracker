"""Padel scoring engine.
Tracks points -> games -> sets using simplified tennis rules."""

from typing import Dict


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


def record_sets(set_scores, state=None):
    state = state or init_state({})
    events = []
    for ga, gb in set_scores:
        target = {"A": ga, "B": gb}
        while state["games"]["A"] < target["A"] or state["games"]["B"] < target["B"]:
            side = "A" if state["games"]["A"] < target["A"] else "B"
            for _ in range(4):
                ev = {"type": "POINT", "by": side}
                events.append(ev)
                state = apply(ev, state)
    return events, state
