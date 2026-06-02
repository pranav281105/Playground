import uuid

from pydantic import BaseModel


class UserScopeUpdate(BaseModel):
    company_id: uuid.UUID | None = None
    business_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
