import { randomInt } from 'node:crypto';

/**
 * Tracking Code — เลขติดตามสำหรับ citizen (คล้าย EMS ไปรษณีย์ไทย)
 *
 * รูปแบบ: `DEMO` + 9 หลักสุ่ม (เช่น `DEMO483729156`)
 *   - `DEMO` = ข้อมูลสาธิต
 *   - 9 หลักสุ่มจาก crypto.randomInt → entropy ≈ 30 บิต (10^9 ค่า)
 *   - ผสมกับ rate limit 10 ครั้ง/5 นาที → brute force ไม่ได้ในทางปฏิบัติ
 *
 * lookup ผ่าน GET /api/cases/[id] ใช้ trackingCode แทน UUID PK
 * เพื่อไม่เปิดเผย UUID v7 ที่ timestamp-ordered และเดาได้
 */

const PREFIX = 'DEMO';
const DIGITS = 9;
const MAX_VALUE = 10 ** DIGITS; // 1_000_000_000

// § เขียนเป็น literal ไม่ derive จาก PREFIX/DIGITS ด้วย new RegExp
// prefix ยังถูก hardcode ในข้อความที่ผู้ใช้เห็นอีกหลายจุด (LINE bot, /track, FAQ, Hero)
// เวลาจะเปลี่ยน prefix เครื่องมือที่ใช้คือ grep — pattern ที่ประกอบจากตัวแปรจะ grep ไม่เจอ
// ทำให้ตัว validator ที่เป็นเจ้าของกฎหายไปจากผลค้นหา ซึ่งอันตรายกว่าประโยชน์ที่ได้
// การผูก generate เข้ากับ validate มีเทสต์ round-trip ใน case-tracking.test.ts คุมอยู่แล้ว
const CODE_PATTERN = /^DEMO\d{9}$/;

/**
 * สุ่ม tracking code รูปแบบ `DEMO` + 9 หลัก
 * หลักนำหน้าเติม 0 ให้ครบ 9 หลักเสมอ (เช่น DEMO000000001)
 */
export function generateTrackingCode(): string {
  const num = randomInt(0, MAX_VALUE);
  return PREFIX + num.toString().padStart(DIGITS, '0');
}

/**
 * Normalize input ที่ citizen กรอก (รับได้ทั้งมี/ไม่มีเว้นวรรค, ตัวเล็ก/ใหญ่)
 * @returns รูปแบบมาตรฐาน `DEMOxxxxxxxxx` หรือ null ถ้า format ผิด
 *
 * ผู้เรียกควร return 404 ไม่ใช่ 400 เมื่อได้ null เพื่อไม่เปิดเผยว่า format ผิด (กัน enumeration)
 */
export function normalizeTrackingCode(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase();

  // § ตรวจรูปแบบเข้ม ไม่งั้น reject เป็น "ไม่พบเรื่อง"
  if (!CODE_PATTERN.test(cleaned)) {
    return null;
  }

  return cleaned;
}
