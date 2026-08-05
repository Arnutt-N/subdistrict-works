import { describe, expect, test, vi } from 'vitest';

// § mock randomInt เพื่อให้ assert รูปแบบผลลัพธ์ได้แน่นอน (โดยเฉพาะเคส zero-padding
// ที่สุ่มเองแทบไม่มีวันเจอ) — case-tracking ใช้ node:crypto เฉพาะ randomInt ตัวเดียว
const randomInt = vi.hoisted(() => vi.fn());
vi.mock('node:crypto', () => ({ randomInt }));

import { generateTrackingCode, normalizeTrackingCode } from './case-tracking';

describe('generateTrackingCode', () => {
  test('produces the DEMO prefix followed by exactly 9 digits', () => {
    randomInt.mockReturnValue(483729156);
    expect(generateTrackingCode()).toBe('DEMO483729156');
  });

  test('left-pads with zeros so the digit count is always 9', () => {
    randomInt.mockReturnValue(1);
    expect(generateTrackingCode()).toBe('DEMO000000001');
  });

  test('draws from the full 9-digit space', () => {
    randomInt.mockReturnValue(0);
    generateTrackingCode();
    expect(randomInt).toHaveBeenCalledWith(0, 1_000_000_000);
  });

  // § เทสต์ที่สำคัญที่สุดในไฟล์นี้: ผูก generate เข้ากับ normalize
  // ถ้าวันหน้าเปลี่ยน prefix หรือจำนวนหลักแล้วแก้ไม่ครบทั้งสองฝั่ง เทสต์นี้จะจับได้ทันที
  test('every generated code round-trips through normalizeTrackingCode', () => {
    for (const value of [0, 1, 483729156, 999999999]) {
      randomInt.mockReturnValue(value);
      const code = generateTrackingCode();
      expect(normalizeTrackingCode(code)).toBe(code);
    }
  });
});

describe('normalizeTrackingCode', () => {
  test('returns a well-formed code unchanged', () => {
    expect(normalizeTrackingCode('DEMO123456789')).toBe('DEMO123456789');
  });

  test('uppercases lowercase input', () => {
    expect(normalizeTrackingCode('demo123456789')).toBe('DEMO123456789');
  });

  test('strips the spacing users see on screen', () => {
    expect(normalizeTrackingCode('DEMO 1234 5678 9')).toBe('DEMO123456789');
  });

  test('strips dashes users may type', () => {
    expect(normalizeTrackingCode('DEMO-123456789')).toBe('DEMO123456789');
  });

  // § รหัสรูปแบบเก่า (HN + 9 หลัก) ต้องไม่ผ่าน — ไม่งั้นเลขที่เคยแจกไปแล้วจะยัง
  // resolve ได้ทั้งที่ระบบเปลี่ยนรูปแบบไปแล้ว
  test('rejects the retired HN format', () => {
    expect(normalizeTrackingCode('HN123456789')).toBeNull();
  });

  test('rejects one digit too few', () => {
    expect(normalizeTrackingCode('DEMO12345678')).toBeNull();
  });

  test('rejects one digit too many', () => {
    expect(normalizeTrackingCode('DEMO1234567890')).toBeNull();
  });

  test('rejects a non-digit body', () => {
    expect(normalizeTrackingCode('DEMOabcdefghi')).toBeNull();
  });

  test('rejects a bare number with no prefix', () => {
    // ยาว 13 ตัวเท่ากับรหัสจริง และเท่ากับเลขบัตรประชาชน — ต้องไม่หลุดผ่าน
    expect(normalizeTrackingCode('1234567890123')).toBeNull();
  });

  test('rejects an empty string', () => {
    expect(normalizeTrackingCode('')).toBeNull();
  });

  test('rejects text with the prefix embedded rather than leading', () => {
    expect(normalizeTrackingCode('XDEMO123456789')).toBeNull();
  });
});
