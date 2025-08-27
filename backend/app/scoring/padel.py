# stub – will implement full rules later
def init_state(config: dict) -> dict:
    return {"config": config, "points": {"A": 0, "B": 0}}

def apply(event: dict, state: dict) -> dict:
    if event.get("type") == "POINT" and event.get("by") in ("A", "B"):
        state["points"][event["by"]] += 1
    return state

def summary(state: dict) -> dict:
    return {"detail": state}
