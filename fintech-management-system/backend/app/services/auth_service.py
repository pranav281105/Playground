from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.entities import User
from app.models.enums import UserRole
from app.schemas.auth import UserCreate


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def register_user(self, payload: UserCreate) -> User:
        existing = self.db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        if payload.role == UserRole.OWNER:
            existing_owner = self.db.execute(
                select(User.user_id).where(User.role == UserRole.OWNER)
            ).scalar_one_or_none()
            if existing_owner is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only one owner account is allowed")
        if payload.role == UserRole.BRANCH_MANAGER and payload.branch_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch manager must be assigned to a branch",
            )
        if payload.role == UserRole.BUSINESS_MANAGER and payload.business_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Business manager must be assigned to a business",
            )

        user = User(
            name=payload.name,
            email=payload.email,
            password_hash=get_password_hash(payload.password),
            role=payload.role,
            company_id=payload.company_id,
            business_id=payload.business_id,
            branch_id=payload.branch_id,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def authenticate(self, email: str, password: str) -> str:
        user = self.db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        return create_access_token(subject=str(user.user_id))
