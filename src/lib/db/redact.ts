/**
 * redact — mask รหัสผ่านใน Postgres connection string ก่อนส่งออก log
 *
 * error ของ postgres-js / drizzle-kit / pg_dump มักฝัง connection string เต็ม ๆ มาใน
 * ข้อความ ซึ่งจะไปโผล่ใน Vercel build log และ CI log ที่คนอื่นอ่านได้
 *
 * § mask เฉพาะรหัสผ่าน ไม่ mask host/user/database
 * host กับ database ไม่ใช่ความลับและจำเป็นตอน debug ว่าต่อผิดฐานข้อมูลหรือเปล่า
 * การ mask ทั้ง URL ทำให้ log ไร้ประโยชน์โดยไม่ได้ความปลอดภัยเพิ่ม
 */

// § รหัสผ่านที่ถูกต้องต้อง URL-encode `@` เป็น `%40` อยู่แล้ว จึงตัด `@` ออกจาก
// character class ได้โดยไม่พลาดเคสจริง
const PG_URL_CREDENTIALS = /(postgres(?:ql)?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;

export function redactConnectionString(input: string): string {
  return input.replace(PG_URL_CREDENTIALS, '$1$2:***@');
}

/**
 * ดึงข้อความจาก error ที่ไม่รู้ชนิด แล้ว redact ก่อนคืน — ใช้ใน catch block
 * (postgres-js โยน object ที่ไม่ใช่ Error ในบางเคส จึงต้อง narrow ก่อน)
 */
export function redactErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactConnectionString(message);
}
