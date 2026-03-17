from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import TokenResponse, UserCreate, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
def register_user(payload: UserCreate, db: DbSession) -> UserResponse:
    user = AuthService(db).register_user(payload)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
def login(
    db: DbSession,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> TokenResponse:
    """
    Standard OAuth2 compatible token login.
    Note: Swagger UI 'Authorize' button sends data as 'username' (email) and 'password'.
    """
    token = AuthService(db).authenticate(form_data.username, form_data.password)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)
