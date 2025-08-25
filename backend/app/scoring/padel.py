from . import Event


def init_state(config: dict) -> dict:
    return {"score": {"A": 0, "B": 0}, "config": config}


def apply(event: Event, state: dict) -> dict:
    if event.type == "POINT" and event.by:
        state["score"][event.by] += 1
    return state


def summary(state: dict) -> dict:
    return state["score"]
