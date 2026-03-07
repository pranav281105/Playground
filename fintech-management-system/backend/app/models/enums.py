from enum import Enum


class UserRole(str, Enum):
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
