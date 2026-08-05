import type postgres from 'postgres';

/**
 * pg-options — option ชุดเดียวสำหรับ postgres-js ทุกจุดในโปรเจกต์
 *
 * มีที่สร้าง client อยู่ 4 จุด (src/lib/db/index.ts + scripts อีก 3 ตัว) การปล่อยให้
 * แต่ละจุดตั้ง option เองทำให้ค่าที่สำคัญหลุดกลับไปเป็น default ได้โดยไม่มีใครสังเกต
 *
 * - prepare: false — ค่าที่ปลอดภัยกับ pooled endpoint ทุกแบบ (Neon pooler, PgBouncer,
 *   pgpool) แลกกับ query plan cache ที่หายไปเล็กน้อย ดีกว่าเสี่ยงพังทั้งระบบ
 * - max ต่ำ — serverless มีหลาย instance พร้อมกัน และ pooler จัดการ concurrency ให้
 *   อยู่แล้ว การถือ 10 connection ต่อ instance ทำให้ชน connection limit เร็วเปล่า ๆ
 * - idle_timeout — postgres-js default = null (ดู src/index.js ของ lib) คือไม่ปิด
 *   connection ที่ว่างเลย ซึ่งบน serverless ทำให้ connection ค้างกิน slot ของ pooler
 *   จนกว่า instance จะตาย
 */

// § ค่าเริ่มต้นที่ยังไม่ได้วัดจริง — PRD ระบุว่า pool tuning ต้องรอ baseline จาก
// production (Phase 4) เทสต์จึงเช็คเป็นช่วง (<= 5) ไม่ใช่ค่าตายตัว
const POOL_MAX = 5;
const IDLE_TIMEOUT_SECONDS = 20;

// § freeze เพราะ object นี้ถูกส่งเข้า postgres() แบบ by-reference จาก 4 จุด และ
// parseOptions ของ postgres-js เขียนทับ option ที่รับมาในบางเงื่อนไข
// (`o.no_prepare && (o.prepare = false)`, `'timeout' in o && (o.idle_timeout = o.timeout)`)
// วันนี้ยังไม่มี key พวกนั้นจึงไม่เกิดขึ้น แต่ถ้าวันหน้าเติมเข้ามา การกลายพันธุ์จะ
// ลามไปทุก call site แบบเงียบ ๆ — freeze ทำให้พังดัง ๆ ตรงจุดแทน
export const pgClientOptions = Object.freeze({
  max: POOL_MAX,
  prepare: false,
  idle_timeout: IDLE_TIMEOUT_SECONDS,
}) satisfies postgres.Options<Record<string, postgres.PostgresType>>;
