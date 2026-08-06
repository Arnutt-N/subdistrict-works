import { describe, expect, it } from 'vitest';
import { ROLE_LABELS_TH } from './role-badge';
import { ALL_ROLES } from '@/lib/auth/roles';

/**
 * Gate ของป้ายบทบาทภาษาไทย
 *
 * § ทำไมต้องมีไฟล์นี้
 * `ROLE_LABELS_TH` ถูก render ให้ผู้ใช้เห็นทั้งใน /admin/users และ /admin/profile
 * แต่ไม่เคยมี assertion ใดแตะมันเลย — `Record<UserRole, string>` การันตีแค่ว่า
 * "มีครบทุก key และเป็น string" ไม่ได้การันตีว่าข้อความถูก ตอน de-identify (PR #3-#5)
 * เปลี่ยน head จาก 'หัวหน้ากอง' เป็น 'หัวหน้า' จึงไม่มีอะไรจับได้ถ้าค่าเก่ากลับมา
 */
describe('ROLE_LABELS_TH', () => {
  it('มีป้ายครบทุก role ที่ประกาศใน ALL_ROLES', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS_TH[role]).toBeTruthy();
    }
    expect(Object.keys(ROLE_LABELS_TH)).toHaveLength(ALL_ROLES.length);
  });

  it('ไม่มีคำนำหน้าหน่วยงาน "กอง" หลงเหลือในป้ายใด (de-identify)', () => {
    for (const [role, label] of Object.entries(ROLE_LABELS_TH)) {
      expect(label, `role "${role}"`).not.toContain('กอง');
    }
  });

  it('ใช้ "หัวหน้า" สำหรับ head — ไม่ใช่ "หัวหน้ากอง" แบบเดิม', () => {
    expect(ROLE_LABELS_TH.head).toBe('หัวหน้า');
  });

  it('แยก head ออกจาก chief ได้ (คนละตำแหน่ง คนละป้าย)', () => {
    expect(ROLE_LABELS_TH.head).not.toBe(ROLE_LABELS_TH.chief);
  });
});
