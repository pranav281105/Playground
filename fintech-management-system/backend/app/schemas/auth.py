import uuid

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    branch_id: uuid.UUID | None = None


class UserResponse(BaseModel):
    user_id: uuid.UUID
    name: str
    email: EmailStr
    role: UserRole
    branch_id: uuid.UUID | None

    model_config = {"from_attributes": True}
