from typing import List, Dict, Any

class ValidationError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail

def validate_set_scores(sets: List[Dict[str, Any]], max_sets: int = 5) -> None:
    """
    Validate list of set dicts with integer A/B >= 0 and A != B.
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
        try:
            a = int(s["A"]); b = int(s["B"])
        except (TypeError, ValueError):
            raise ValidationError(f"Set #{i} scores must be integers.")
        if a < 0 or b < 0:
            raise ValidationError(f"Set #{i} scores must be >= 0.")
        if a == b:
            raise ValidationError(f"Set #{i} cannot be a tie.")
