import { redactConnectionString } from './db/redact';

/**
 * env-checks — ตรวจ "รูปแบบ" ของ env ที่เป็น URL ไม่ใช่แค่ว่ามีค่าหรือไม่
 *
 * แยกออกมาจาก scripts/verify-env.ts เพราะสองเหตุผล:
 *   1. ฟังก์ชันในไฟล์นี้บริสุทธิ์ — ไม่อ่าน process.env ไม่พิมพ์อะไร ไม่ process.exit
 *      จึงเทสต์ได้ตรง ๆ ส่วน verify-env.ts เหลือหน้าที่แค่ต่อสายกับ env จริงแล้วรายงาน
 *   2. vitest include เฉพาะ `src/**` (vitest.config.ts) — เทสต์ที่วางไว้ใน scripts/
 *      จะไม่ถูก CI รันเลย ตรรกะที่ต้องมีเทสต์คุมจึงต้องอยู่ใต้ src/
 *
 * ทุกฟังก์ชันคืนทั้ง errors (บล็อก build) และ warnings (เตือนแต่ปล่อยผ่าน)
 * แทนการ exit เอง เพื่อให้ผู้เรียกรวมผลจากหลายตัวแล้วรายงานทีเดียว — คนตั้ง env ผิด
 * หลายตัวจะได้เห็นครบในรอบเดียว ไม่ต้อง deploy ทีละรอบเพื่อไล่ทีละข้อ
 */
export interface EnvCheckResult {
  errors: string[];
  warnings: string[];
}

// § sslmode ที่ถือว่าบังคับ TLS แล้ว — require คือขั้นต่ำ ส่วน verify-ca/verify-full
// เข้มกว่า (ตรวจ certificate ด้วย) จึงต้องผ่านทั้งคู่ ไม่ใช่รับแค่ค่าเดียวตายตัว
const TLS_SSLMODES = new Set(['require', 'verify-ca', 'verify-full']);

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * DATABASE_URL — ใส่ค่าผิดชนิด (เช่น direct endpoint แทน pooled) จะไปพังตอน runtime
 * บน production แทนที่จะพังตอน build ซึ่งแก้ได้ถูกกว่ามาก
 *
 * ⚠️ ทุกข้อความที่มี connection string ต้องผ่าน redactConnectionString ก่อน —
 *    build log ของ Vercel คนอื่นอ่านได้ และในนั้นมีรหัสผ่านฐานข้อมูลประชาชน (PDPA)
 *
 * @param raw ค่าดิบจาก env — undefined/ว่าง จะคืนผลว่างเปล่า เพราะการตรวจว่า "มีค่าไหม"
 *            เป็นหน้าที่ของ required[] ใน verify-env.ts ไม่ใช่ของฟังก์ชันนี้
 */
export function checkDatabaseUrl(raw: string | undefined, isProduction: boolean): EnvCheckResult {
  const result: EnvCheckResult = { errors: [], warnings: [] };
  if (!raw) return result;

  const parsed = parseUrl(raw);
  if (!parsed) {
    result.errors.push(`✗ DATABASE_URL — parse ไม่ผ่าน: ${redactConnectionString(raw)}`);
    return result;
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    result.errors.push(
      `✗ DATABASE_URL — ต้องขึ้นต้นด้วย postgresql:// (ปัจจุบัน: ${parsed.protocol}//)`,
    );
    return result;
  }

  if (!isProduction) return result;

  if (isLocalHost(parsed.hostname)) {
    result.errors.push('✗ DATABASE_URL — production ห้ามชี้ไป localhost');
  }

  const sslmode = parsed.searchParams.get('sslmode');
  if (!sslmode || !TLS_SSLMODES.has(sslmode)) {
    result.errors.push(
      `✗ DATABASE_URL — production ต้องบังคับ TLS: เติม ?sslmode=require ต่อท้าย connection string ` +
        `(รับ verify-ca/verify-full ด้วย) — ปัจจุบัน: ${sslmode ?? 'ไม่ได้ระบุ'}`,
    );
  }

  // § เตือนอย่างเดียว ไม่บล็อก — ยังไม่ยืนยันว่า managed provider ตั้งชื่อ pooled host
  // ว่า "-pooler" เสมอไหม การ fail ตรงนี้เสี่ยงบล็อก deploy ที่ถูกต้องมากกว่า
  // เสี่ยงปล่อยของผิดผ่าน
  if (parsed.hostname.includes('neon.tech') && !parsed.hostname.includes('-pooler')) {
    result.warnings.push(
      '⚠ DATABASE_URL ดูเหมือนเป็น direct endpoint ของ Neon — app ควรใช้ pooled endpoint',
    );
  }

  return result;
}

/**
 * AUTH_URL — production ต้องเป็น https:// + canonical domain (ไม่ใช่ localhost)
 * กัน deploy จริงที่ AUTH_URL ยังเป็น placeholder localhost → secure-cookie flag off
 * + callback URL พัง
 */
export function checkAuthUrl(raw: string | undefined, isProduction: boolean): EnvCheckResult {
  const result: EnvCheckResult = { errors: [], warnings: [] };
  if (!raw || !isProduction) return result;

  const parsed = parseUrl(raw);
  if (!parsed) {
    result.errors.push(`✗ AUTH_URL — URL ไม่ถูกต้อง (parse ไม่ผ่าน): ${raw}`);
    return result;
  }

  if (parsed.protocol !== 'https:') {
    result.errors.push(`✗ AUTH_URL — production ต้องเป็น https:// (ปัจจุบัน: ${parsed.protocol}//)`);
  }
  if (isLocalHost(parsed.hostname)) {
    result.errors.push('✗ AUTH_URL — production ห้ามใช้ localhost (ตั้งเป็น canonical domain)');
  }

  return result;
}
