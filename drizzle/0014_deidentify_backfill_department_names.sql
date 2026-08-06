-- de-identify backfill — ลบคำนำหน้า "กอง" ออกจากข้อมูลที่ seed ไปแล้ว
--
-- § ทำไมต้องมี migration ไม่ใช่แค่แก้ seed script
-- scripts/seed.ts:75 มี guard `if (existingDept) ข้าม` ครอบการ insert ทั้งก้อน
-- environment ที่เคย seed ก่อน PR #3 จึงไม่มีทางได้รับค่าใหม่เลย — ยืนยันแล้วบน
-- Neon production (2026-08-06) ว่ายังเก็บ กองการศึกษา/กองคลัง/กองช่าง ครบสามแถว
-- และชื่อหน่วยงานที่แสดงบนหน้าเว็บอ่านจาก departments.name ไม่ใช่ค่าคงที่ในโค้ด
-- แปลว่าการแก้ซอร์สใน PR #3-#5 ไม่เคยไปถึงสิ่งที่ประชาชนเห็นจริง
--
-- § ทำไมไม่ replace คำว่า "กอง" แบบเหมารวม
-- จะทำลายคำไทยที่มี "กอง" โดยชอบธรรม (กองทุน, ทรายกองดิน ซึ่งมีจริงใน
-- scripts/geodata/) และจะแตะข้อความที่แอดมินพิมพ์เองผ่าน /admin/master-data
-- ไฟล์นี้จึงแทนเฉพาะค่าที่ seed script เคยเขียนไว้เท่านั้น

-- 1) departments.name — ชื่อที่ผู้ใช้เห็นทั้งใน /admin และหน้าติดตามเรื่อง
--
--    § name มี unique constraint (schema.ts:137) ถ้า environment ใดมีทั้งชื่อเก่า
--    และชื่อใหม่อยู่พร้อมกัน UPDATE จะชน constraint แล้ว rollback ทั้ง migration
--    จึง guard ด้วย NOT EXISTS ให้ข้ามแถวนั้นแทน เพราะการรวมสองหน่วยงานเข้าด้วยกัน
--    ต้องย้าย FK ของ cases/users ตามไปด้วย ซึ่งเป็นการตัดสินใจเชิงข้อมูล
--    ไม่ใช่สิ่งที่ migration ควรเดาเอง
UPDATE "departments" SET "name" = 'คลัง'
WHERE "name" = 'กองคลัง'
  AND NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'คลัง');
--> statement-breakpoint

UPDATE "departments" SET "name" = 'ช่าง'
WHERE "name" = 'กองช่าง'
  AND NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'ช่าง');
--> statement-breakpoint

UPDATE "departments" SET "name" = 'การศึกษา'
WHERE "name" = 'กองการศึกษา'
  AND NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'การศึกษา');
--> statement-breakpoint

-- 2) chat_faq.answer — ข้อความที่ LINE bot ส่งให้ประชาชนจริง
UPDATE "chat_faq"
SET "answer" = replace("answer", 'กองคลัง', 'คลัง'),
    "updated_at" = now()
WHERE "answer" LIKE '%กองคลัง%';
--> statement-breakpoint

-- 3) chat_faq.keywords — jsonb array ของ string (schema.ts:560)
--
--    § ครอบด้วยเครื่องหมายคำพูดทั้งสองข้าง ('"กองคลัง"') เพื่อให้แทนทั้ง element
--    ไม่ใช่ substring ที่อยู่กลาง keyword อื่นซึ่งยาวกว่า
--    Postgres เก็บ UTF-8 ภาษาไทยใน jsonb แบบ literal ไม่ escape เป็น \u
--    การ cast ผ่าน ::text แล้ว replace จึงตรงไปตรงมา
UPDATE "chat_faq"
SET "keywords" = replace("keywords"::text, '"กองคลัง"', '"คลัง"')::jsonb,
    "updated_at" = now()
WHERE "keywords"::text LIKE '%"กองคลัง"%';
