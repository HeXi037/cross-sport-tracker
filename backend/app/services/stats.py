from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, List, Tuple


def compute_sport_format_stats(
    match_summary: Iterable[Tuple[str, int, bool]]
) -> Dict[Tuple[str, int], Dict[str, float]]:
    """Aggregate win/loss stats for each (sport, team size)."""

    stats: Dict[Tuple[str, int], Dict[str, float]] = defaultdict(
        lambda: {"wins": 0, "losses": 0, "winPct": 0.0}
    )
    for sport, team_size, is_win in match_summary:
        entry = stats[(sport, team_size)]
        if is_win:
            entry["wins"] += 1
        else:
            entry["losses"] += 1
        total = entry["wins"] + entry["losses"]
        entry["winPct"] = entry["wins"] / total if total else 0.0
    return stats


def compute_streaks(results: List[bool]) -> Dict[str, int]:
    """Compute current streak and longest win/loss streaks."""

    current = 0
    longest_win = 0
    longest_loss = 0
    for r in results:
        if r:
            current = current + 1 if current >= 0 else 1
            longest_win = max(longest_win, current)
        else:
            current = current - 1 if current <= 0 else -1
            longest_loss = min(longest_loss, current)
    return {
        "current": current,
        "longestWin": longest_win,
        "longestLoss": abs(longest_loss),
    }


def rolling_win_percentage(results: List[bool], span: int) -> List[float]:
    """Return rolling win percentage over a window of ``span`` matches."""

    if span <= 0:
        return []
    rolling: List[float] = []
    wins = 0
    window: List[bool] = []
    for r in results:
        window.append(r)
        if r:
            wins += 1
        if len(window) > span:
            if window.pop(0):
                wins -= 1
        rolling.append(wins / len(window))
    return rolling

