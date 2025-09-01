import os, sys
import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from app.scoring import disc_golf


def test_disc_golf_totals_and_par():
    state = disc_golf.init_state({"holes": 3, "pars": [3, 4, 5]})
    strokes = [(3, 4), (4, 4), (4, 5)]
    for hole, (a, b) in enumerate(strokes, start=1):
        state = disc_golf.apply({"type": "HOLE", "side": "A", "hole": hole, "strokes": a}, state)
        state = disc_golf.apply({"type": "HOLE", "side": "B", "hole": hole, "strokes": b}, state)
    summary = disc_golf.summary(state)
    assert summary["totals"]["A"] == 11
    assert summary["totals"]["B"] == 13
    assert summary["pars"] == [3, 4, 5]
    assert summary["toPar"]["A"] == -1
    assert summary["toPar"]["B"] == 1
