import { describe, expect, it, vi } from 'vitest';

// § getWelcomeMessages เป็น pass-through ล้วน — ไม่ได้ตัดสินใจอะไรเกี่ยวกับ "เนื้อหา"
// ข้อความเลย เนื้อหาจริงมาจาก DEFAULTS ใน ../settings (หรือค่าที่แอดมินตั้งไว้ใน DB)
//
// เดิมไฟล์นี้ mock ให้คืนข้อความเต็มรูปแบบแล้ว assert ว่ามีชื่อหน่วยงาน/มี prefix ของ
// รหัสติดตาม ซึ่งเท่ากับทดสอบสตริงที่ไฟล์เทสต์เขียนขึ้นเอง ไม่ใช่ค่า default จริง —
// เทสต์แบบนั้นผ่านเสมอแม้ค่า default จริงจะไม่มีข้อความเหล่านั้น (ซึ่งเป็นกรณีจริง:
// DEFAULTS.welcome_message ไม่เคยพูดถึงรูปแบบรหัสติดตามเลย ทั้งก่อนและหลังเปลี่ยนชื่อ)
//
// จึงเปลี่ยนมาใช้ค่า sentinel เพื่อทดสอบเฉพาะสัญญาที่ฟังก์ชันนี้รับผิดชอบจริง
// คือการห่อข้อความที่ได้มาเป็น LINE text message โดยไม่ดัดแปลง
const SENTINEL = '<<welcome-message-from-settings>>';

vi.mock('../settings', () => ({
  getChatSetting: vi.fn(async (key: string) => (key === 'welcome_message' ? SENTINEL : null)),
}));

import { getWelcomeMessages } from './welcome';

describe('getWelcomeMessages', () => {
  it('returns exactly one message', async () => {
    expect(await getWelcomeMessages()).toHaveLength(1);
  });

  it('wraps the configured welcome text as a LINE text message, unmodified', async () => {
    const [first] = await getWelcomeMessages();
    expect(first).toEqual({ type: 'text', text: SENTINEL });
  });
});
