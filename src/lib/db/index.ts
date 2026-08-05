import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { pgClientOptions } from './pg-options';
import { redactErrorMessage } from './redact';
import * as schema from './schema';

/**
 * DB — PostgreSQL connection singleton (postgres-js, pure JS, no native build)
 *
 * Migrated from better-sqlite3 (sync) → postgres-js (async).
 * - lazy-init: สร้าง pool เมื่อเรียกครั้งแรกเท่านั้น (avoid build-time connect)
 * - pool/prepare/idle_timeout อยู่ใน pg-options.ts (ใช้ร่วมกับ scripts ที่สร้าง client เอง)
 * - foreign_keys pragma ถูกลบ (SQLite-only — PG enforce FK ที่ column definition)
 * - WAL pragma ถูกลบ (PG ใช้ MVCC ไม่ใช้ WAL mode toggle)
 */

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let pgClient: postgres.Sql | null = null;

export async function getDb(): Promise<PostgresJsDatabase<typeof schema>> {
  if (dbInstance) return dbInstance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (expected postgresql://...)');
  }

  // § ห่อด้วย try/catch เพราะ postgres() throw แบบ synchronous ตอน parse connection
  // string ไม่ผ่าน (การต่อ DB จริงเป็น lazy จึงไม่ throw ตรงนี้)
  //
  // redact ไว้เป็น defense-in-depth: ทดสอบกับ Node ที่โปรเจกต์ใช้แล้วพบว่า error คืน
  // แค่ "Invalid URL" ไม่ echo ค่า URL กลับมา แต่ error ชนิดอื่นจาก postgres-js หรือ
  // Node เวอร์ชันอื่นอาจแนบ input มาด้วย — ราคาถูกกว่ารหัสผ่านหลุดลง build log มาก
  //
  // § จงใจไม่แนบ { cause: error }
  // util.inspect พิมพ์ cause chain ออกมาทั้งสาย (ทดสอบแล้ว) ซึ่งเป็นสิ่งที่ Vercel log
  // และ error tracker ใช้ — การแนบ cause ที่ยังไม่ถูก redact จึงเปิดช่องรั่วช่องเดียว
  // กับที่บรรทัดข้างบนเพิ่งปิดไป และ error บนเส้นทางนี้เป็น TypeError ของ URL ล้วน
  // ไม่มี SQLSTATE ให้เก็บ (isUniqueViolation ใน lib/db/errors.ts อ่านจาก error ของ
  // query ไม่ใช่ของการสร้าง client และไม่ได้ unwrap .cause อยู่แล้ว)
  try {
    // option อยู่ใน pg-options.ts; spread เพื่อไม่ให้ postgres-js แตะ object ต้นฉบับ
    pgClient = postgres(url, { ...pgClientOptions });
  } catch (error: unknown) {
    throw new Error(`เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ${redactErrorMessage(error)}`);
  }

  dbInstance = drizzle(pgClient, { schema });

  return dbInstance;
}

/**
 * ปิด connection pool (ใช้ใน script/telemetry เท่านั้น — Next.js route ไม่ควรเรียก)
 */
export async function closeDb(): Promise<void> {
  if (pgClient) {
    await pgClient.end();
    pgClient = null;
    dbInstance = null;
  }
}

export { schema };
export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
export type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';