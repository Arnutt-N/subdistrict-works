# ปิดงานที่ค้างจาก de-identify + theme rotation (PR #3–#7)

> โปรเจกต์: `subdistrict-works`
> ที่มา: code review ของ `git diff f73df1e..6fda6ef` (2026-08-06)
> Branch: `fix/review-followup-theme-and-deidentify`
> สถานะ: **rev.2** — แก้ตาม review gate (AGENT.md §4) เมื่อ 2026-08-06

---

## Problem Statement

PR #3–#7 ตั้งใจทำสองอย่างให้จบ: (ก) ลบคำว่า "กอง" ออกจากระบบทั้งหมด (de-identify) และ (ข) เปลี่ยน palette จาก blue 255 เป็น maroon 24 (#6A040F) **ทั้งสองอย่างทำในซอร์สโค้ดเสร็จแล้ว แต่ยังไม่บรรลุผลจริง**

1. **de-identify ไม่ถึงข้อมูล — ยืนยันบน production แล้ว** ชื่อหน่วยงานที่ผู้ใช้เห็นอ่านจาก `departments.name` ใน DB ไม่ใช่ค่าคงที่ในโค้ด และ query จริงบน Neon production (E14) พบว่า **ยังเก็บ `กองการศึกษา`, `กองคลัง`, `กองช่าง` อยู่ครบทั้งสามแถว** พร้อม `chat_faq` อีก 1 แถวที่มีคำว่า "กอง" ในคำตอบ/keyword → ประชาชนที่ใช้ระบบอยู่ตอนนี้ยังเห็นคำที่ PR #3–#5 ตั้งใจลบ
2. **theme rotation ตกหล่นไฟล์ที่ไม่ได้อยู่ใน diff** — `/admin/design` ซึ่งเป็นหน้าอ้างอิง design token ของทีมเอง ยังพาดหัวว่า "สีหลัก — น้ำเงิน 255°" คู่กับ swatch สีแดงเลือดหมู และ Storybook ยัง hardcode พื้นธีมมืดเป็น hue 255

ต้นทุนของการไม่แก้: งาน de-identify ที่ทำมา 3 PR ไม่มีผลกับ production ซึ่งเป็นที่เดียวที่มันสำคัญ ส่วน `/admin/design` และ Storybook เป็นแหล่งอ้างอิงที่ทีมใช้ตัดสินใจเรื่องสี การปล่อยให้บอกสีผิดจะทำให้งาน UI รอบถัดไปเดินตามข้อมูลที่ผิด

## Scope

### In Scope

| # | งาน | Tranche |
|---|---|---|
| S1 | migration `0014` backfill `departments.name` + `chat_faq.answer`/`keywords` | B |
| S2 | ปิดช่อง `scripts/seed-faq.ts` สร้างแถวซ้ำ | B |
| S3 | `catalog.ts:43` — ข้อความ user-facing "น้ำเงิน 255°" → maroon 24° | A |
| S4 | `catalog.ts:50` + `DESIGN.md:159` — เลิกอ้างว่า `--color-accent-700` คือ "hover ของปุ่ม" ทั้งที่ไม่มีใครใช้ | A |
| S5 | `.storybook/preview.tsx:23` — ค่าพื้นธีมมืด + คอมเมนต์ที่อธิบายผิด | A |
| S6 | ตารางเพดาน gamut ใน `tokens.css:49-50` **และ** `DESIGN.md:166-171` (ต้องแก้คู่กัน) | A |
| S7 | `tokens.css:39` + `DESIGN.md:147` — คำว่า "เป๊ะ" ที่ไม่จริง (`#6a0410` ≠ `#6A040F`) | A |
| S8 | `tokens.css:9-10` — ข้อยกเว้นที่ครอบไม่ครบ (ฝั่ง dark ก็ปรับ chroma) | A |
| S9 | `DESIGN.md:605` — "blue civic" ขัดกับหัวข้อ §2 | A |
| S10 | คอมเมนต์ "น้ำเงิน"/"Emerald" ค้าง 6 จุดใน `src/` | A |
| S11 | `Navbar.tsx:34-38` — ยุบ span ที่ซ้ำ + ตัดคอมเมนต์ที่อธิบายพฤติกรรมที่ไม่มีจริง | A |
| S12 | `rich-menu.test.ts` — assert `RICH_MENU_BODY.name` | A |
| S13 | `role-badge.test.ts` (ไฟล์ใหม่) — assert `ROLE_LABELS_TH` ทั้ง 5 role | A |

### Out of Scope — ดูตาราง "What We're NOT Building"

## Evidence

ทุกข้อยืนยันด้วยการอ่านไฟล์จริง / คำนวณจริง / query DB จริง ไม่ใช่การอนุมาน

| # | หลักฐาน | ผลตรวจ |
|---|---|---|
| **E14** | `SELECT name, slug FROM departments` บน **Neon production** (2026-08-06, read-only ผ่าน `node run-with-neon.mjs`) | `education → กองการศึกษา`, `finance → กองคลัง`, `public-works → กองช่าง` (อีก 2 แถวคือ `สำนักปลัด`, `กำนัน-ผู้ใหญ่บ้าน` ไม่มี "กอง") · `chat_faq` 13 แถว มี 1 แถวที่ `answer`/`keywords` มีคำว่า "กอง" · **คำถามซ้ำ 0 แถว** |
| E1 | `scripts/seed.ts:73-79` | `if (existingDept) { console.log('⏭ ข้าม') }` ครอบ insert departments (`:78`) และ categories (`:220`) ทั้งคู่ — คือกลไกที่ทำให้ E14 เป็นแบบนั้น |
| E2 | `scripts/seed-faq.ts:85-96` | `db.insert(chatFaq)` เปล่า ๆ ในลูป ไม่มี guard → รันซ้ำได้แถวซ้ำ **หมายเหตุ: `onConflict` ใช้แก้ไม่ได้** เพราะ `chat_faq` ไม่มี unique constraint ใด ๆ (มีแต่ index ไม่ unique ที่ `drizzle/0005_supreme_galactus.sql:78`) |
| E3 | `drizzle/*.sql` (0000–0013) | ไม่มี migration ไหน backfill ชื่อหน่วยงาน — `0013` เป็น backfill ของ `case_updates` (PDPA) คนละเรื่อง แต่เป็น **แม่แบบ** ที่ใช้ได้ |
| E4 | `catalog.ts:43` + `design-client.tsx:233` | `title: 'สีหลัก — น้ำเงิน 255°'` ถูก render เป็น `<h3>` — เป็น user-facing string |
| E5 | `.storybook/preview.tsx:22-23` | บรรทัด light ใช้ `var(--color-surface)` แต่บรรทัด dark hardcode `oklch(15% 0.015 255)` — สองบรรทัดติดกันที่ทำคนละอย่าง |
| **E6** | คำนวณ OKLab→sRGB (binary search) ที่ hue 24 เทียบกับตารางที่เขียนไว้ — ตารางชุดเดียวกันปรากฏ **2 ที่**: `tokens.css:49-50` และ `DESIGN.md:166-171` | L94%: 0.04→**0.030** · L90%: 0.06→**0.052** · L80%: 0.13→**0.114** · L75%: 0.15→**0.150** · L70%: 0.17→**0.191** · L42%: 0.18→**0.170** · L37%: 0.16→**0.150** · L33%: 0.14→**0.134** (ยืนยันซ้ำโดย reviewer อิสระ 2 ราย) |
| E7 | `tokens.css:53` (ประโยคยืนยัน) vs `tokens.css:153` (token จริง — คนละบล็อก ห่างกัน 100 บรรทัด) | dark `--color-accent-700: oklch(80% 0.12 24)` — C=0.12 > เพดานจริง 0.114 → browser gamut-map เงียบ ๆ ขัดกับประโยค "ค่าทั้งชุดจึงคุมให้อยู่ในเพดานทุกตัว" |
| E8 | `DESIGN.md:605` vs `DESIGN.md:140` | "palette เป็น blue civic + amber royal" vs หัวข้อ "§2. Colors — Maroon Civic + Amber Royal" |
| E9 | `button.tsx:7,9` vs `:24` | JSDoc หัวไฟล์ "Emerald gradient" / "ring น้ำเงิน" ขัดกับคอมเมนต์บรรทัด 24 ที่ PR #7 เพิ่งแก้เป็น maroon |
| E10 | grep `น้ำเงิน` ใน `src/` | ค้างที่ `brand-mark.tsx:10`, `kpi-card.tsx:8,12`, `role-badge.tsx:8`, `case-status-badge.tsx:8`, `chat/_lib/labels.ts:18` — **ต้องคงไว้**: `tokens.css:5,9,12,40` และ `DESIGN.md:143,146` ซึ่งเป็นข้อความประวัติ palette ที่ถูกต้อง |
| E11 | `Navbar.tsx:36-37` (span) + `:28-32` (คอมเมนต์) | สอง span เนื้อหาเหมือนกันเป๊ะ + คอมเมนต์อธิบาย "สลับความยาวชื่อตามจอ" ที่ไม่เคยเกิดขึ้นจริง — เหมือนกันมาก่อน PR #3 แล้ว **ไม่ใช่ regression** |
| E12 | `rich-menu.test.ts` | assert `size`/`selected`/`chatBarText`/`areas`/`bounds` ครบ แต่ไม่แตะ `.name` ซึ่งถูกส่งขึ้น LINE API จริงผ่าน `client.ts:94` |
| E13 | `faq-matcher.ts` + `engine.test.ts:49-51` | ไม่มีไฟล์เทสต์ และถูก `vi.mock()` ทิ้ง → logic จับคำไม่เคยรันจริงในเทสต์ไหน |
| E15 | `role-badge.tsx` | ไม่มีไฟล์เทสต์คู่ทั้งโปรเจกต์ — `ROLE_LABELS_TH` ไม่มี assertion ใดเลย |
| E16 | `catalog.ts:50`, `DESIGN.md:159` | ระบุว่า `--color-accent-700` ใช้เป็น "hover ของปุ่ม" แต่ grep `accent-700` ใน `src/` ได้ 4 hit ทั้งหมดเป็นการประกาศ (`tokens.css:58,153,183`) + `catalog.ts:50` เอง — **ไม่มี component ไหนใช้** |

**ตรวจแล้วไม่ใช่ปัญหา (ห้ามหลุดเข้าไปเป็นงาน):** theme-color hex ใน `layout.tsx` ถูกต้องเป๊ะทั้งสองค่า · contrast ratio ใน `DESIGN.md` ถูกต้อง (คิดบนพื้น `--color-surface` ไม่ใช่ขาวสนิท) · ไม่มี hue 255 เหลือใน `tokens.css` · ไม่มี "กอง" เหลือในโค้ดแอป · การ lookup หน่วยงานใช้ `id`/`slug` ไม่ใช่ชื่อ · **ไม่ต้องสร้าง `0014_snapshot.json`** — `drizzle-kit migrate` อ่านแค่ `_journal.json` + `.sql` (ยืนยันจาก source และจาก precedent: `0013` ก็ไม่มี snapshot)

## Proposed Solution

แบ่งเป็น 2 tranche ตามระดับความเสี่ยง

**Tranche A — ปิดของที่ตกหล่นจาก theme rotation (ความเสี่ยง: ต่ำ)**
แก้ข้อความ/ตัวเลข/คอมเมนต์ + เพิ่ม assertion 2 ไฟล์ ไม่แตะค่า token แม้แต่ตัวเดียว

**Tranche B — ทำให้ de-identify ถึงข้อมูลจริง (ความเสี่ยง: ปานกลาง — แตะข้อมูล production)**
migration `0014` + ปิดช่อง `seed-faq.ts`

เลือก migration แทนการแก้ seed script อย่างเดียว เพราะ:
- E14 พิสูจน์แล้วว่า production ผ่านจุดที่ seed script จะช่วยได้ไปแล้ว
- มี precedent ในโปรเจกต์: `0013_pdpa_backfill_case_updates.sql` แก้ข้อมูลเก่าด้วยเหตุผลเดียวกันเป๊ะ
- เขียนแบบ `WHERE name = '<ค่าเก่า>'` ทำให้ idempotent โดยธรรมชาติ — environment ที่ข้อมูลถูกอยู่แล้วจะไม่ถูกแตะ

## Key Hypothesis

เราเชื่อว่า **migration backfill + การปิดช่อง insert ซ้ำ** จะทำให้ **คำว่า "กอง" หายไปจากทุกจุดที่ประชาชนและเจ้าหน้าที่มองเห็น ไม่ว่า environment นั้นจะถูก seed ก่อนหรือหลัง PR #3**

จะรู้ว่าถูกเมื่อ **รัน `node run-with-neon.mjs npx drizzle-kit migrate` แล้วรัน read-only check ซ้ำ (สคริปต์เดียวกับที่สร้าง E14) ได้ `departments ที่มี "กอง": 0` และ `chat_faq แถวที่มี "กอง": 0`**

## What We're NOT Building

| ไม่ทำ | เหตุผล |
|---|---|
| แก้ `--color-accent-700` ให้ลง gamut (0.12 → ≤0.114) | เป็นการเปลี่ยน**สีที่ผู้ใช้เห็นจริง** ไม่ใช่การแก้เอกสาร และ E16 พิสูจน์ว่าไม่มี component ไหนใช้ token นี้ — ขยับสีที่ไม่มีใครใช้ = ความเสี่ยงฟรี ขอบเขตนี้แก้แค่ตารางที่บอกผิด + เขียนให้ชัดว่าค่านี้เกินเพดาน |
| ตรึง `--color-accent-strong` ให้ได้ `#6A040F` เป๊ะ | ต้องขยับ hue เป็น ~24.45 ซึ่งทำให้ palette ทั้งชุดเพี้ยนตาม เพื่อความแม่น 1/255 ในช่อง blue ที่ตาแยกไม่ออก — S7 แก้ที่ถ้อยคำแทน |
| เพิ่ม gate ผูก hex ใน `layout.tsx` / `icon.svg` กับ token | **เป็น finding จริง (test gap) — เลื่อน ไม่ใช่ปฏิเสธ** ต้อง export `toHex`/`parseOklch` จาก `check-contrast.ts` (ยืนยันแล้วว่ายังไม่ export) + parse `.tsx`/`.svg` = งานใหญ่กว่า tranche A ทั้งก้อน ค่าปัจจุบันตรวจแล้วถูกต้องจึงไม่เร่ง |
| เพิ่มเทสต์ให้ `faq-matcher.ts` | **เป็น finding จริง (E13) — เลื่อน ไม่ใช่ปฏิเสธ** ทางที่ถูกที่สุดคือแยกลูปให้คะแนน (`faq-matcher.ts:20-34`) ออกเป็น pure function แล้วเทสต์โดยไม่ต้อง mock `getDb()` — เป็น refactor เล็ก ๆ ที่ควรทำ แต่เป็นการเปลี่ยนโครงโค้ด ไม่ใช่การปิด finding ของ theme/rename จึงแยก task |
| blanket replace คำว่า "กอง" ใน DB | จะทำลายคำไทยที่มี "กอง" โดยชอบธรรม (กองทุน, ทรายกองดิน ที่มีจริงใน `scripts/geodata/`) และแตะข้อความที่แอดมินพิมพ์เองผ่าน `/admin/master-data` — migration แทนเฉพาะค่าที่ seed script เคยเขียน |

## Success Metrics

| Metric | Target | How Measured | Tranche |
|--------|--------|--------------|---------|
| **"กอง" หายจากข้อมูล production** | `departments = 0`, `chat_faq = 0` | รัน `node run-with-neon.mjs node <check script>` (ตัวเดียวกับที่สร้าง E14) **หลัง** migrate — E14 คือค่า before ที่ใช้เทียบ ไม่ใช่การตรวจบน DB เปล่า | B |
| **migration ทำงานจริง ไม่ใช่ถูกข้าม** | 3 + 1 แถวถูกแก้ | เทียบ before (E14: 3 departments + 1 FAQ) กับ after — ถ้า after = 0 โดยที่ before = 3 แปลว่า SQL ทำงานจริง<br>*(หมายเหตุ: การรัน `drizzle-kit migrate` ซ้ำจะถูกข้ามผ่าน `__drizzle_migrations` เสมอ จึงพิสูจน์ idempotency ของ SQL ไม่ได้ — ถ้าต้องพิสูจน์ต้องลบแถวใน `drizzle.__drizzle_migrations` ก่อน)* | B |
| **seed ซ้ำไม่สร้างแถวซ้ำ** | จำนวนแถวคงที่ | รัน `npx tsx scripts/seed-faq.ts` สองครั้งติดแล้วนับแถว | B |
| **ไม่มี `255°` ค้างในบริบทสี** | 0 จุด | `grep "255°"` ใน `src/` + `.storybook/` = 0 (ใช้ `255°` ไม่ใช่ `255` เปล่า เพราะ `255` ปรากฏใน `contrast.ts`/`contrast.test.ts` เป็นค่า RGB และใน integration test เป็นเลข IP) | A |
| **ไม่มี "น้ำเงิน" ค้างนอกบริบทประวัติ** | เหลือเฉพาะ 6 บรรทัดที่อนุญาต | `grep น้ำเงิน` เหลือได้เฉพาะ `tokens.css:5,9,12,40` และ `DESIGN.md:143,146` เท่านั้น | A |
| **ตารางเพดาน gamut ตรงกับความจริง ทั้ง 2 ไฟล์** | คลาดสัมพัทธ์ ≤2% ทั้ง 8 แถว | เทียบ `tokens.css` **และ** `DESIGN.md` กับค่าใน E6 | A |
| **assertion ที่ขาดถูกเติม** | 2 ไฟล์ | `rich-menu.test.ts` มี `expect(RICH_MENU_BODY.name)` และมี `role-badge.test.ts` ที่ assert `ROLE_LABELS_TH` | A |
| **Gate เดิมไม่แตก** | ทั้ง 3 เขียว | `npx tsc --noEmit` / `npx eslint .` / `npx vitest run` (รวม `src/styles/tokens.contrast.test.ts`) | A + B |

## Constraints & Dependencies

- **`AGENT.md:92` — `pnpm` ไม่อยู่ใน PATH ต้องใช้ `npx`** ทุกคำสั่งในเอกสารนี้จึงเป็น `npx` (ข้อยกเว้น: `run-with-neon.mjs` ที่ยัง untracked เขียนตัวอย่างเป็น `pnpm` — เป็นความขัดแย้งที่มีอยู่ก่อน ไม่แก้ในขอบเขตนี้)
- **`AGENT.md`**: ห้ามทำงานบน `main` · conventional commit · gate ท้องถิ่นก่อน PR · GitHub Actions ปิดโดยตั้งใจ ด่านจริงคือ local + Vercel preview
- 🔴 **`drizzle/meta/_journal.json` ต้องเพิ่ม entry ด้วยมือ** — migration เขียนมือไม่ถูกลงทะเบียนอัตโนมัติ ถ้าลืม `drizzle-kit migrate` จะ**ข้ามไฟล์ไปเงียบ ๆ ไม่มี error** ซึ่งเป็น failure mode เดียวกับที่ PRD ฉบับนี้เกิดมาเพื่อแก้
- **`departments.name` มี unique constraint** (`schema.ts:137`) — migration ต้องกันกรณีที่ทั้งชื่อเก่าและใหม่มีอยู่พร้อมกัน
- **`chat_faq` ไม่มี unique constraint ใด ๆ** (`schema.ts:558` — `question` ไม่ unique) → ใช้ `onConflict` ไม่ได้ และเพิ่ม unique index ย้อนหลังไม่ได้ถ้ามีแถวซ้ำอยู่แล้ว → guard ต้องเป็นแบบ "มีแล้วข้าม"
- **`chat_faq.keywords` เป็น `jsonb`** (`schema.ts:560`) — SQL ต้องแปลงผ่าน `::text` แล้ว cast กลับ (Postgres เก็บ UTF-8 ไทยแบบ literal ไม่ escape เป็น `\u` — ยืนยันแล้ว)
- **`psql` ไม่มีใน PATH และ Docker daemon ไม่ได้รันอยู่บนเครื่องนี้** (ตรวจ 2026-08-06) → gate ที่ต้องแตะ DB ต้องใช้ node/tsx script ผ่าน `run-with-neon.mjs` ไม่ใช่ `psql`
- 🔴 **เส้นทาง deploy ของ tranche B คือ Neon production** — `node run-with-neon.mjs npx drizzle-kit migrate` (ใช้ `.env.neon-provision` ห้ามทับ `.env.local`) **การรัน migration กับ production เป็นการแก้ข้อมูลจริงที่ย้อนกลับยาก ต้องได้รับอนุมัติจากผู้ใช้ก่อนทุกครั้ง** — ผู้ช่วยเขียนไฟล์ migration และตรวจ gate อื่นได้ แต่ห้ามรันเองโดยพลการ
- ลำดับ: **A ก่อน B** — A ไม่มี dependency กับ DB

## Open Questions

| คำถาม | สถานะ |
|---|---|
| production มีคำว่า "กอง" ค้างจริงไหม | ✅ **ตอบแล้ว 2026-08-06** — มี 3 departments + 1 FAQ (E14) → migration รันแล้ว 2026-08-07 เหลือ 0 ทั้งคู่ |
| local dev DB (docker `:5433`) มีสถานะแบบเดียวกันไหม | ⏸ **ไม่ตอบ ไม่กระทบ** — Docker daemon ไม่ได้รันอยู่ migration idempotent จะแก้ให้เองเมื่อใครก็ตามรัน `db:migrate` บน DB นั้น |
| หลัง migrate แล้วต้อง redeploy Vercel ไหม | ✅ **ตอบแล้ว: ไม่ต้อง** — `getActiveDepartments()` (`lib/queries/lookups.ts:18`) ถูกเรียกจาก `/admin/users` และ `/admin/cases/[id]` เท่านั้น ซึ่งเป็นหน้า auth-gated แบบ dynamic ไม่มี `unstable_cache` ครอบ ส่วน `revalidate = 3600` มีที่ `app/page.tsx:21` แต่หน้านั้นไม่ได้ query departments เลย |
| ผลข้างเคียงที่พบตอนตรวจ | ⚠️ `getActiveDepartments()` เรียง `orderBy(departments.name)` — ชื่อที่สั้นลงทำให้**ลำดับใน dropdown เปลี่ยน** (เดิม กองการศึกษา→กองคลัง→กองช่าง→กำนัน→สำนักปลัด ตอนนี้ การศึกษา→กำนัน→คลัง→ช่าง→สำนักปลัด) เป็นผลตามธรรมชาติของการเรียงตามตัวอักษร ไม่ใช่บั๊ก |

## Risks

| ความเสี่ยง | ผลถ้าเกิด | การรับมือ |
|---|---|---|
| 🔴 ลืมเพิ่ม entry ใน `_journal.json` | migration ไม่รัน **โดยไม่มี error** — เข้าใจผิดว่าสำเร็จ | Gate B พิสูจน์ด้วยการ query ข้อมูลจริงเทียบ before/after ไม่เชื่อ exit code |
| environment มีทั้ง `'กองช่าง'` และ `'ช่าง'` พร้อมกัน | `UPDATE` ชน unique constraint → rollback ทั้ง migration | `NOT EXISTS` guard ให้ข้ามแทน — การรวมสองหน่วยงานต้องย้าย FK ของ `cases`/`users` ด้วย ซึ่งเป็นการตัดสินใจเชิงข้อมูลที่ migration ไม่ควรเดา (E14 ยืนยันว่า production ไม่มีเคสนี้) |
| ชื่อถูกแก้ด้วยมือผ่าน `/admin/master-data` เป็นค่าอื่น | migration ไม่ match → ไม่แตะ | ถูกต้องตามเจตนา — ค่าที่คนแก้เองถือเป็นเจตนาของผู้ใช้ (E14 ยืนยันว่าค่าปัจจุบันตรงกับที่ seed script เคยใส่เป๊ะ) |
| แก้ `.storybook/preview.tsx` แล้ว a11y check เปลี่ยนผล | story บางตัวขึ้นแดง | **น่าจะไม่เกิด** — decorator (`preview.tsx:44`) วาดพื้น `bg-surface` ทับเต็ม `min-h-dvh` อยู่แล้ว ค่าของ backgrounds addon จึงแทบไม่ถูก axe เห็น ถ้าเกิดจริงคือเจอบั๊กที่ซ่อนอยู่ ให้รายงานแยก **ห้าม**กลับไปใช้ค่าเดิม |
| แก้ตารางเพดานที่เดียวลืมอีกที่ | drift ซ้ำรอยเดิมทันที | S6 บังคับให้ `tokens.css` และ `DESIGN.md` อยู่ใน commit เดียวกัน |
