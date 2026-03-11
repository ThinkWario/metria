$env:DATABASE_URL = "postgresql://drofit_user:drofit_password@127.0.0.1:5432/drofit_metrics_db?schema=public"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = "super-secret-key-change-in-prod"
$env:PORT = "4000"
$env:NODE_ENV = "development"
npx tsx src/index.ts
