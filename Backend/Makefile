.PHONY: start stop logs seed db-push db-studio

# Iniciar PostgreSQL y Redis
start:
	docker-compose up -d

# Detener contenedores
stop:
	docker-compose down

# Ver logs de contenedores
logs:
	docker-compose logs -f

# Sincronizar esquema de base de datos
db-push:
	npx prisma push

# Poblar base de datos con mock data
seed:
	npx tsx prisma/seed.ts

# Iniciar el servidor local de desarrollo
dev:
	npx tsx watch src/index.ts

# Compilar proyecto y levantar DB
build:
	npx tsup src/index.ts --format cjs --dts

# Abrir Prisma Studio
db-studio:
	npx prisma studio
