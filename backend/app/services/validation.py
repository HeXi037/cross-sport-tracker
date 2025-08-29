from typing import Any, Dict, List

class ValidationError(Exception):
    """Raised when submitted set scores are invalid."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def validate_set_scores(sets: List[Dict[str, Any]], max_sets: int = 5) -> None:
    """Validate a list of set score dictionaries.

    Rules:
    - At least one set is required
    - Number of sets must be <= ``max_sets``
    - Each set must be an object ``{A, B}``
    - ``A`` and ``B`` must be integers >= 0 (booleans are rejected)
    - Ties are not allowed (``A`` != ``B``)
    """

    if not isinstance(sets, list) or len(sets) == 0:
        raise ValidationError("At least one set is required.")
    if len(sets) > max_sets:
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
        if a == b:
            raise ValidationError(f"Set #{i} cannot be a tie.")

    return None

