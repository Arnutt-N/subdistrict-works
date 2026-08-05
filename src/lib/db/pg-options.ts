import type postgres from 'postgres';

/**
 * pg-options — option ชุดเดียวสำหรับ postgres-js ทุกจุดในโปรเจกต์
 *
 * มีที่สร้าง client อยู่ 4 จุด (src/lib/db/index.ts + scripts อีก 3 ตัว) การปล่อยให้
 * แต่ละจุดตั้ง option เองทำให้ค่าที่สำคัญหลุดกลับไปเป็น default ได้โดยไม่มีใครสังเกต
 *
 * - prepare: false — ค่าที่ปลอดภัยกับ pooled endpoint ทุกแบบ (Neon pooler, PgBouncer,
 *   pgpool)
 *   ⚠️ ราคาไม่ใช่แค่ plan cache: postgres-js จะตั้ง describeFirst สำหรับ query ที่มี
 *   parameter ทุกตัว (connection.js) แปลว่า Parse/Describe กับ Bind/Execute แยกเป็น
 *   คนละ round-trip → query ที่มี parameter เสีย RTT เป็น 2 เท่า ยอมจ่ายเพราะยังไม่ได้
 *   ยืนยันว่า pooler ปลายทางรองรับ prepared statement — PRD เลื่อนการจูนไป Phase 4
 *   หลังวัด baseline จริง ตอนนั้นค่อยพิจารณาแยกค่าตามชนิด endpoint
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

// § freeze กันโค้ดฝั่งแอปแก้ค่ากลางนี้โดยไม่ตั้งใจ
// การ spread ก่อนส่งเข้า postgres() ทำอยู่ใน client.ts ที่เดียว ไม่ใช่ข้อตกลงที่ผู้เรียกต้องจำ
export const pgClientOptions = Object.freeze({
  max: POOL_MAX,
  prepare: false,
  idle_timeout: IDLE_TIMEOUT_SECONDS,
}) satisfies postgres.Options<Record<string, postgres.PostgresType>>;
