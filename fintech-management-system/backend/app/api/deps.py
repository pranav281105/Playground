import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.entities import User
from app.models.enums import UserRole

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(db: DbSession, token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    subject = payload.get("sub")
    if not subject:
        raise credentials_exception

    try:
        user_id = uuid.UUID(subject)
    except ValueError as exc:
        raise credentials_exception from exc

    user = db.execute(select(User).where(User.user_id == user_id)).scalar_one_or_none()
    if not user:
        raise credentials_exception
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_branch_operator(current_user: CurrentUser) -> User:
    if current_user.role == UserRole.BRANCH_MANAGER and current_user.branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch assignment required")
    return current_user


AdminUser = Annotated[User, Depends(require_admin)]
BranchOperatorUser = Annotated[User, Depends(require_branch_operator)]
