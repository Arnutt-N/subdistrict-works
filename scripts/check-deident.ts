/**
 * check-deident.ts — ตรวจว่าข้อมูลใน DB ยังมีคำนำหน้าหน่วยงาน "กอง" ค้างอยู่ไหม
 *
 * § ทำไมต้องมีสคริปต์นี้แยกจากเทสต์
 * การ de-identify (PR #3-#5) แก้แต่ซอร์สโค้ด ส่วนชื่อหน่วยงานที่ผู้ใช้เห็นจริง
 * อ่านจาก departments.name ใน DB และ scripts/seed.ts มี guard ที่ข้ามการ insert
 * ถ้ามีข้อมูลอยู่แล้ว — environment ที่ seed ไปก่อน PR #3 จึงไม่มีทางได้ค่าใหม่
 * migration 0014 เป็นตัวแก้ ส่วนไฟล์นี้คือด่านพิสูจน์ว่ามันทำงานจริง (before/after)
 *
 * เทสต์ปกติทำแทนไม่ได้เพราะต้องต่อ DB ของ environment จริง ไม่ใช่ fixture
 *
 *   npx tsx scripts/check-deident.ts                       # ใช้ DATABASE_URL จาก .env.local
 *   node run-with-neon.mjs npx tsx scripts/check-deident.ts # ใช้ของ Neon
 *
 * READ-ONLY — ไม่มี statement ที่เขียนข้อมูล
 */
import { config } from 'dotenv';
import { createPgClient } from '../src/lib/db/client';

config({ path: '.env.local', override: false });

const sql = createPgClient();

async function main() {
  const departments = await sql<{ name: string; slug: string }[]>`
    SELECT name, slug FROM departments ORDER BY slug`;

  console.log('── departments ──');
  for (const d of departments) console.log(`  ${d.slug.padEnd(16)} ${d.name}`);

  const [faqTotal] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM chat_faq`;
  const [faqStale] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM chat_faq
    WHERE answer LIKE '%กอง%' OR keywords::text LIKE '%กอง%'`;
  const faqDuplicates = await sql<{ question: string; n: number }[]>`
    SELECT question, count(*)::int AS n FROM chat_faq
    GROUP BY question HAVING count(*) > 1`;

  console.log('\n── chat_faq ──');
  console.log(`  แถวทั้งหมด:      ${faqTotal?.n ?? 0}`);
  console.log(`  แถวที่มี "กอง":  ${faqStale?.n ?? 0}`);
  console.log(`  คำถามที่ซ้ำ:     ${faqDuplicates.length}`);
  for (const r of faqDuplicates) console.log(`    ${r.n}× ${r.question}`);

  const deptStale = departments.filter((d) => d.name.includes('กอง'));
  const total = deptStale.length + (faqStale?.n ?? 0);

  console.log('\n── สรุป ──');
  console.log(`  departments ที่มี "กอง": ${deptStale.length}`);
  console.log(`  chat_faq ที่มี "กอง":    ${faqStale?.n ?? 0}`);
  console.log(total === 0 ? '  ✓ สะอาด — ไม่ต้อง backfill' : '  ✗ ต้องรัน migration 0014');

  await sql.end();
  // exit code สื่อสถานะให้ CI/สคริปต์อื่นอ่านได้ ไม่ต้อง parse ข้อความ
  process.exit(total === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
