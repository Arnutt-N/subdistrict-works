import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// § โหลด .env.local เพื่อให้ `pnpm db:generate`/`db:push` รันได้โดยไม่ต้อง export env
// เองใน shell ทุกครั้ง (เหมือนที่ vitest.config.ts / playwright.config.ts ทำอยู่แล้ว).
// override:false = ถ้ามี env จริงอยู่แล้ว (production/CI) ใช้ค่านั้น ไม่เขียนทับ.
config({ path: '.env.local', override: false });

// § Neon (และ managed Postgres อื่น) แยก endpoint เป็น 2 ตัว:
//   - pooled → app runtime (ผ่าน PgBouncer)
//   - direct → DDL/migration ที่ต้องการ session-level features
// drizzle-kit ต้องใช้ direct เสมอ; ถ้าไม่มีก็ fallback ไป DATABASE_URL
// (local docker มี endpoint เดียว จึงเข้า fallback ตามปกติ)
//
// ⚠️ ชื่อตัวแปรที่ Vercel-Neon integration inject จริงต้องยืนยันตอน provision แล้วตัด
//    ตัวที่ไม่ได้ใช้ทิ้ง — ตอนนี้รองรับทั้งสองชื่อที่พบบ่อยไว้ก่อน
//
// ใช้ ?? ไม่ใช่ || เพื่อให้ค่าว่างตกไปที่ guard ด้านล่างแล้ว error ชัด ๆ
// แทนที่จะเงียบ ๆ ข้ามไปใช้ตัวถัดไปจนซ่อนว่าตั้งค่าผิด
const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set (expected postgresql://...). Copy .env.example to .env and configure it.'
  );
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});