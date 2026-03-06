.PHONY: help install test up down logs ps migrate seed restart smoke smoke-mailu

help:
	@echo "Available targets:"
	@echo "  install  - npm install"
	@echo "  test     - run unit tests"
	@echo "  up       - docker compose up --build -d"
	@echo "  down     - docker compose down"
	@echo "  logs     - docker compose logs -f api db"
	@echo "  ps       - docker compose ps"
	@echo "  migrate  - run DB migration in api container"
	@echo "  seed     - run DB seed in api container"
	@echo "  restart  - restart api container"
	@echo "  smoke    - run local API smoke script"
	@echo "  smoke-mailu - run local API + mailu-dev smoke script"

install:
	npm install

test:
	npm test

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f api db

ps:
	docker compose ps

migrate:
	docker compose exec api npm run db:migrate

seed:
	docker compose exec api npm run db:seed

restart:
	docker compose restart api

smoke:
	bash scripts/smoke.sh

smoke-mailu:
	bash scripts/mailu-dev-smoke.sh
