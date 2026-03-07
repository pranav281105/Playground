from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.auth import LoginRequest, TokenResponse, UserCreate, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
def register_user(payload: UserCreate, db: DbSession) -> UserResponse:
    user = AuthService(db).register_user(payload)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    token = AuthService(db).authenticate(payload.email, payload.password)
    return TokenResponse(access_token=token)
