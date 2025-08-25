from ..schemas import Event
from . import padel, bowling

ENGINES = {
    "padel": padel,
    "bowling": bowling,
}


def get_engine(sport_id: str):
    return ENGINES[sport_id]
