import uuid

from pydantic import BaseModel, EmailStr, Field, model_validator

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
    company_id: uuid.UUID | None = None
    business_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_scope_assignments(self) -> "UserCreate":
        if self.role == UserRole.BRANCH_MANAGER and self.branch_id is None:
            raise ValueError("Branch manager must be assigned to a branch")
        if self.role == UserRole.BUSINESS_MANAGER and self.business_id is None:
            raise ValueError("Business manager must be assigned to a business")
        return self


class UserResponse(BaseModel):
    user_id: uuid.UUID
    name: str
    email: EmailStr
    role: UserRole
    company_id: uuid.UUID | None
    business_id: uuid.UUID | None
    branch_id: uuid.UUID | None

    model_config = {"from_attributes": True}
