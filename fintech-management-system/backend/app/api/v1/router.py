from fastapi import APIRouter

from app.api.v1.endpoints import auth, branches, costs, customers, dashboard, invoices, payments, reports

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(branches.router)
api_router.include_router(customers.router)
api_router.include_router(invoices.router)
api_router.include_router(payments.router)
api_router.include_router(costs.router)
api_router.include_router(dashboard.router)
api_router.include_router(reports.router)
