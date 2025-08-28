import pytest
from app.services.validation import validate_set_scores, ValidationError

def test_accepts_basic_sets():
    validate_set_scores([{"A": 21, "B": 18}])
    validate_set_scores([{"A": 7, "B": 6}, {"A": 6, "B": 3}])

@pytest.mark.parametrize("sets,msg",[
    ([], "At least one set"),
    ([{"A":10,"B":10}], "tie"),
    ([{"A":-1,"B":0}], ">= 0"),
    ([{"A":"x","B":0}], "integers"),
    ([{"A":1}], "both"),
])
def test_rejects_bad_sets(sets,msg):
    with pytest.raises(ValidationError) as e:
        validate_set_scores(sets)
    assert msg.lower() in str(e.value).lower()

def test_max_sets_limit():
    with pytest.raises(ValidationError):
        validate_set_scores([{"A":1,"B":0}]*6, max_sets=5)
