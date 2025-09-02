"""Internal application services (pure helpers, no I/O)."""

from .validation import ValidationError, validate_set_scores
from .rating import update_ratings
from .metrics import update_player_metrics
from .stats import (
    rolling_win_percentage,
    plot_rolling_win_percentage,
    compute_streaks,
    compute_sport_format_stats,
)

__all__ = [
    "validate_set_scores",
    "ValidationError",
    "update_ratings",
    "update_player_metrics",
    "rolling_win_percentage",
    "plot_rolling_win_percentage",
    "compute_streaks",
    "compute_sport_format_stats",
]
