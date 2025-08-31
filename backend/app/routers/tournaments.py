from fastapi import APIRouter

router = APIRouter()

@router.get("/tournaments")
async def list_tournaments():
    return []
