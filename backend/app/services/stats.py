from __future__ import annotations

from collections import deque, defaultdict
from typing import Sequence, Iterable, Tuple, Dict

try:
    import matplotlib.pyplot as plt  # type: ignore
except Exception:  # pragma: no cover - matplotlib is optional
    plt = None


def rolling_win_percentage(results: Sequence[bool], span: int) -> list[float]:
    """Return rolling win percentage for a sequence of results.

    Args:
        results: Sequence where ``True`` represents a win and ``False`` a loss.
        span: Size of the rolling window.
    """
    if span <= 0:
        raise ValueError("span must be positive")
    wins = 0
    window: deque[bool] = deque()
    percentages: list[float] = []
    for r in results:
        window.append(r)
        if r:
            wins += 1
        if len(window) > span:
            old = window.popleft()
            if old:
                wins -= 1
        percentages.append(wins / len(window))
    return percentages


def plot_rolling_win_percentage(results: Sequence[bool], span: int):
    """Create a matplotlib chart of the rolling win percentage.

    Returns a ``matplotlib.figure.Figure`` that has already been closed with
    ``plt.close``. Returns ``None`` if matplotlib is unavailable."""
    if plt is None:
        return None
    pcts = rolling_win_percentage(results, span)
    fig, ax = plt.subplots()
    ax.plot(range(1, len(pcts) + 1), pcts)
    ax.set_xlabel("Match")
    ax.set_ylabel(f"Win % (last {span})")
    ax.set_ylim(0, 1)
    plt.close(fig)
    return fig


def compute_streaks(results: Sequence[bool]) -> Dict[str, int]:
    """Compute current, longest win, and longest loss streaks."""
    longest_win = longest_loss = 0
    curr_win = curr_loss = 0
    for r in results:
        if r:
            curr_win += 1
            curr_loss = 0
            longest_win = max(longest_win, curr_win)
        else:
            curr_loss += 1
            curr_win = 0
            longest_loss = max(longest_loss, curr_loss)
    current = 0
    if results:
        last = results[-1]
        count = 0
        for r in reversed(results):
            if r == last:
                count += 1
            else:
                break
        current = count if last else -count
    return {
        "current": current,
        "longestWin": longest_win,
        "longestLoss": longest_loss,
    }


def compute_sport_format_stats(matches: Iterable[Tuple[str, int, bool]]):
    """Aggregate wins/losses by sport and team size.

    Args:
        matches: iterable of tuples ``(sport_id, team_size, is_win)``.
    Returns:
        dict mapping ``(sport_id, team_size)`` to ``{"wins": int, "losses": int, "winPct": float}``.
    """
    stats: Dict[Tuple[str, int], Dict[str, float]] = defaultdict(lambda: {"wins": 0, "losses": 0, "winPct": 0.0})
    for sport_id, team_size, is_win in matches:
        key = (sport_id, team_size)
        if is_win:
            stats[key]["wins"] += 1
        else:
            stats[key]["losses"] += 1
    for key, val in stats.items():
        total = val["wins"] + val["losses"]
        val["winPct"] = val["wins"] / total if total else 0.0
    return stats
