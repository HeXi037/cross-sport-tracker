"""Simple ten-pin bowling scoring engine."""
from typing import Dict, List


def init_state(config: Dict) -> Dict:
    return {"config": config, "frames": [[] for _ in range(10)]}


def apply(event: Dict, state: Dict) -> Dict:
    if event.get("type") != "ROLL":
        raise ValueError("invalid bowling event")
    pins = int(event.get("pins", 0))
    if not 0 <= pins <= 10:
        raise ValueError("pins out of range")
    frames = state["frames"]
    for i in range(10):
        f = frames[i]
        if i < 9:
            if f and (f[0] == 10 or len(f) == 2):
                continue
            f.append(pins)
            break
        else:
            if len(f) < 2 or f[0] == 10 or sum(f[:2]) == 10:
                f.append(pins)
            else:
                raise ValueError("no rolls left in final frame")
            break
    return state


def _frame_score(frames: List[List[int]], i: int) -> int:
    f = frames[i]
    if i < 9:
        if f and f[0] == 10:  # strike
            nxt = frames[i + 1] + (frames[i + 2] if len(frames) > i + 2 else [])
            return 10 + sum(nxt[:2])
        if sum(f) == 10:  # spare
            return 10 + (frames[i + 1][0] if len(frames) > i + 1 and frames[i + 1] else 0)
        return sum(f)
    return sum(f)


def summary(state: Dict) -> Dict:
    frames = state["frames"]
    scores = []
    total = 0
    for i in range(10):
        s = _frame_score(frames, i)
        scores.append(s)
        total += s
    return {"frames": frames, "scores": scores, "total": total}
