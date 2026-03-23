from enum import Enum


class UserRole(str, Enum):
    OWNER = "owner"
    BUSINESS_MANAGER = "business_manager"
    ADMIN = "admin"
    BRANCH_MANAGER = "branch_manager"


class RecordStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class InvoiceStatus(str, Enum):
    DRAFT = "DRAFT"
    FINALIZED = "FINALIZED"
    VOID = "VOID"


class PaymentMethod(str, Enum):
    CASH = "cash"
    PAYNOW = "paynow"
    BANK_TRANSFER = "bank_transfer"
    CREDIT_CARD = "credit_card"


class FailureType(str, Enum):
    CUSTOMER_RETURN = "customer_return"
    DAMAGED_GOODS = "damaged_goods"
    QUALITY_DEFECT = "quality_defect"
    SHIPPING_ERROR = "shipping_error"
    OTHER = "other"


def is_owner_role(role: UserRole) -> bool:
    # Keep legacy admin users as top-level users while owner role is introduced.
    return role in {UserRole.OWNER, UserRole.ADMIN}
