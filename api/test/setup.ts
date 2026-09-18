process.env.JWT_SECRET ??= 'test-secret'
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5433/document_review'
// storage.ts calls cloudinary.config() at import time, which throws if these
// are unset — even for tests that never touch a file. Real credentials (via
// .env / docker-compose) are still required for any test that actually
// uploads or downloads through the app.
process.env.CLOUDINARY_CLOUD_NAME ??= 'test'
process.env.CLOUDINARY_API_KEY ??= 'test'
process.env.CLOUDINARY_API_SECRET ??= 'test'
