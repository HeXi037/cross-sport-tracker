from . import Event


def init_state(config: dict) -> dict:
    return {"score": {"A": 0, "B": 0}, "config": config}


def apply(event: Event, state: dict) -> dict:
    if event.type == "ROLL" and event.by and event.pins is not None:
        state["score"][event.by] += event.pins
    return state


def summary(state: dict) -> dict:
    return state["score"]
