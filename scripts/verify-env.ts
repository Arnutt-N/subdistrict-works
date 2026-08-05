#!/usr/bin/env tsx
/**
 * verify-env.ts — validate required env vars ทุกตัว ตอน build/boot (C2, C3)
 * ขาดหรือไม่ถูกต้อง = fail fast (exit 1) บล็อก deploy ไม่ปล่อยให้ต่อ
 *
 * วิ่งใน build script: `next build && tsx scripts/verify-env.ts`
 * หรือ manual: `pnpm verify-env`
 */

import { config } from 'dotenv';
import { redactConnectionString } from '../src/lib/db/redact';

// § โหลด .env.local เพื่อให้ `pnpm build` รันในเครื่อง dev ได้โดยไม่ต้อง export env เอง
// (เหมือนที่ drizzle.config.ts / vitest.setup.ts / scripts/seed.ts ทำอยู่แล้ว)
// override:false = production/CI ที่มี env จริงอยู่แล้วไม่ถูกเขียนทับ และ Vercel ไม่มี
// ไฟล์ .env.local (ไม่ได้ commit) บรรทัดนี้จึงเป็น no-op บน production
config({ path: '.env.local', override: false });

type Spec = {
  key: string;
  label: string;
  minLen?: number;
};

/** พิมพ์ error แล้วหยุด build ทันที — รวมคู่ console.error+process.exit(1) ที่ซ้ำทั้งไฟล์ */
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

const required: Spec[] = [
  {
    key: 'AUTH_SECRET',
    label: 'Auth.js JWT signing secret (SERVER-ONLY — ห้าม NEXT_PUBLIC_)',
    minLen: 32,
  },
  { key: 'AUTH_URL', label: 'Auth.js trusted app URL (e.g. http://localhost:3000)' },
  { key: 'DATABASE_URL', label: 'PostgreSQL connection string (postgresql://...)' },
  { key: 'UPSTASH_REDIS_REST_URL', label: 'Upstash Redis REST URL' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', label: 'Upstash Redis REST token', minLen: 16 },
  { key: 'CID_HMAC_KEY', label: 'CID keyed-HMAC key (C2 — ≥32 char)', minLen: 32 },
  { key: 'CRON_SECRET', label: 'Cron shared secret (Authorization: Bearer — ≥16 char)', minLen: 16 },
];

// § QStash env (QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY)
// ไม่ได้ใช้ที่ runtime อีกต่อไป (cron รันผ่าน external scheduler เช่น cron-job.org ที่ตรวจ
// CRON_SECRET ผ่าน header Authorization แทน signature verification) → ไม่บังคับตอน build
// ถ้าในอนาคตกลับไปใช้ QStash Receiver.verify() ให้เพิ่มกลับเข้ามาใน required[] ข้างบน

const errors: string[] = [];

for (const spec of required) {
  const v = process.env[spec.key];
  if (!v || v.startsWith('YOUR_') || v.startsWith('CHANGE_ME')) {
    errors.push(`✗ ${spec.key} — ${spec.label} (ยังเป็น placeholder)`);
    continue;
  }
  if (spec.minLen && v.length < spec.minLen) {
    errors.push(
      `✗ ${spec.key} — สั้นเกิน (ต้อง ≥${spec.minLen} char, ปัจจุบัน ${v.length})`,
    );
  }
}

if (errors.length > 0) {
  console.error('\n[verify-env] BLOCKED — env ขาดหรือไม่ถูกต้อง:');
  for (const e of errors) console.error('  ' + e);
  console.error('\nดู .env.example สำหรับรายการเต็ม (คัดลอกเป็น .env.local)\n');
  process.exit(1);
}

// § sslmode ที่ถือว่าบังคับ TLS แล้ว — require คือขั้นต่ำ ส่วน verify-ca/verify-full
// เข้มกว่า (ตรวจ certificate ด้วย) จึงต้องผ่านทั้งคู่ ไม่ใช่รับแค่ค่าเดียวตายตัว
const TLS_SSLMODES = new Set(['require', 'verify-ca', 'verify-full']);

/**
 * DATABASE_URL — ตรวจรูปแบบ ไม่ใช่แค่ว่ามีค่า
 *
 * ใส่ค่าผิดชนิด (เช่น direct endpoint แทน pooled) จะไปพังตอน runtime บน production
 * แทนที่จะพังตอน build ซึ่งแก้ได้ถูกกว่ามาก
 *
 * ⚠️ ทุกข้อความ error ต้องผ่าน redactConnectionString ก่อน — build log ของ Vercel คนอื่น
 *    อ่านได้ และ connection string มีรหัสผ่านฐานข้อมูลประชาชนอยู่ (PDPA)
 */
function validateDatabaseUrl(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) return; // ค่าว่าง/ขาดถูกดักไปแล้วใน required[] ด้านบน

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`✗ DATABASE_URL — parse ไม่ผ่าน: ${redactConnectionString(raw)}`);
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    fail(`✗ DATABASE_URL — ต้องขึ้นต้นด้วย postgresql:// (ปัจจุบัน: ${parsed.protocol}//)`);
  }

  if (process.env.NODE_ENV !== 'production') return;

  if (isLocalHost(parsed.hostname)) {
    fail('✗ DATABASE_URL — production ห้ามชี้ไป localhost');
  }

  const sslmode = parsed.searchParams.get('sslmode');
  if (!sslmode || !TLS_SSLMODES.has(sslmode)) {
    fail(
      `✗ DATABASE_URL — production ต้องบังคับ TLS: เติม ?sslmode=require ต่อท้าย connection string ` +
        `(รับ verify-ca/verify-full ด้วย) — ปัจจุบัน: ${sslmode ?? 'ไม่ได้ระบุ'}`,
    );
  }

  // § เตือนอย่างเดียว ไม่บล็อก — ยังไม่ยืนยันว่า managed provider ตั้งชื่อ pooled host
  // ว่า "-pooler" เสมอไหม การ fail ตรงนี้เสี่ยงบล็อก deploy ที่ถูกต้องมากกว่า
  // เสี่ยงปล่อยของผิดผ่าน
  if (parsed.hostname.includes('neon.tech') && !parsed.hostname.includes('-pooler')) {
    console.warn(
      '[verify-env] ⚠ DATABASE_URL ดูเหมือนเป็น direct endpoint ของ Neon — app ควรใช้ pooled endpoint',
    );
  }
}

validateDatabaseUrl();

/**
 * AUTH_URL — production ต้องเป็น https:// + canonical domain (ไม่ใช่ localhost)
 * กัน deploy จริงที่ AUTH_URL ยังเป็น placeholder localhost → secure-cookie flag off
 * + callback URL พัง
 */
function validateAuthUrl(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const raw = process.env.AUTH_URL;
  if (!raw) return; // ค่าว่าง/ขาดถูกดักไปแล้วใน required[] ด้านบน

  // § try ครอบเฉพาะ new URL() ไม่ครอบทั้งบล็อก — ถ้าครอบทั้งบล็อก แล้ววันหน้ามีใคร
  // เปลี่ยน fail() จาก process.exit ไปเป็น throw (ซึ่งสมเหตุสมผลถ้าอยากให้ stderr
  // ที่ buffer ไว้ถูก flush ครบ) ข้อผิดพลาดเรื่อง protocol/localhost จะถูก catch นี้
  // กลืนแล้วรายงานผิดเป็น "parse ไม่ผ่าน"
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`✗ AUTH_URL — URL ไม่ถูกต้อง (parse ไม่ผ่าน): ${raw}`);
  }

  if (parsed.protocol !== 'https:') {
    fail(`✗ AUTH_URL — production ต้องเป็น https:// (ปัจจุบัน: ${parsed.protocol}//)`);
  }
  if (isLocalHost(parsed.hostname)) {
    fail('✗ AUTH_URL — production ห้ามใช้ localhost (ตั้งเป็น canonical domain)');
  }
}

validateAuthUrl();

console.log('[verify-env] ✓ env vars ครบและถูกต้อง');