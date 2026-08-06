# Plan: ปิดงานที่ค้างจาก de-identify + theme rotation

> สถานะ: **rev.2** — แก้ตาม review gate (AGENT.md §4) เมื่อ 2026-08-06
> Source PRD: `.claude/PRPs/prds/theme-rotation-and-deidentify-followup.prd.md` (rev.2)

## Summary

ปิด finding ทั้งหมดจาก code review ของ `f73df1e..6fda6ef` แบ่งเป็น 2 tranche — **A** แก้ข้อความ/ตัวเลข/คอมเมนต์ที่บอกสีผิดหลัง theme rotation + เติม assertion ที่ขาด 2 ไฟล์ (ไม่แตะค่า token) และ **B** เพิ่ม migration `0014` ที่ทำให้ de-identify ไปถึงข้อมูลจริงบน production พร้อมปิดช่อง `seed-faq.ts` ที่รันซ้ำแล้วได้แถวซ้ำ

## User Story

As a **ประชาชนที่ใช้ระบบและเจ้าหน้าที่ที่ดูแลมัน**,
I want **ชื่อหน่วยงานที่เห็นบนเว็บและที่บอทตอบ ตรงกับที่ระบบตั้งใจจะแสดง และหน้าอ้างอิง design system บอกสีที่ใช้จริง**,
So that **ระบบไม่ขัดแย้งกับตัวเอง และงาน UI รอบถัดไปไม่เดินตามข้อมูลที่ผิด**.

## Metadata

- **Complexity**: **Low–Medium** (18 ไฟล์, ~160 บรรทัดสุทธิ)
- **Estimated Files**: 3 CREATE (migration, `role-badge.test.ts`, check script) + 15 UPDATE
- **Branch**: `fix/review-followup-theme-and-deidentify`

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| **P0** | `drizzle/0013_pdpa_backfill_case_updates.sql` | 1-49 | แม่แบบ migration เขียนมือ — รูปแบบคอมเมนต์ `§`, `--> statement-breakpoint`, การอธิบายว่าทำไมต้องเป็น migration |
| **P0** | `drizzle/meta/_journal.json` | ทั้งไฟล์ | ต้องเพิ่ม entry idx 14 ด้วยมือ ไม่งั้น `drizzle-kit migrate` ข้ามไฟล์เงียบ ๆ |
| **P0** | `scripts/seed-faq.ts` | 82-105 | ⚠️ ไฟล์นี้ห่อด้วย `async function main()` + `main().catch()` **ไม่ใช่** top-level await แบบ `seed.ts` — guard ต้องอยู่ **ข้างใน** `main()` |
| **P0** | `scripts/seed.ts` | 73-79 | รูปแบบข้อความ guard (`⏭  ... — ข้าม`) ที่จะเลียน |
| **P0** | `src/lib/db/schema.ts` | 130-147, 551-569 | `departments.name` unique · `chat_faq.keywords` jsonb · `question` ไม่ unique |
| **P1** | `.storybook/preview.tsx` | ทั้งไฟล์ | decorator บรรทัด 44 ตั้ง `data-theme` บน div ที่มี `bg-surface` — เป็นเหตุผลที่ `var()` ใน backgrounds addon ใช้ไม่ได้ |
| **P1** | `src/styles/tokens.css` | 1-58 | รูปแบบคอมเมนต์ `§` ที่ต้องรักษา |
| **P1** | `DESIGN.md` | 140-175, 605 | ตารางเพดานชุดเดียวกับ `tokens.css` ที่ต้องแก้คู่กัน |
| **P1** | `src/lib/line/messages/rich-menu.test.ts` | ทั้งไฟล์ | ใช้ `it` (ไม่ใช่ `test`) — รูปแบบที่จะเพิ่ม assertion |
| **P1** | `src/lib/auth/roles.ts` | ทั้งไฟล์ | `UserRole` union ที่ `role-badge.test.ts` จะ assert ให้ครบทุกค่า |

---

## Tranche A — ปิดของที่ตกหล่นจาก theme rotation

ไม่มี dependency ระหว่างข้อ — แก้เรียงลงมาได้

### A1. `src/app/admin/design/_lib/catalog.ts:43` — ข้อความที่ผู้ใช้เห็น

```diff
-    title: 'สีหลัก — น้ำเงิน 255°',
+    title: 'สีหลัก — maroon 24°',
```

### A2. `src/app/admin/design/_lib/catalog.ts:50` + `DESIGN.md:159` — เลิกอ้างการใช้งานที่ไม่มีจริง

`--color-accent-700` ถูกระบุว่าใช้เป็น "hover ของปุ่ม" แต่ grep ทั้ง `src/` ไม่พบ component ไหนใช้ (E16) แก้ให้ตรงความจริง:
```diff
-      { name: '--color-accent-700', use: 'hover ของปุ่ม' },
+      { name: '--color-accent-700', use: 'สำรองไว้สำหรับ hover ปุ่ม — ยังไม่มีที่ใช้จริง' },
```
และแถวเดียวกันใน `DESIGN.md:159`

### A3. `.storybook/preview.tsx:20-23` — พื้นตรวจ a11y ธีมมืด

**ตัดสินแล้ว: hardcode ค่าที่ถูกต้อง + แก้คอมเมนต์ให้บอกเหตุผลจริง**

ทางเลือกที่พิจารณาแล้วปฏิเสธ:
- *อ้าง `var(--color-surface)` เหมือนบรรทัด light* — **ใช้ไม่ได้** addon inject `.sb-show-main { background: ... }` เข้า `document.head` ซึ่งเป็น **ancestor** ของ div ที่ decorator ตั้ง `data-theme` (บรรทัด 44) → `var()` resolve เป็นค่า `:root` (light) เสมอ
- *ให้ decorator ตั้ง `data-theme` บน `document.documentElement`* — แก้ได้จริงและสะอาดกว่า แต่เปลี่ยนพฤติกรรม decorator ทั้งตัวเพื่อพื้นหลังที่ decorator เองวาดทับอยู่แล้ว (`min-h-dvh bg-surface`) จนแทบไม่มีใครเห็น — ผลตอบแทนไม่คุ้ม blast radius
- *เพิ่ม token เสริมใน `tokens.css`* — เพิ่ม token เพื่อ tooling อย่างเดียว ขัด YAGNI

```diff
     backgrounds: {
       options: {
-        // § อ้าง token ตรง ๆ (ไฟล์นี้ import tokens.css แล้วด้านบน) — เดิมเป็นค่าดิบ
-        // hue 245 ซึ่งตกค้างจาก palette ก่อน #55 ทำให้ทุก story ตรวจบนพื้นผิดสี
+        // § light อ้าง token ตรง ๆ ได้ แต่ dark ต้อง hardcode
+        // addon ทาสีที่ `.sb-show-main` ซึ่งเป็น ancestor ของ div ที่ decorator
+        // ตั้ง [data-theme] ไว้ (ดูด้านล่าง) → var(--color-surface) จึง resolve
+        // เป็นค่า :root (light) เสมอ ไม่ว่าจะ toggle ธีมอะไร
+        // ⚠️ ค่า dark ด้านล่างเป็นสำเนาของ tokens.css [data-theme='dark']
+        //    --color-surface ต้องแก้ตามทุกครั้งที่หมุน hue (เคยตกค้างมาแล้ว 2 รอบ:
+        //    hue 245 → 255 → ปัจจุบัน 24)
         light: { name: 'light (default)', value: 'var(--color-surface)' },
-        dark: { name: 'dark (intentional)', value: 'oklch(15% 0.015 255)' },
+        dark: { name: 'dark (intentional)', value: 'oklch(15% 0.015 24)' },
       },
     },
```

### A4. `src/styles/tokens.css:49-50` — ตารางเพดาน gamut

ค่าจริงที่ hue 24 (binary search, ยืนยันโดย reviewer อิสระ 2 ราย):

| L | เขียนไว้ | จริง | | L | เขียนไว้ | จริง |
|---|---|---|---|---|---|---|
| 94% | 0.04 | **0.030** | | 70% | 0.17 | **0.191** |
| 90% | 0.06 | **0.052** | | 42% | 0.18 | **0.170** |
| 80% | 0.13 | **0.114** | | 37% | 0.16 | **0.150** |
| 75% | 0.15 | **0.150** | | 33% | 0.14 | **0.134** |

แก้ตัวเลขทั้ง 8 ค่า และ**แทนประโยคที่เป็นเท็จ**ที่บรรทัด 53 (`ค่าทั้งชุดจึงคุมให้อยู่ในเพดานทุกตัว`) ด้วยข้อความที่ระบุข้อยกเว้นจริง:
> ค่าฝั่ง light อยู่ในเพดานทุกตัว — ยกเว้น dark `--color-accent-700` (80% 0.12) ที่เกินเพดาน 0.114 และถูก gamut-map จริง คงไว้เพราะยังไม่มี component ไหนใช้ token นี้

### A5. `src/styles/tokens.css:39` + `DESIGN.md:147` — คำว่า "เป๊ะ"

`oklch(33.3% 0.131 24)` แปลงกลับได้ `#6a0410` ไม่ใช่ `#6A040F` แก้ถ้อยคำจาก "ตรึงไว้ที่ #6A040F เป๊ะ" เป็นการระบุค่าที่ปัดจริง
*(หมายเหตุ: `DESIGN.md:160` ไม่มีคำว่า "เป๊ะ" — เป็นแถวตารางที่เขียน `= #6A040F` เฉย ๆ แก้เครื่องหมาย `=` เป็น `≈` แทน)*

### A6. `src/styles/tokens.css:9-10` — ข้อยกเว้นที่ครอบไม่ครบ

คอมเมนต์บอกว่าหมุน hue อย่างเดียว "ยกเว้นตระกูล accent ฝั่ง light" แต่ฝั่ง dark ก็ปรับ chroma: `accent-strong` 0.15→0.14, `accent-700` 0.13→0.12 → เพิ่มฝั่ง dark เข้าไปในข้อยกเว้น

### A7. `DESIGN.md` — ตารางเพดาน + tagline

- บรรทัด 166-171: แก้ตัวเลขให้ตรงกับ A4 (**ต้องอยู่ commit เดียวกับ A4**)
- บรรทัด 605: `palette เป็น blue civic + amber royal` → `maroon civic + amber royal`

### A8. คอมเมนต์ "น้ำเงิน"/"Emerald" ค้าง 6 จุด

| ไฟล์:บรรทัด | ปัจจุบัน |
|---|---|
| `src/components/ui/button.tsx:7` | `ปุ่ม primary = Emerald gradient + white text` |
| `src/components/ui/button.tsx:9` | `focus-visible ring น้ำเงิน` |
| `src/components/site/brand-mark.tsx:10` | `ใช้ gradient น้ำเงินเดียวกับปุ่ม primary` |
| `src/components/admin/kpi-card.tsx:8,12` | `icon สีน้ำเงิน/amber`, `accent น้ำเงิน (tech/smart)` |
| `src/components/admin/role-badge.tsx:8` | `Palette: น้ำเงิน (supervisor)` |
| `src/components/ui/case-status-badge.tsx:8` | `Palette: น้ำเงิน (primary)` |
| `src/app/admin/chat/_lib/labels.ts:18` | `แมป: น้ำเงิน = ระบบ/บอท` |

เปลี่ยน "น้ำเงิน"/"Emerald" → "maroon" **ไม่แตะโค้ด**
🔴 **ห้ามแตะ** `tokens.css:5,9,12,40` และ `DESIGN.md:143,146` — เป็นข้อความประวัติ palette ที่ถูกต้อง

### A9. `src/components/landing/Navbar.tsx:28-38` — ยุบ span ที่ซ้ำ

```diff
           {/* Logo — บรรทัดเดียวเสมอ
               เดิมซ้อนชื่อหน่วยงาน + tagline เป็น 2 บรรทัดใน bar สูง h-16 พอชื่อยาว
-              (โดยเฉพาะ "Subdistrict Works" ที่ breakpoint lg)
-              ข้อความจะห่อบรรทัดแล้วดันแถวเสียทรง — ตัดเหลือบรรทัดเดียว + nowrap
-              แล้วสลับความยาวชื่อตามจอแทน */}
+              ข้อความจะห่อบรรทัดแล้วดันแถวเสียทรง — ตัดเหลือบรรทัดเดียว + nowrap */}
           <Link href="/" className="flex min-w-0 items-center gap-2.5">
             <BrandMark />
             <span className="hidden truncate whitespace-nowrap text-sm font-bold sm:block">
-              <span className="lg:hidden">Subdistrict Works</span>
-              <span className="hidden lg:inline">Subdistrict Works</span>
+              Subdistrict Works
             </span>
           </Link>
```
ปลอดภัย: สอง branch เนื้อหาเหมือนกัน 100% และ breakpoint exclusive กัน → render เหมือนเดิมทุกขนาดจอ ไม่มีเทสต์ไหนอ้างสตริงนี้

### A10. `src/lib/line/messages/rich-menu.test.ts` — assertion ที่ขาด

เพิ่มใน `describe('RICH_MENU_BODY', ...)` (ไฟล์ใช้ `it` ไม่ใช่ `test`):
```ts
it('ใช้ชื่อเมนูที่ไม่มีคำนำหน้าหน่วยงาน', () => {
  expect(RICH_MENU_BODY.name).toBe('Subdistrict Works Main Menu');
});
```

### A11. CREATE `src/components/admin/role-badge.test.ts`

`ROLE_LABELS_TH` ไม่มี assertion ใดเลยทั้งโปรเจกต์ (E15) เป็น const ล้วน — ไม่ต้อง mock อะไร
```ts
import { describe, it, expect } from 'vitest';
import { ROLE_LABELS_TH } from './role-badge';
import { ALL_ROLES } from '@/lib/auth/roles';

describe('ROLE_LABELS_TH', () => {
  it('ไม่มีคำนำหน้าหน่วยงาน "กอง" ในป้ายบทบาทใด', () => { ... });
  it('มีป้ายครบทุก role ใน ALL_ROLES', () => { ... });
});
```
⚠️ ตอน implement ต้องเช็กชื่อ export จริงใน `src/lib/auth/roles.ts` ก่อน (`ALL_ROLES` มาจาก `roles.test.ts` ที่อ้างถึง — ยืนยันก่อนใช้)

### Gate ของ tranche A
```bash
npx tsc --noEmit
npx eslint .
npx vitest run
```
**คาดหวัง**: `tokens.contrast.test.ts` ยังเขียว — tranche A ไม่เปลี่ยนค่า token แม้แต่ตัวเดียว
*(หมายเหตุ: `npx vitest run` รวม integration test ที่ต้องมี Docker + Redis ตาม `AGENT.md:94` ถ้า Docker ไม่ได้เปิด ให้รันเฉพาะ unit + บันทึกว่าอะไรถูกข้าม)*

**ยืนยันความปลอดภัยของการแก้คอมเมนต์ใน `tokens.css`**: `parseTokens()` ใน `check-contrast.ts` ใช้ regex `/^\s*--color-([a-z0-9-]+)\s*:\s*(oklch\([^)]*\))\s*;/i` ที่ match เฉพาะบรรทัด declaration และหาขอบเขต block ด้วย `css.indexOf('\n}', from)` → การแก้ตัวเลข/ข้อความในคอมเมนต์ปลอดภัย ตราบใดที่ไม่เพิ่มบรรทัดที่เป็น `}` เดี่ยว ๆ

---

## Tranche B — ทำให้ de-identify ถึงข้อมูลจริง

### B1. CREATE `drizzle/0014_deidentify_backfill_department_names.sql`

เขียนครบทั้ง 5 statement (ห้ามย่อ — ความเสี่ยงลืม `--> statement-breakpoint`)

```sql
-- de-identify backfill — ลบคำนำหน้า "กอง" ออกจากข้อมูลที่ seed ไปแล้ว
--
-- § ทำไมต้องมี migration ไม่ใช่แค่แก้ seed script
-- scripts/seed.ts:75 มี guard `if (existingDept) ข้าม` ครอบ insert ทั้งก้อน
-- environment ที่เคย seed ก่อน PR #3 จึงไม่มีทางได้รับค่าใหม่ — ยืนยันแล้วบน
-- Neon production (2026-08-06) ว่ายังเก็บ กองการศึกษา/กองคลัง/กองช่าง ครบสามแถว
-- และชื่อที่แสดงบนหน้าเว็บอ่านจาก departments.name ไม่ใช่ค่าคงที่ในโค้ด
--
-- § ทำไมไม่ replace คำว่า "กอง" แบบเหมารวม
-- จะทำลายคำไทยที่มี "กอง" โดยชอบธรรม (กองทุน, ทรายกองดิน ที่มีจริงใน
-- scripts/geodata/) และแตะข้อความที่แอดมินพิมพ์เองผ่าน /admin/master-data
-- จึงแทนเฉพาะค่าที่ seed script เคยเขียนไว้เท่านั้น

-- 1) departments.name
--    § name มี unique constraint (schema.ts:137) ถ้า env ใดมีทั้งชื่อเก่าและใหม่
--    พร้อมกัน UPDATE จะชน constraint แล้ว rollback ทั้ง migration — guard ด้วย
--    NOT EXISTS ให้ข้ามแทน เพราะการรวมสองหน่วยงานต้องย้าย FK ของ cases/users
--    ด้วย ซึ่งเป็นการตัดสินใจเชิงข้อมูล ไม่ใช่สิ่งที่ migration ควรเดาเอง
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

-- 2) chat_faq.answer — คำตอบที่บอทส่งให้ประชาชนจริง
UPDATE "chat_faq"
SET "answer" = replace("answer", 'กองคลัง', 'คลัง'), "updated_at" = now()
WHERE "answer" LIKE '%กองคลัง%';
--> statement-breakpoint

-- 3) chat_faq.keywords — jsonb array ของ string (schema.ts:560)
--    § ครอบด้วยเครื่องหมายคำพูดทั้งสองข้าง ('"กองคลัง"') เพื่อให้แทนทั้ง element
--    ไม่ใช่ substring กลาง keyword อื่นที่ยาวกว่า
--    Postgres เก็บ UTF-8 ไทยใน jsonb แบบ literal ไม่ escape เป็น \u จึง replace ตรง ๆ ได้
UPDATE "chat_faq"
SET "keywords" = replace("keywords"::text, '"กองคลัง"', '"คลัง"')::jsonb,
    "updated_at" = now()
WHERE "keywords"::text LIKE '%"กองคลัง"%';
```

**ไม่ต้องสร้าง `0014_snapshot.json`** — ยืนยันแล้วว่า `drizzle-kit migrate` อ่านแค่ `_journal.json` + `.sql` (hash เทียบ `__drizzle_migrations`) และ `0013` ก็ไม่มี snapshot เช่นกัน

### B2. UPDATE `drizzle/meta/_journal.json`

เพิ่มต่อจาก idx 13 (`0013_pdpa_backfill_case_updates`, when `1785826649890`):
```json
{ "idx": 14, "version": "7", "when": <epoch ms ปัจจุบัน>, "tag": "0014_deidentify_backfill_department_names", "breakpoints": true }
```
🔴 ลืมขั้นนี้ = migration ไม่รันโดยไม่มี error

### B3. UPDATE `scripts/seed-faq.ts` — ปิดช่องแถวซ้ำ

⚠️ **ไฟล์นี้ห่อด้วย `async function main()` + `main().catch()` ไม่ใช่ top-level await แบบ `seed.ts`** — guard ต้องอยู่ **ข้างใน** `main()` ครอบ for-loop ถ้าวางไว้ระดับบนสุด guard จะกลายเป็น dead code เพราะ `main()` ยังถูกเรียกแบบไม่มีเงื่อนไขที่ท้ายไฟล์

```ts
async function main() {
  const existingFaq = (await db.select().from(chatFaq).limit(1))[0];
  if (existingFaq) {
    console.log('⏭  FAQ มีอยู่แล้ว — ข้าม\n');
    await closeDb();
    return;
  }

  console.log('Seeding FAQ entries...');
  for (const entry of FAQ_ENTRIES) { /* insert เดิม */ }
  console.log(`\nDone: ${FAQ_ENTRIES.length} FAQ entries seeded.`);
  await closeDb();
}
```
เลือก "มีแล้วข้าม" ไม่ใช่ upsert เพราะ `chat_faq` ไม่มี unique constraint (`schema.ts:558`) → `onConflict` ใช้ไม่ได้ และเพิ่ม unique index ย้อนหลังไม่ได้ถ้ามีแถวซ้ำอยู่แล้ว เมื่อ B1 แก้ข้อมูลเก่าให้แล้ว การ "ข้าม" คือพฤติกรรมที่ถูกต้อง

### B4. CREATE สคริปต์ตรวจสถานะ (read-only)

`psql` ไม่มีใน PATH และ Docker daemon ไม่ได้รันอยู่ → gate ต้องใช้ node script
สคริปต์เดียวกับที่สร้าง E14 (`SELECT` ล้วน) ใช้ทั้ง before และ after
```bash
node run-with-neon.mjs node <check-script>
```

### 🔴 Approval Gate ก่อนรัน migration บน production

`node run-with-neon.mjs npx drizzle-kit migrate` **แก้ข้อมูลจริงบน Neon production และย้อนกลับยาก**
→ เขียนไฟล์ + ตรวจ gate อื่นให้เสร็จก่อน แล้ว **หยุดขออนุมัติจากผู้ใช้** ห้ามรันเอง

### Gate ของ tranche B (หลังได้รับอนุมัติ)
```bash
node run-with-neon.mjs node <check-script>        # before — คาดว่า 3 depts + 1 FAQ
node run-with-neon.mjs npx drizzle-kit migrate    # ต้องเห็น 0014 ถูกรัน
node run-with-neon.mjs node <check-script>        # after  — ต้องได้ 0 + 0
npx tsx scripts/seed-faq.ts                       # (ถ้าต้องการยืนยัน guard — จะขึ้น ⏭ ข้าม)
npx tsc --noEmit && npx eslint . && npx vitest run
```

**ข้อจำกัดของการพิสูจน์ idempotency**: `drizzle-kit migrate` อ่าน `__drizzle_migrations` แล้วข้าม migration ที่รันแล้ว — การรันซ้ำจึงไม่ได้แตะ SQL เลย ถ้าต้องพิสูจน์จริงต้องลบแถว journal ก่อน โดย**ต้อง qualify schema**: default ของ drizzle-orm migrator คือ schema `drizzle` ไม่ใช่ `public`
```sql
DELETE FROM drizzle.__drizzle_migrations WHERE hash LIKE '%0014%';
```
🔴 **ห้ามทำบน production** — ถ้าต้องพิสูจน์ ให้ทำบน local docker DB เท่านั้น

---

## Commit Plan

| # | Tranche | Type | Scope | ข้อความ |
|---|---|---|---|---|
| 1 | A | `fix` | `design` | ไล่สีที่ตกค้างจาก theme rotation — `/admin/design`, Storybook, ตารางเพดาน gamut (ต้องแตะ `tokens.css` + `DESIGN.md` ใน commit เดียว) |
| 2 | A | `docs` | — | แก้คอมเมนต์/DESIGN.md ที่ยังบอกว่า palette เป็นน้ำเงิน |
| 3 | A | `refactor` | `landing` | ยุบ span ที่ซ้ำใน Navbar |
| 4 | A | `test` | — | assert `RICH_MENU_BODY.name` + `ROLE_LABELS_TH` |
| 5 | B | `fix` | `db` | migration 0014 backfill ชื่อหน่วยงาน + FAQ |
| 6 | B | `fix` | `db` | ปิดช่อง `seed-faq.ts` สร้างแถวซ้ำ |

## Risk Areas

| จุด | ความเสี่ยง | Mitigation |
|---|---|---|
| `_journal.json` | ลืมเพิ่ม entry → migration ไม่รันเงียบ ๆ | Gate B เทียบ before/after ด้วยข้อมูลจริง ไม่เชื่อ exit code |
| `seed-faq.ts` | วาง guard ผิดที่ → dead code, insert ยังเกิดซ้ำ | ต้องอยู่ใน `main()` — ยืนยันด้วยการรันสองครั้งแล้วดูข้อความ `⏭` |
| ตารางเพดานใน 2 ไฟล์ | แก้ที่เดียวลืมอีกที่ | commit เดียวต้องแตะทั้งคู่ |
| production migration | ย้อนกลับยาก | Approval gate + before/after check |
| `run-with-neon.mjs` / `check-deident-state.mjs` | เป็นไฟล์ชั่วคราว ไม่ควร commit | ลบก่อนเปิด PR หรือใส่ `.gitignore` |

## Out of Scope (ตาม PRD)

ไม่แก้ค่า `--color-accent-700` ให้ลง gamut · ไม่ไล่ `accent-strong` ให้ตรง `#6A040F` เป๊ะ · ไม่เพิ่ม gate ผูก hex กับ token (finding จริง — เลื่อน) · ไม่เพิ่มเทสต์ `faq-matcher` (finding จริง — เลื่อน) · ไม่ blanket replace "กอง"
