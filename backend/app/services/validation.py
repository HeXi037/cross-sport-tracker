from typing import Any, Dict, List, Optional, Sequence

class ValidationError(Exception):
    """Raised when submitted set scores are invalid."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def validate_set_scores(
    sets: List[Dict[str, Any]],
    *,
    max_sets: Optional[int] = 5,
    allow_ties: bool = False,
    max_points_per_side: Optional[int] = 1000,
) -> None:
    """Validate a list of set score dictionaries.

    Rules:
    - At least one set is required
    - Number of sets must be <= ``max_sets`` (if provided)
    - Each set must be an object ``{A, B}``
    - ``A`` and ``B`` must be integers >= 0 (booleans are rejected)
    - Ties are not allowed (``A`` != ``B``) unless ``allow_ties`` is ``True``
    """

    if not isinstance(sets, list) or len(sets) == 0:
        raise ValidationError("At least one set is required.")
    if max_sets is not None and len(sets) > max_sets:
        raise ValidationError(f"Too many sets. Max allowed is {max_sets}.")

    for i, s in enumerate(sets, start=1):
        if not isinstance(s, dict):
            raise ValidationError(f"Set #{i} must be an object with fields A and B.")
        if "A" not in s or "B" not in s:
            raise ValidationError(f"Set #{i} must include both A and B.")

        vA, vB = s["A"], s["B"]

        # Reject booleans explicitly (bool is a subclass of int in Python)
        if isinstance(vA, bool) or isinstance(vB, bool):
            raise ValidationError(f"Set #{i} scores must be integers (not booleans).")

        try:
            a = int(vA)
            b = int(vB)
        except (TypeError, ValueError):
            raise ValidationError(f"Set #{i} scores must be integers.")

        if a < 0 or b < 0:
            raise ValidationError(f"Set #{i} scores must be >= 0.")
        if not allow_ties and a == b:
            raise ValidationError(f"Set #{i} cannot be a tie.")
        if max_points_per_side is not None and (
            a > max_points_per_side or b > max_points_per_side
        ):
            raise ValidationError(
                f"Set #{i} scores must be <= {max_points_per_side}."
            )

    return None


SPORT_RULES: dict[str, dict[str, object]] = {
    "padel": {"team_sizes": {1, 2}, "min_sides": 2, "max_sides": 2},
    "padel_americano": {"team_sizes": {2}, "min_sides": 2, "max_sides": 2},
    "tennis": {"team_sizes": {1, 2}, "min_sides": 2, "max_sides": 2},
    "pickleball": {"team_sizes": {1, 2}, "min_sides": 2, "max_sides": 2},
    "bowling": {"team_sizes": {1}, "min_sides": 1},
    "disc_golf": {"team_sizes": {1}, "min_sides": 1},
}


def _sport_label(sport_id: str) -> str:
    return sport_id.replace("_", " ").title() or "Sport"


def validate_participants_for_sport(
    sport_id: str, side_players: Dict[str, List[str]]
) -> None:
    rules = SPORT_RULES.get(sport_id)
    if not rules:
        return

    team_sizes = rules.get("team_sizes")
    if isinstance(team_sizes, set) and team_sizes:
        allowed_sizes = sorted(int(size) for size in team_sizes)
        for side, players in side_players.items():
            size = len(players)
            if size not in team_sizes:
                if len(allowed_sizes) == 1:
                    raise ValidationError(
                        f"{_sport_label(sport_id)} matches require exactly {allowed_sizes[0]}"
                        " player(s) per side."
                    )
                formatted = ", ".join(str(v) for v in allowed_sizes)
                raise ValidationError(
                    f"{_sport_label(sport_id)} matches must use {formatted} players per side."
                )

    side_count = len(side_players)
    min_sides = rules.get("min_sides")
    max_sides = rules.get("max_sides")

    if isinstance(min_sides, int) and side_count < min_sides:
        raise ValidationError(
            f"{_sport_label(sport_id)} matches require at least {min_sides} side(s)."
        )
    if isinstance(max_sides, int) and side_count > max_sides:
        raise ValidationError(
            f"{_sport_label(sport_id)} matches support at most {max_sides} side(s)."
        )


def validate_score_totals(
    scores: Sequence[Any],
    *,
    min_value: int = 0,
    max_value: int = 1000,
) -> List[int]:
    if not isinstance(scores, Sequence) or isinstance(scores, (str, bytes)):
        raise ValidationError("Scores must be provided as a sequence of integers.")
    if len(scores) == 0:
        raise ValidationError("Scores must include at least one value.")

    normalized: List[int] = []
    for index, raw in enumerate(scores, start=1):
        if isinstance(raw, bool):
            raise ValidationError(
                f"Score #{index} must be an integer (not a boolean)."
            )
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValidationError(f"Score #{index} must be an integer.")

        if value < min_value:
            raise ValidationError(
                f"Score #{index} must be greater than or equal to {min_value}."
            )
        if max_value is not None and value > max_value:
            raise ValidationError(
                f"Score #{index} must be less than or equal to {max_value}."
            )
        normalized.append(value)

    return normalized

