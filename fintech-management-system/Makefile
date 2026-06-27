SHELL := /bin/bash

.PHONY: help install dev dev-db dev-backend dev-frontend stop docker-up docker-down docker-logs seed-demo

help:
	@echo "Available targets:"
	@echo "  make install       Install backend and frontend dependencies"
	@echo "  make dev-db        Start local Postgres with docker compose"
	@echo "  make dev-backend   Run FastAPI backend on :8000"
	@echo "  make dev-frontend  Run Vite frontend on :5173"
	@echo "  make dev           Start DB, then backend + frontend together"
	@echo "  make stop          Stop docker compose services"
	@echo "  make docker-up     Build and start DB + backend + frontend in Docker"
	@echo "  make docker-down   Stop all Docker services"
	@echo "  make docker-logs   Tail logs for Docker services"
	@echo "  make seed-demo     Reset and load demo users/data into Docker DB"

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

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f --tail=150

seed-demo:
	docker compose exec -T backend python -m app.utils.demo_seed --reset
