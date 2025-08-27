# stub – will implement full rules later
def init_state(config: dict) -> dict:
    return {"config": config, "frames": [{"rolls": []} for _ in range(10)]}

def apply(event: dict, state: dict) -> dict:
    if event.get("type") == "ROLL":
        for f in state["frames"]:
            if len(f["rolls"]) < 2:
                f["rolls"].append(event.get("pins", 0))
                break
    return state

def summary(state: dict) -> dict:
    return {"detail": state}
