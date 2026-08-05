import { describe, expect, test } from 'vitest';
import { createPgClient } from './client';
import { pgClientOptions } from './pg-options';

// § ทดสอบผ่าน createPgClient ไม่ใช่ assert ค่าคงที่ตรง ๆ
// postgres-js เปิด sql.options ให้อ่านค่าที่ resolve แล้วจริง ๆ เทสต์ชุดนี้จึงยืนยันว่า
// option "ถึงมือ library" ไม่ใช่แค่ยืนยันว่าเราประกาศตัวแปรไว้ถูก — ถ้าวันหน้ามีใคร
// สร้าง client โดยไม่ผ่าน factory หรือลืมส่ง option เทสต์นี้จะจับได้
const VALID_URL = 'postgresql://user:pw@127.0.0.1:5432/db';

describe('createPgClient', () => {
  test('disables prepared statements so pooled endpoints stay safe', async () => {
    const sql = createPgClient(VALID_URL);
    expect(sql.options.prepare).toBe(false);
    await sql.end();
  });

  test('keeps the pool small enough for serverless instances', async () => {
    const sql = createPgClient(VALID_URL);
    expect(sql.options.max).toBeLessThanOrEqual(5);
    await sql.end();
  });

  test('sets a non-zero idle timeout so connections return to the pooler', async () => {
    const sql = createPgClient(VALID_URL);
    expect(sql.options.idle_timeout).toBeGreaterThan(0);
    await sql.end();
  });

  test('leaves the shared options object untouched', async () => {
    const before = { ...pgClientOptions };
    const sql = createPgClient(VALID_URL);
    await sql.end();
    expect({ ...pgClientOptions }).toEqual(before);
  });

  test('fails loudly when no connection string is configured', () => {
    // เดิมสคริปต์ใช้ `process.env.DATABASE_URL!` แล้วปล่อยให้ postgres() ตกไปใช้
    // default ของ libpq (localhost) เงียบ ๆ — ต้อง throw แทน
    expect(() => createPgClient('')).toThrow(/DATABASE_URL is not set/);
  });

  // § assert ว่า "ไม่มีรหัสผ่านหลุด" ไม่ใช่ว่า "ต้องเห็น ***"
  // Node ที่โปรเจกต์ใช้คืน error เป็น "Invalid URL" เปล่า ๆ ไม่ echo ค่า URL กลับมา
  // จึงไม่มีอะไรให้ mask ในเส้นทางนี้ — redact เป็น defense-in-depth เผื่อ error ชนิดอื่น
  // การทดสอบ redactConnectionString โดยตรงอยู่ใน redact.test.ts แล้ว
  test('never leaks the password into the thrown message', () => {
    expect(() => createPgClient('postgresql://dbuser:SUPERSECRET@host:notaport/db')).toThrow();
    try {
      createPgClient('postgresql://dbuser:SUPERSECRET@host:notaport/db');
    } catch (error) {
      expect((error as Error).message).not.toContain('SUPERSECRET');
    }
  });
});
