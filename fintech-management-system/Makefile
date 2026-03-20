SHELL := /bin/bash

.PHONY: help install dev dev-db dev-backend dev-frontend stop

help:
	@echo "Available targets:"
	@echo "  make install       Install backend and frontend dependencies"
	@echo "  make dev-db        Start local Postgres with docker compose"
	@echo "  make dev-backend   Run FastAPI backend on :8000"
	@echo "  make dev-frontend  Run Vite frontend on :5173"
	@echo "  make dev           Start DB, then backend + frontend together"
	@echo "  make stop          Stop docker compose services"

install:
	cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e .[dev]
	cd frontend && npm install

dev-db:
	docker compose up -d db

dev-backend:
	cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

dev-frontend:
	cd frontend && npm run dev

dev: dev-db
	@echo "Starting backend and frontend. Press Ctrl+C to stop both."
	@cd backend && source .venv/bin/activate && uvicorn app.main:app --reload & \
	BACKEND_PID=$$!; \
	cd frontend && npm run dev; \
	kill $$BACKEND_PID

stop:
	docker compose down
