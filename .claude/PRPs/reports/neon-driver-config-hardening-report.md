# Implementation Report: Driver & Config Hardening สำหรับ Neon

**Branch**: `feat/neon-driver-config-hardening`
**Date**: 2026-08-05
**Source PRD**: `.claude/PRPs/prds/neon-database-migration.prd.md` — Phase 1

## Summary

เตรียมชั้นเชื่อมต่อฐานข้อมูลให้พร้อมสำหรับ Neon โดยไม่ต้องมี Neon จริง — รวม option ของ `postgres-js` ไว้ที่เดียว (`prepare: false`), แยก connection string เป็น pooled/direct, เพิ่ม `db:migrate` ที่เขียน migration journal, เพิ่ม gate ตรวจ `DATABASE_URL` ตอน build, และปิดช่องที่ connection string จะรั่วออก log

ทดสอบครบทุกระดับด้วย Postgres 17 จริง รวมถึง **รัน migration ทั้ง 14 ตัวบน DB เปล่าและรัน integration test จริง 13 เคส**

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | **Medium** — ตรง |
| Confidence | 9/10 | **สมเหตุสมผล** — deviation 2 จุด ทั้งคู่เป็นเรื่อง environment ไม่ใช่ตรรกะ |
| Files Changed | 4 CREATE + 7 UPDATE | **4 CREATE + 7 UPDATE** — ตรง |
| Lines | ~250 | 116 (ใหม่) + 95 insert / 7 delete = **~211** |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | สร้าง `pg-options.ts` | ✅ Complete | **Deviated** — ดูด้านล่าง |
| 2 | สร้าง `pg-options.test.ts` | ✅ Complete | 3 tests |
| 3 | สร้าง `redact.ts` | ✅ Complete | |
| 4 | สร้าง `redact.test.ts` | ✅ Complete | 8 tests |
| 5 | แก้ `src/lib/db/index.ts` | ✅ Complete | เก็บคอมเมนต์ประวัติ SQLite ไว้ตามที่แผนกำชับ |
| 6 | `drizzle.config.ts` dual URL | ✅ Complete | รองรับ 2 ชื่อ + fallback |
| 7 | เพิ่ม `db:migrate` | ✅ Complete | `db:push` ยังอยู่ |
| 8 | `DATABASE_URL` gate ใน verify-env | ✅ Complete | 5 เงื่อนไข |
| 9 | verify-env โหลด `.env.local` | ✅ Complete | ผลข้างเคียงที่ตั้งใจ — ดูด้านล่าง |
| 10 | แก้ 3 สคริปต์ | ✅ Complete | จุดที่ PRD เดิมตกไป |
| 11 | ตรวจรับทั้งชุด | ✅ Complete | **Deviated** — ดูด้านล่าง |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static — typecheck | ✅ Pass | `tsc --noEmit` exit 0 |
| Static — lint | ⚠️ Pass with pre-existing | 21 errors ทั้งหมดอยู่ใน `src/app/admin/**/*.tsx` ซึ่ง**ไม่อยู่ในไฟล์ที่แก้เลย** — 0 error ใหม่ |
| Unit Tests | ✅ Pass | **288 tests / 27 files** ผ่านหมด (เพิ่มใหม่ 11) |
| Build | ✅ Pass | `pnpm build` exit 0 รวม verify-env gate ตัวใหม่ |
| Env Gate | ✅ Pass | 8 เคส ตรงตามที่ออกแบบทุกเคส |
| Redaction | ✅ Pass | รหัสผ่านทดสอบปรากฏ **0 ครั้ง** ใน output |
| Database — migrate | ✅ Pass | 14/14 migrations · `__drizzle_migrations` = **14 แถว** · 30 ตาราง |
| Integration | ✅ Pass | **13 tests** กับ Postgres 17 จริง + seed 8,441 แถว |

### รายละเอียด Env Gate (8 เคส)

| # | Input | Expected | Actual |
|---|---|---|---|
| 1 | `not-a-url` | exit 1 | ✅ `✗ DATABASE_URL — parse ไม่ผ่าน` |
| 2 | `mysql://u:p@h/d` | exit 1 | ✅ `✗ ต้องขึ้นต้นด้วย postgresql://` |
| 3 | dev URL ถูกต้อง | exit 0 | ✅ `✓ env vars ครบและถูกต้อง` |
| 4 | prod + `localhost` | exit 1 | ✅ `✗ production ห้ามชี้ไป localhost` |
| 5 | prod ไม่มี `sslmode` | exit 1 | ✅ `✗ ต้องมี ?sslmode=require` |
| 6 | prod + neon direct | warn, exit 0 | ✅ `⚠ ดูเหมือนเป็น direct endpoint` |
| 7 | prod + neon pooled | exit 0 ไม่มี warn | ✅ เงียบตามที่ควร |
| 8 | URL มีรหัสผ่าน + port ผิด | mask | ✅ `postgresql://dbuser:***@host:notaport/db` |

### รายละเอียด Database Validation

```
drizzle.__drizzle_migrations  = 14      ← ตรงกับ _journal.json (idx 0–13)
public schema tables          = 30
case_updates.is_public default = false  ← พิสูจน์ว่า migration 0013 (PDPA) ทำงานจริง
```

**สิ่งที่การทดสอบนี้พิสูจน์เกินคาด**: `.env.local` ตั้ง `DATABASE_URL` ไว้ที่ `127.0.0.1:5432` ซึ่ง ณ ตอนทดสอบมี container ของ**โปรเจกต์อื่น** (`skn-app-db-1`) ครองอยู่ การที่ทั้ง 14 migration ลงที่ port 55432 แทน **จึงพิสูจน์ว่า `DATABASE_URL_UNPOOLED` มาก่อน `DATABASE_URL` จริงตามที่ออกแบบ** ไม่ใช่แค่ compile ผ่าน

## Files Changed

| File | Action | Lines |
|---|---|---|
| `src/lib/db/pg-options.ts` | CREATED | +26 |
| `src/lib/db/pg-options.test.ts` | CREATED | +16 |
| `src/lib/db/redact.ts` | CREATED | +27 |
| `src/lib/db/redact.test.ts` | CREATED | +47 |
| `src/lib/db/index.ts` | UPDATED | +13 / −3 |
| `drizzle.config.ts` | UPDATED | +16 / −1 |
| `package.json` | UPDATED | +1 |
| `scripts/verify-env.ts` | UPDATED | +59 |
| `scripts/check-line-db.ts` | UPDATED | +2 / −1 |
| `scripts/check-superadmin.ts` | UPDATED | +2 / −1 |
| `scripts/seed-faq.ts` | UPDATED | +2 / −1 |

**รวม**: 4 ไฟล์ใหม่ (116 บรรทัด) · 7 ไฟล์แก้ (+95 / −7)

## Deviations from Plan

### 1. Type annotation ของ `pgClientOptions`

- **WHAT**: แผนเสนอ `Options<Record<string, never>>` → ใช้ `satisfies postgres.Options<Record<string, postgres.PostgresType>>` แทน
- **WHY**: signature จริงคือ `Options<T extends Record<string, postgres.PostgresType>>` (`node_modules/postgres/types/index.d.ts:346`) — `never` ไม่ผ่าน constraint และ `src/lib/db/index.ts:16` ใช้ namespace ผ่าน default import (`postgres.Sql`) อยู่แล้ว จึง mirror แพตเทิร์นเดิม การใช้ `satisfies` ยังได้ excess-property check ซึ่ง annotation ธรรมดาไม่ให้

### 2. วิธีเตรียม DB สำหรับทดสอบ migrate

- **WHAT**: แผนเขียนว่าใช้ `docker compose exec postgres psql -c "CREATE DATABASE migrate_check"` → เปลี่ยนเป็น throwaway container `postgres:17-alpine` บน port **55432** แล้วลบทิ้ง
- **WHY**: `docker compose up postgres` ล้มเหลว 2 ชั้น — (ก) ชื่อ container `sw-postgres` ถูกใช้โดย compose project อื่น (`per`) อยู่แล้ว (ข) port 5432 ถูก `skn-app-db-1` ของโปรเจกต์อื่นครองอยู่ การหยุดหรือลบของโปรเจกต์อื่นเป็นสิ่งที่ไม่ควรทำ
- **ผลลัพธ์**: วิธีใหม่**แยกขาดกว่าเดิม** — ไม่แตะข้อมูลของทั้งสองโปรเจกต์ และลบร่องรอยหมดหลังเสร็จ

## Issues Encountered

| Issue | Resolution |
|---|---|
| `.env.local` มี `CRON_SECRET` เป็น placeholder → verify-env exit 1 ก่อนถึง gate ใหม่ | ตั้ง env baseline ครบทุกตัวแบบ inline ตอนทดสอบ gate เพื่อแยกทดสอบเฉพาะ `DATABASE_URL` |
| ชื่อ container ชนกับ compose project `per` | ไม่ลบของเดิม — ใช้ container ชั่วคราวชื่อใหม่แทน |
| port 5432 ถูกโปรเจกต์อื่นครอง | ใช้ port 55432 |
| เผลอสร้าง volume เปล่า `subdistrict-works_postgres-data` ตอน `compose up` ล้มเหลว | ลบทิ้งแล้ว |

**สภาพ Docker หลังเสร็จงาน**: container ทดสอบถูกลบหมด · `sw-postgres` ยังหยุดอยู่เหมือนเดิม (สถานะ exit code เปลี่ยนจาก 0 → 128 จากความพยายาม start ที่ล้มเหลว — เป็นแค่ metadata ข้อมูลใน volume `per_postgres-data` ไม่ถูกแตะ) · `skn-app-db-1` ของโปรเจกต์อื่นยังรันปกติ

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `src/lib/db/pg-options.test.ts` | 3 | ล็อก `prepare: false`, `max <= 5`, `idle_timeout > 0` |
| `src/lib/db/redact.test.ts` | 8 | mask ปกติ · หลาย occurrence · 2 scheme · ไม่มีรหัสผ่าน · ข้อความทั่วไป · string ว่าง · `Error` · non-`Error` |

**รวม 11 tests ใหม่** — ทุก export ใหม่มีเทสต์ครอบ

---

## 🔴 สิ่งที่ค้นพบระหว่างทำ — ต้องแก้ PRD Phase 2

**`scripts/check-superadmin.ts:7-13` อ่าน `secrets/secret-keys.txt` และคาดหวังบรรทัด `email=`**

```ts
const secrets = readFileSync('secrets/secret-keys.txt', 'utf8');
const emailMatch = secrets.match(/^email=(.+)$/m);
const email = emailMatch?.[1]?.trim();

if (!email) {
  console.error('superadmin email not found in secrets');
  process.exit(1);
}
```

**ขัดกับ PRD Phase 2 ขั้นที่ 5 ที่เขียนว่า "ลบทั้งไฟล์ได้เลย"** — ถ้าลบไฟล์ทิ้ง `check-superadmin.ts` จะ exit 1 ทันที ซึ่งเป็น**สคริปต์ที่ Phase 3 ขั้นที่ 4 ต้องใช้ยืนยัน superadmin พอดี**

หลักฐานนี้มาจากซอร์สโค้ดปกติ ไม่ได้เปิดอ่านไฟล์ secret (ยังคงข้อบังคับเดิม) และสอดคล้องกับข้อสังเกตเรื่องขนาดไฟล์ 55 bytes ที่เคยตั้งไว้ตอนรีวิว PRD — `email=<อีเมล>` พอดีกับ 55 bytes มากกว่า Neon connection string ที่ยาว 110–130 ตัวอักษร

**ต้องยืนยันก่อนทำ Phase 2**: ไฟล์เก็บอะไรบ้างกันแน่ และถ้ามีทั้ง `email=` และ connection string ต้องลบ**เฉพาะบรรทัด connection string** ไม่ใช่ทั้งไฟล์

---

## Next Steps

- [ ] **ตอบคำถามเรื่อง `secrets/secret-keys.txt` แล้วแก้ PRD Phase 2 ขั้นที่ 5** (blocking สำหรับ Phase 2)
- [ ] Code review — `/ecc:code-review`
- [ ] Commit + PR — `/ecc:prp-commit` หรือ `/ecc:prp-pr`
- [ ] Phase 2: provision Neon ผ่าน Vercel Marketplace
