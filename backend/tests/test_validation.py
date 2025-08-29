import pytest
from app.services.validation import validate_set_scores, ValidationError


def test_accepts_valid_sets() -> None:
    validate_set_scores([{"A": 21, "B": 18}])
    validate_set_scores([{"A": 11, "B": 9}, {"A": 9, "B": 11}])


@pytest.mark.parametrize(
    "sets, msg",
    [
        ([], "At least one set"),                  # empty list
        ([{"A": 10, "B": 10}], "cannot be a tie"), # tie
        ([{"A": -1, "B": 0}], ">= 0"),             # negative
        ([{"A": "x", "B": 0}], "integers"),        # non-integer
        ([{"A": 1}], "include both A and B"),      # missing key
        ("not a list", "At least one set"),        # wrong top-level type
        ([42], "must be an object"),               # non-dict set entry
    ],
    ids=[
        "empty",
        "tie",
        "negative",
        "non-integer",
        "missing-key",
        "not-a-list",
        "non-dict-entry",
    ],
)
def test_rejects_invalid_sets(sets, msg) -> None:
    with pytest.raises(ValidationError) as exc:
        validate_set_scores(sets)  # type: ignore[arg-type]
    assert msg.lower() in str(exc.value).lower()


def test_rejects_too_many_sets() -> None:
    with pytest.raises(ValidationError):
        validate_set_scores([{"A": 1, "B": 0}] * 6, max_sets=5)
