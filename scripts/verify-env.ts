#!/usr/bin/env tsx
/**
 * verify-env.ts — validate required env vars ทุกตัว ตอน build/boot (C2, C3)
 * ขาดหรือไม่ถูกต้อง = fail fast (exit 1) บล็อก deploy ไม่ปล่อยให้ต่อ
 *
 * วิ่งใน build script: `tsx scripts/verify-env.ts && next build`
 * หรือ manual: `pnpm verify-env`
 *
 * ตรรกะตรวจรูปแบบ URL อยู่ใน src/lib/env-checks.ts (ฟังก์ชันบริสุทธิ์ + มีเทสต์)
 * ไฟล์นี้เหลือหน้าที่แค่ต่อสายกับ process.env แล้วรายงานผล
 */

import { config } from 'dotenv';
import { checkAuthUrl, checkDatabaseUrl } from '../src/lib/env-checks';

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
const warnings: string[] = [];

// ── มีค่าไหม + ยาวพอไหม ──
for (const spec of required) {
  const v = process.env[spec.key];
  if (!v || v.startsWith('YOUR_') || v.startsWith('CHANGE_ME')) {
    errors.push(`✗ ${spec.key} — ${spec.label} (ยังเป็น placeholder)`);
    continue;
  }
  if (spec.minLen && v.length < spec.minLen) {
    errors.push(`✗ ${spec.key} — สั้นเกิน (ต้อง ≥${spec.minLen} char, ปัจจุบัน ${v.length})`);
  }
}

// ── รูปแบบถูกไหม ──
// § สะสมผลจากทุก check แล้วรายงานทีเดียว แทนการ exit ที่ error แรก
// คนตั้ง env ผิดหลายตัวจะได้เห็นครบในรอบเดียว ไม่ต้อง deploy ไล่แก้ทีละข้อ
const isProduction = process.env.NODE_ENV === 'production';
for (const result of [
  checkDatabaseUrl(process.env.DATABASE_URL, isProduction),
  checkAuthUrl(process.env.AUTH_URL, isProduction),
]) {
  errors.push(...result.errors);
  warnings.push(...result.warnings);
}

for (const w of warnings) console.warn(`[verify-env] ${w}`);

if (errors.length > 0) {
  console.error('\n[verify-env] BLOCKED — env ขาดหรือไม่ถูกต้อง:');
  for (const e of errors) console.error('  ' + e);
  console.error('\nดู .env.example สำหรับรายการเต็ม (คัดลอกเป็น .env.local)\n');
  process.exit(1);
}

console.log('[verify-env] ✓ env vars ครบและถูกต้อง');
