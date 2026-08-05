import postgres from 'postgres';
import { pgClientOptions } from './pg-options';
import { redactErrorMessage } from './redact';

/**
 * createPgClient — ทางเข้าเดียวสำหรับสร้าง postgres-js client ทั้งโปรเจกต์
 *
 * รวมสามอย่างที่ทุกจุดต้องทำถูก "พร้อมกัน" ไว้ที่เดียว แทนที่จะเป็นข้อตกลงที่คนจำเอง:
 *
 *   1. ตรวจว่ามี connection string — เดิมสคริปต์ใช้ `process.env.DATABASE_URL!` ซึ่ง
 *      ถ้าไม่มีค่า postgres() จะไม่ throw แต่ตกไปใช้ default แบบ libpq (localhost +
 *      OS user) แล้วไปต่อฐานผิดตัวหรือได้ ECONNREFUSED ที่อ่านไม่รู้เรื่อง
 *   2. spread option — parseOptions ของ postgres-js เขียนทับ object ที่รับมาได้
 *      (`o.no_prepare && (o.prepare = false)`, `'timeout' in o && (...)`) การส่ง
 *      object ที่ freeze ไว้ตรง ๆ จะกลายเป็น TypeError ถ้าวันหน้ามีใครเติม key พวกนั้น
 *   3. redact รหัสผ่านก่อนโยน error ต่อ — build log ของ Vercel คนอื่นอ่านได้ (PDPA)
 *
 * § ทำไมต้อง try/catch ทั้งที่ postgres() ต่อ DB แบบ lazy
 * มัน throw แบบ synchronous ตอน parse connection string ไม่ผ่าน ทดสอบกับ Node ที่
 * โปรเจกต์ใช้แล้วพบว่าได้แค่ "Invalid URL" ไม่ echo ค่า URL กลับมา แต่ error ชนิดอื่น
 * จาก postgres-js หรือ Node เวอร์ชันอื่นอาจแนบ input มาด้วย — redact ไว้ราคาถูกกว่ามาก
 *
 * § จงใจไม่แนบ { cause: error }
 * util.inspect พิมพ์ cause chain ออกมาทั้งสาย ซึ่งเป็นสิ่งที่ Vercel log และ error
 * tracker ใช้ การแนบ cause ที่ยังไม่ถูก redact จึงเปิดช่องเดียวกับที่เพิ่งปิดไป
 * และ error บนเส้นทางนี้เป็น TypeError ของ URL ล้วน ไม่มี SQLSTATE ให้เก็บ
 */
export function createPgClient(url = process.env.DATABASE_URL): postgres.Sql {
  if (!url) {
    throw new Error('DATABASE_URL is not set (expected postgresql://...)');
  }

  try {
    return postgres(url, { ...pgClientOptions });
  } catch (error: unknown) {
    throw new Error(`เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ${redactErrorMessage(error)}`);
  }
}
