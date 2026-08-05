# Plan: Driver & Config Hardening สำหรับ Neon

## Summary

เตรียมชั้นเชื่อมต่อฐานข้อมูลให้พร้อมสำหรับ Neon (serverless Postgres แบบ pooled) **ก่อน**ที่จะมี Neon จริง — ปิดค่า `prepare` ที่เสี่ยงพังบน pooler, แยก connection string เป็น pooled/direct, เพิ่มเส้นทาง `db:migrate` ที่ถูกต้องสำหรับ production, และปิดช่องที่ connection string จะรั่วออก log ทั้งหมดนี้ทดสอบได้ครบกับ docker Postgres ที่มีอยู่แล้ว ไม่ต้องรอ Neon

## User Story

As a **ผู้ดูแลระบบ Subdistrict Works**,
I want **โค้ดที่ต่อฐานข้อมูลได้ถูกต้องตั้งแต่ครั้งแรกที่ชี้ไป Neon และไม่พ่นรหัสผ่านลง log**,
So that **การ deploy ขึ้น production ไม่ต้องมาไล่ debug ทีหลัง และข้อมูลประชาชนไม่เสี่ยงรั่วผ่าน build log**.

## Problem → Solution

| ตอนนี้ | หลังทำ |
|---|---|
| `postgres(url, { max: 10, prepare: true })` — เสี่ยงพังบน pooled endpoint | `prepare: false` + pool ที่เหมาะกับ serverless ใช้ร่วมกันทุกจุด |
| `DATABASE_URL` ตัวเดียวใช้ทั้ง app และ DDL | แยก pooled (app) / direct (migrate, pg_dump) |
| มีแค่ `db:push` — ไม่มีเส้นทาง migration ที่ถูกต้อง | มี `db:migrate` ที่เขียน `__drizzle_migrations` journal |
| `verify-env.ts` ไม่ตรวจ `DATABASE_URL` เลย | ตรวจรูปแบบ + บังคับ TLS ใน production |
| error พ่น connection string เต็ม ๆ ลง log | redact รหัสผ่านทุกทางออก |
| 3 สคริปต์สร้าง client เองด้วย option default | ใช้ option ชุดเดียวกันทั้งหมด |

## Metadata

- **Complexity**: **Medium** (11 ไฟล์, ~250 บรรทัด, ตามแพตเทิร์นที่มีอยู่แล้วทั้งหมด)
- **Source PRD**: `.claude/PRPs/prds/neon-database-migration.prd.md`
- **PRD Phase**: Phase 1 — Driver & config hardening
- **Estimated Files**: 4 CREATE + 7 UPDATE

---

## UX Design

**N/A — internal change ล้วน** ผู้ใช้ปลายทาง (ประชาชน/เจ้าหน้าที่) ไม่เห็นความแตกต่างใด ๆ

ผู้ที่เห็นความเปลี่ยนแปลงคือ **นักพัฒนา/ผู้ดูแล** ตอนรันคำสั่ง:

| Touchpoint | Before | After | Notes |
|---|---|---|---|
| `pnpm build` | ผ่านแม้ `DATABASE_URL` ผิดรูปแบบ → ไปพังตอน runtime | ล้มทันทีพร้อมข้อความบอกว่าผิดตรงไหน (รหัสผ่านถูก mask) | fail fast |
| สร้าง schema | `pnpm db:push` (ไม่มี journal) | `pnpm db:migrate` (มี journal 14 แถว) | `db:push` ยังอยู่สำหรับ prototyping ใน local |
| error ตอนต่อ DB ไม่ได้ | log พ่น `postgresql://user:PASSWORD@host/db` | log แสดง `postgresql://user:***@host/db` | ปิดช่องรั่ว |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| **P0** | `src/lib/db/index.ts` | 1-48 | ไฟล์หลักที่ต้องแก้ — lazy singleton pattern, comment style, export shape |
| **P0** | `drizzle.config.ts` | 1-23 | รูปแบบการอ่าน env + throw ที่ต้องรักษาไว้ |
| **P0** | `scripts/verify-env.ts` | 1-87 | `Spec` type, loop ตรวจ, รูปแบบ error message, การจัด production-only block |
| **P1** | `src/lib/db/query-helpers.ts` | 1-7 | แม่แบบไฟล์ utility เล็กใน `src/lib/db/` (JSDoc หัวไฟล์ + named export) |
| **P1** | `src/lib/db/query-helpers.test.ts` | 1-20 | แม่แบบ unit test — `describe`/`test`, ชื่อเทสต์เชิงพฤติกรรม |
| **P1** | `package.json` | 24-31 | ตำแหน่งและรูปแบบ `db:*` scripts |
| **P2** | `src/lib/upstash.ts` | 8-23, 76-86 | แพตเทิร์น external client + env + `console.warn` prefix `[module]` |
| **P2** | `scripts/seed.ts` | 6-16 | แพตเทิร์นโหลด `.env.local` ด้วย `override: false` พร้อมคอมเมนต์ § |
| **P2** | `scripts/check-superadmin.ts` `scripts/seed-faq.ts` `scripts/check-line-db.ts` | บรรทัดที่เรียก `postgres()` | 3 จุดที่สร้าง client เองและต้องแก้ตาม |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| postgres-js options | `postgres` v3 (มีใน `node_modules`) | `prepare` default = `true`; `max` default = 10; `idle_timeout` default = 0 (ไม่ปิด connection เลย) |
| PgBouncer transaction mode | ความรู้ทั่วไปของ ecosystem | named prepared statement ข้าม transaction ไม่ได้ใน transaction mode — **แต่ PgBouncer 1.21+ รองรับระดับ protocol แล้ว** จึงไม่ใช่ข้อห้ามเด็ดขาด |
| drizzle-kit migrate | config ในโปรเจกต์ (`out: './drizzle'`) | อ่าน `drizzle/meta/_journal.json` (**ยืนยันแล้ว: 14 entries, idx 0–13**) แล้วบันทึกลงตาราง `__drizzle_migrations` |

> **KEY_INSIGHT**: `prepare: false` เป็นค่าที่ถูกต้องไม่ว่า pooler จะรองรับ prepared statement หรือไม่ — แย่ที่สุดคือเสียประสิทธิภาพเล็กน้อย ดีที่สุดคือกันระบบพัง
> **APPLIES_TO**: Task 1, Task 4
> **GOTCHA**: อย่าเขียนคอมเมนต์ในโค้ดว่า "PgBouncer ไม่รองรับ prepared statement" เพราะไม่จริงแล้ว — เขียนว่า "ค่าที่ปลอดภัยกับ pooled endpoint ทุกแบบ"

---

## Patterns to Mirror

### FILE_HEADER_DOC
```ts
// SOURCE: src/lib/db/index.ts:5-13
/**
 * DB — PostgreSQL connection singleton (postgres-js, pure JS, no native build)
 *
 * Migrated from better-sqlite3 (sync) → postgres-js (async).
 * - lazy-init: สร้าง pool เมื่อเรียกครั้งแรกเท่านั้น (avoid build-time connect)
 * - pool size 10 (mitigate postgres-js pure-JS overhead vs native)
 */
```
> JSDoc block หัวไฟล์ ภาษาไทยผสมอังกฤษ ใช้ bullet `-` อธิบายการตัดสินใจ **ไม่ใช่**อธิบายว่าโค้ดทำอะไร

### RATIONALE_COMMENT
```ts
// SOURCE: scripts/seed.ts:14-15
// § โหลด .env.local เพื่อให้ seed รันได้โดยไม่ต้อง export env ใน shell ทุกครั้ง
// (เหมือนที่ drizzle.config.ts / vitest.config.ts / playwright.config.ts ทำอยู่แล้ว)
config({ path: '.env.local', override: false });
```
> คอมเมนต์ที่อธิบาย **ทำไม** ขึ้นต้นด้วย `§` — ใช้เมื่อการตัดสินใจไม่ชัดในตัวเอง

### SMALL_UTIL_MODULE
```ts
// SOURCE: src/lib/db/query-helpers.ts:1-7
/**
 * Query helpers — wraps repeated `(await query.limit(1))[0]` pattern
 * (project ใช้ Drizzle core query builder ตรง ไม่ใช่ relational query API, จึงไม่มี findFirst() ในตัว)
 */
export async function firstOrUndefined<T>(rows: Promise<T[]>): Promise<T | undefined> {
  return (await rows)[0];
}
```
> ไฟล์เล็ก โฟกัสเดียว named export มี explicit return type

### TEST_STRUCTURE
```ts
// SOURCE: src/lib/db/query-helpers.test.ts:1-19
import { describe, expect, test } from 'vitest';
import { firstOrUndefined } from './query-helpers';

describe('firstOrUndefined', () => {
  test('returns the first element when the resolved array has items', async () => {
    const result = await firstOrUndefined(Promise.resolve([{ id: 1 }, { id: 2 }]));
    expect(result).toEqual({ id: 1 });
  });

  test('returns undefined when the resolved array is empty', async () => {
    const result = await firstOrUndefined(Promise.resolve([]));
    expect(result).toBeUndefined();
  });
});
```
> `import { describe, expect, test } from 'vitest'` (ไม่ใช่ `it`) · relative import `./module` · ชื่อเทสต์เป็นประโยคบอกพฤติกรรมภาษาอังกฤษ · ไฟล์เทสต์อยู่ **ข้าง ๆ** ไฟล์ต้นฉบับ

### ENV_VALIDATION_SPEC
```ts
// SOURCE: scripts/verify-env.ts:10-29
type Spec = {
  key: string;
  label: string;
  minLen?: number;
  serverOnly?: boolean;
};

const required: Spec[] = [
  { key: 'AUTH_URL', label: 'Auth.js trusted app URL (e.g. http://localhost:3000)' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', label: 'Upstash Redis REST token', minLen: 16 },
];
```

### ENV_ERROR_FORMAT
```ts
// SOURCE: scripts/verify-env.ts:40-53, 56-61
if (!v || v.startsWith('YOUR_') || v.startsWith('CHANGE_ME')) {
  errors.push(`✗ ${spec.key} — ${spec.label} (ยังเป็น placeholder)`);
  continue;
}

if (errors.length > 0) {
  console.error('\n[verify-env] BLOCKED — env ขาดหรือไม่ถูกต้อง:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
```
> สะสม error ลง array แล้วรายงานทีเดียว · ขึ้นต้นด้วย `✗ KEY — คำอธิบาย` · prefix `[verify-env]`

### PRODUCTION_ONLY_GATE
```ts
// SOURCE: scripts/verify-env.ts:63-85
// § Production-only: AUTH_URL ต้องเป็น https:// + canonical domain (ไม่ใช่ localhost)
if (process.env.NODE_ENV === 'production') {
  const u = process.env.AUTH_URL;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') {
      console.error(`✗ AUTH_URL — production ต้องเป็น https:// (ปัจจุบัน: ${parsed.protocol}//)`);
      process.exit(1);
    }
  } catch {
    console.error(`✗ AUTH_URL — URL ไม่ถูกต้อง (parse ไม่ผ่าน): ${u}`);
    process.exit(1);
  }
}
```
> เช็ก production แยกออกมาเป็นบล็อกท้ายไฟล์ · ใช้ `new URL()` ใน try/catch · exit ทันที (ไม่สะสม)

### LOG_PREFIX
```ts
// SOURCE: src/lib/upstash.ts:17, 80
console.warn('[upstash] Upstash not configured — rate limiting disabled');
console.warn('[upstash] rate limit unavailable — allowing request (fail-open)');
```
> `[module-name]` นำหน้าเสมอ · **ไม่มี logger library** ในโปรเจกต์นี้ — ใช้ `console.warn`/`console.error` ตรง ๆ

### SECRET_SAFE_CATCH
```ts
// SOURCE: src/lib/upstash.ts:76-80
} catch {
  // Redis ไม่ตอบ — policy ตาม opts.failOpen
  // (ห้าม leak error detail ออก log — เป็น secret/PII risk; จึงใช้ optional catch binding)
  if (failOpen) {
```
> **โปรเจกต์นี้มีวัฒนธรรมเรื่องนี้อยู่แล้ว** — optional catch binding เพื่อไม่ให้ error detail หลุด งานนี้ต่อยอดจากหลักการเดิม

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/lib/db/pg-options.ts` | **CREATE** | option ชุดเดียวใช้ร่วมกัน 4 จุด — ไม่ให้ `prepare` หลุดกลับมาเป็น default ที่ไหน |
| `src/lib/db/pg-options.test.ts` | **CREATE** | ล็อกค่า `prepare: false` ด้วยเทสต์ ไม่ให้ใครแก้กลับโดยไม่ตั้งใจ |
| `src/lib/db/redact.ts` | **CREATE** | ปิดช่อง connection string รั่วออก log |
| `src/lib/db/redact.test.ts` | **CREATE** | ครอบ edge case ของ regex |
| `src/lib/db/index.ts` | UPDATE | ใช้ `pgClientOptions` + redact ใน error message |
| `drizzle.config.ts` | UPDATE | รองรับ direct URL + ไม่พ่น URL ใน error |
| `package.json` | UPDATE | เพิ่ม `db:migrate` |
| `scripts/verify-env.ts` | UPDATE | เพิ่ม gate ตรวจ `DATABASE_URL` + โหลด `.env.local` |
| `scripts/check-superadmin.ts` | UPDATE | ใช้ `pgClientOptions` (Phase 3 เรียกสคริปต์นี้กับ Neon) |
| `scripts/seed-faq.ts` | UPDATE | ใช้ `pgClientOptions` (Phase 3 เรียกสคริปต์นี้กับ Neon) |
| `scripts/check-line-db.ts` | UPDATE | ใช้ `pgClientOptions` (สคริปต์ diagnostic — ถ้าไม่แก้จะพังเวลาต้องใช้ debug จริง) |

> ⚠️ **3 สคริปต์ท้ายตารางเป็นสิ่งที่ PRD ตกไป** — PRD ระบุแค่ `src/lib/db/index.ts` แต่ `grep -rn "postgres("` พบว่ามีอีก 3 จุดที่สร้าง client เองด้วย option default และ **2 ใน 3 คือสคริปต์ที่ Phase 3 ต้องรันกับ Neon โดยตรง** (`seed-faq`, `check-superadmin`)

## NOT Building

- **ไม่แตะ `src/lib/db/schema.ts`** — ไม่มีเหตุผลให้เปลี่ยน schema ในงานนี้
- **ไม่สร้าง migration ใหม่** — 14 ไฟล์เดิมใช้ได้ตามเดิม
- **ไม่เปลี่ยน driver** ไป `@neondatabase/serverless` (PRD ระบุเป็น Won't)
- **ไม่ลบ `db:push`** — ยังมีประโยชน์สำหรับ prototyping ใน local เพียงแต่ห้ามใช้กับ production
- **ไม่แก้ `.env.example` / `.env.local.example` / `DEPLOY.md`** — เป็น Phase 7
- **ไม่ลบ eslint rule C3** — เป็น Phase 7
- **ไม่สร้าง Neon project จริง / ไม่แตะ Vercel** — เป็น Phase 2
- **ไม่รัน migration กับ Neon** — เป็น Phase 3
- **ไม่เพิ่ม logger library** — โปรเจกต์ใช้ `console.*` และงานนี้ไม่ใช่ที่ทางจะเปลี่ยน

---

## Step-by-Step Tasks

### Task 1: สร้าง `src/lib/db/pg-options.ts`

- **ACTION**: สร้างไฟล์ใหม่ที่ export option ชุดเดียวสำหรับ `postgres()` ทุกจุดในโปรเจกต์
- **IMPLEMENT**:
  ```ts
  import type { Options } from 'postgres';

  /**
   * pg-options — option ชุดเดียวสำหรับ postgres-js ทุกจุดในโปรเจกต์
   *
   * - prepare: false — ค่าที่ปลอดภัยกับ pooled endpoint ทุกแบบ (Neon pooler, PgBouncer,
   *   pgpool) แลกกับ query plan cache ที่หายไปเล็กน้อย ดีกว่าเสี่ยงพังทั้งระบบ
   * - max ต่ำ — serverless มีหลาย instance พร้อมกัน และ pooler จัดการ concurrency
   *   ให้อยู่แล้ว การถือ 10 connection ต่อ instance ทำให้ชน connection limit เร็วเปล่า ๆ
   * - idle_timeout — postgres-js default = 0 (ไม่ปิด connection เลย) ซึ่งบน serverless
   *   ทำให้ connection ค้างกิน slot ของ pooler จนกว่า instance จะตาย
   */
  const POOL_MAX = 5;
  const IDLE_TIMEOUT_SECONDS = 20;

  export const pgClientOptions: Options<Record<string, never>> = {
    max: POOL_MAX,
    prepare: false,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
  };
  ```
- **MIRROR**: `SMALL_UTIL_MODULE` + `FILE_HEADER_DOC`
- **IMPORTS**: `import type { Options } from 'postgres'`
- **GOTCHA**: ถ้า type `Options<Record<string, never>>` ทำให้ `tsc` บ่น ให้ใช้ `satisfies` แทน: `export const pgClientOptions = { max: POOL_MAX, prepare: false, idle_timeout: IDLE_TIMEOUT_SECONDS } as const;` แล้วปล่อยให้ call site infer — **อย่าใช้ `any`** (ผิด coding-style ของโปรเจกต์)
- **VALIDATE**: `pnpm typecheck` ผ่าน

### Task 2: สร้าง `src/lib/db/pg-options.test.ts`

- **ACTION**: เทสต์ที่ล็อกค่าไว้ ไม่ให้ `prepare` หลุดกลับเป็น `true`
- **IMPLEMENT**:
  ```ts
  import { describe, expect, test } from 'vitest';
  import { pgClientOptions } from './pg-options';

  describe('pgClientOptions', () => {
    test('disables prepared statements so pooled endpoints stay safe', () => {
      expect(pgClientOptions.prepare).toBe(false);
    });

    test('keeps the pool small enough for serverless instances', () => {
      expect(pgClientOptions.max).toBeLessThanOrEqual(5);
    });

    test('sets a non-zero idle timeout so connections return to the pooler', () => {
      expect(pgClientOptions.idle_timeout).toBeGreaterThan(0);
    });
  });
  ```
- **MIRROR**: `TEST_STRUCTURE`
- **IMPORTS**: `vitest`, `./pg-options`
- **GOTCHA**: อย่าเขียนเทสต์แบบ `toEqual({...})` ทั้งก้อน — จะพังทุกครั้งที่ปรับ `max` ซึ่งเป็นค่าที่ตั้งใจให้ปรับได้หลังวัดจริง (PRD ระบุว่า pool tuning ต้องรอ baseline)
- **VALIDATE**: `pnpm vitest run src/lib/db/pg-options.test.ts`

### Task 3: สร้าง `src/lib/db/redact.ts`

- **ACTION**: helper mask รหัสผ่านใน connection string ทุกรูปแบบที่โผล่ในข้อความ
- **IMPLEMENT**:
  ```ts
  /**
   * redact — mask รหัสผ่านใน Postgres connection string ก่อนส่งออก log
   *
   * error ของ postgres-js / drizzle-kit / pg_dump มักฝัง connection string เต็ม ๆ
   * มาในข้อความ ซึ่งจะไปโผล่ใน Vercel build log และ CI log ที่คนอื่นอ่านได้
   *
   * § mask เฉพาะรหัสผ่าน ไม่ mask host/user/database
   * host กับ database ไม่ใช่ความลับและจำเป็นตอน debug ว่าต่อผิดตัวหรือเปล่า
   * การ mask ทั้ง URL ทำให้ log ไร้ประโยชน์โดยไม่ได้ความปลอดภัยเพิ่ม
   */
  const PG_URL_CREDENTIALS = /(postgres(?:ql)?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;

  export function redactConnectionString(input: string): string {
    return input.replace(PG_URL_CREDENTIALS, '$1$2:***@');
  }

  /**
   * ดึงข้อความจาก error ที่ไม่รู้ชนิด แล้ว redact ก่อนคืน — ใช้ใน catch block
   */
  export function redactErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return redactConnectionString(message);
  }
  ```
- **MIRROR**: `SMALL_UTIL_MODULE`, `FILE_HEADER_DOC`, `RATIONALE_COMMENT`
- **IMPORTS**: ไม่มี
- **GOTCHA**:
  - regex ใช้ flag `g` → **`RegExp` ที่มี `g` มี state `lastIndex`** แต่ `String.replace` รีเซ็ตให้เอง จึงปลอดภัย **ห้าม**เปลี่ยนไปใช้ `.test()` กับ regex ตัวนี้เพราะจะเจอบั๊ก `lastIndex` ทันที
  - รหัสผ่านที่มี `@` ดิบจะทำให้ regex จับผิด — แต่ connection string ที่ถูกต้องต้อง URL-encode `@` เป็น `%40` อยู่แล้ว จึงไม่ใช่เคสจริง
  - `error instanceof Error` จำเป็น — postgres-js โยน object ที่ไม่ใช่ `Error` ในบางเคส
- **VALIDATE**: Task 4

### Task 4: สร้าง `src/lib/db/redact.test.ts`

- **ACTION**: ครอบ edge case ของ regex ให้ครบ
- **IMPLEMENT**:
  ```ts
  import { describe, expect, test } from 'vitest';
  import { redactConnectionString, redactErrorMessage } from './redact';

  describe('redactConnectionString', () => {
    test('masks the password while keeping user, host and database readable', () => {
      const result = redactConnectionString('postgresql://neondb_owner:npg_s3cret@ep-x.neon.tech/neondb');
      expect(result).toBe('postgresql://neondb_owner:***@ep-x.neon.tech/neondb');
    });

    test('masks every occurrence when a message embeds the url more than once', () => {
      const result = redactConnectionString(
        'failed on postgres://u:p1@a/db then postgres://u:p2@b/db'
      );
      expect(result).not.toContain('p1');
      expect(result).not.toContain('p2');
    });

    test('handles both postgres:// and postgresql:// schemes', () => {
      expect(redactConnectionString('postgres://u:p@h/d')).toBe('postgres://u:***@h/d');
      expect(redactConnectionString('postgresql://u:p@h/d')).toBe('postgresql://u:***@h/d');
    });

    test('leaves a url without a password untouched', () => {
      expect(redactConnectionString('postgres://user@host/db')).toBe('postgres://user@host/db');
    });

    test('leaves unrelated text untouched', () => {
      expect(redactConnectionString('connection refused')).toBe('connection refused');
    });

    test('returns an empty string unchanged', () => {
      expect(redactConnectionString('')).toBe('');
    });
  });

  describe('redactErrorMessage', () => {
    test('extracts and redacts the message from an Error', () => {
      const error = new Error('connect failed: postgres://u:s3cret@h/d');
      expect(redactErrorMessage(error)).toBe('connect failed: postgres://u:***@h/d');
    });

    test('stringifies and redacts a non-Error throwable', () => {
      expect(redactErrorMessage('postgres://u:s3cret@h/d')).toBe('postgres://u:***@h/d');
    });
  });
  ```
- **MIRROR**: `TEST_STRUCTURE`
- **IMPORTS**: `vitest`, `./redact`
- **GOTCHA**: เทสต์ "masks every occurrence" ต้องยืนยันด้วย `not.toContain` ไม่ใช่ `toBe` — เพราะจุดสำคัญคือ **ไม่มีรหัสผ่านหลงเหลือ** ไม่ใช่รูปแบบ output ตรงเป๊ะ
- **VALIDATE**: `pnpm vitest run src/lib/db/redact.test.ts` ผ่านทั้ง 8 เคส

### Task 5: แก้ `src/lib/db/index.ts`

- **ACTION**: ใช้ `pgClientOptions` แทน option inline + redact error
- **IMPLEMENT**: แก้ 3 จุด
  1. เพิ่ม import:
     ```ts
     import { pgClientOptions } from './pg-options';
     import { redactErrorMessage } from './redact';
     ```
  2. แทนบรรทัด 26-27:
     ```ts
     // prepare/max/idle_timeout อยู่ใน pg-options.ts (ใช้ร่วมกับ scripts); ssl ตาม connection string
     pgClient = postgres(url, pgClientOptions);
     ```
  3. ห่อการสร้าง client ด้วย try/catch ที่ redact:
     ```ts
     try {
       pgClient = postgres(url, pgClientOptions);
     } catch (error: unknown) {
       throw new Error(`[db] เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ${redactErrorMessage(error)}`);
     }
     ```
  4. อัปเดต JSDoc หัวไฟล์บรรทัด 10 จาก `pool size 10 (...)` เป็นข้อความที่ชี้ไป `pg-options.ts`
- **MIRROR**: `LOG_PREFIX` (prefix `[db]`), `SECRET_SAFE_CATCH`
- **IMPORTS**: ตามข้อ 1
- **GOTCHA**:
  - **อย่าลบคอมเมนต์บรรทัด 11-12** (`foreign_keys pragma ถูกลบ`, `WAL pragma ถูกลบ`) — เป็นบันทึกประวัติการย้ายจาก SQLite ที่ยังมีค่า
  - `postgres()` เป็น lazy — มันไม่ throw ตอนสร้าง แต่ throw ตอน query จริง try/catch ตรงนี้จึงจับได้แค่ error ตอน parse URL **ซึ่งเป็นเคสที่พ่น URL ออกมาพอดี** จึงยังคุ้มที่จะห่อ
  - อย่าเปลี่ยน signature ของ `getDb()` / `closeDb()` — มีที่เรียกอยู่ 60+ ไฟล์
- **VALIDATE**: `pnpm typecheck` + integration test เดิมยังผ่านกับ docker (Task 11)

### Task 6: แก้ `drizzle.config.ts` ให้รองรับ direct URL

- **ACTION**: อ่าน unpooled URL ก่อน แล้ว fallback
- **IMPLEMENT**: แทนบรรทัด 9-14:
  ```ts
  // § Neon (และ managed Postgres อื่น) แยก endpoint เป็น 2 ตัว:
  //   - pooled   → สำหรับ app runtime (ผ่าน PgBouncer)
  //   - direct   → สำหรับ DDL/migration ที่ต้องการ session-level features
  // drizzle-kit ต้องใช้ direct เสมอ; ถ้าไม่มีก็ fallback ไป DATABASE_URL
  // (local docker มี endpoint เดียว จึงเข้า fallback ตามปกติ)
  //
  // ⚠️ ชื่อตัวแปรที่ Vercel-Neon integration inject ต้องยืนยันใน Phase 2 แล้วตัด
  //    ตัวที่ไม่ใช้ทิ้ง — ตอนนี้รองรับทั้งสองชื่อที่พบบ่อยไว้ก่อน
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set (expected postgresql://...). Copy .env.example to .env and configure it.'
    );
  }
  ```
- **MIRROR**: `RATIONALE_COMMENT`
- **IMPORTS**: ไม่เปลี่ยน
- **GOTCHA**: ใช้ `??` ไม่ใช่ `||` — `||` จะข้าม empty string ไปหาตัวถัดไป ซึ่งซ่อนความผิดพลาดว่าตั้งค่าเป็นค่าว่างไว้ ให้ empty string ตกลงไปที่ `if (!databaseUrl)` แล้ว error ชัด ๆ ดีกว่า
- **VALIDATE**: `pnpm typecheck` + Task 11 (`db:migrate` ทำงานกับ docker ผ่าน fallback)

### Task 7: เพิ่ม `db:migrate` ใน `package.json`

- **ACTION**: เพิ่ม script ตัวเดียว
- **IMPLEMENT**: ใน `"scripts"` ต่อจาก `"db:generate"`:
  ```json
  "db:migrate": "drizzle-kit migrate",
  ```
  ลำดับที่ต้องการ: `db:generate` → `db:migrate` → `db:push` → `db:seed` → ...
- **MIRROR**: รูปแบบ `db:*` ที่มีอยู่ (`package.json:25-31`)
- **IMPORTS**: ไม่มี — `drizzle-kit` อยู่ใน devDependencies แล้ว (`^0.31.10`)
- **GOTCHA**: **ห้ามลบ `db:push`** — ยังใช้ prototyping ใน local ได้ ที่ห้ามคือใช้กับ production
- **VALIDATE**: `pnpm db:migrate --help` ไม่ error

### Task 8: เพิ่ม gate ตรวจ `DATABASE_URL` ใน `scripts/verify-env.ts`

- **ACTION**: เพิ่ม `DATABASE_URL` เข้า `required[]` + เพิ่มบล็อกตรวจรูปแบบ
- **IMPLEMENT**: แก้ 3 จุด
  1. เพิ่มเข้า `required[]` (ต่อจาก `AUTH_URL`):
     ```ts
     { key: 'DATABASE_URL', label: 'PostgreSQL connection string (postgresql://...)' },
     ```
  2. เพิ่มบล็อกใหม่ **ก่อน** บล็อก production ของ `AUTH_URL`:
     ```ts
     // § DATABASE_URL — ตรวจรูปแบบ ไม่ใช่แค่ว่ามีค่า
     // ใส่ค่าผิดชนิด (เช่น direct endpoint แทน pooled) จะไปพังตอน runtime บน production
     // แทนที่จะพังตอน build ซึ่งแก้ได้ถูกกว่ามาก
     //
     // ⚠️ ทุกข้อความ error ต้องผ่าน redactConnectionString ก่อน — build log ของ Vercel
     //    คนอื่นอ่านได้ และ connection string มีรหัสผ่านฐานข้อมูลประชาชนอยู่ (PDPA)
     {
       const raw = process.env.DATABASE_URL;
       if (raw) {
         let parsed: URL | null = null;
         try {
           parsed = new URL(raw);
         } catch {
           console.error(
             `✗ DATABASE_URL — parse ไม่ผ่าน: ${redactConnectionString(raw)}`
           );
           process.exit(1);
         }

         if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
           console.error(
             `✗ DATABASE_URL — ต้องขึ้นต้นด้วย postgresql:// (ปัจจุบัน: ${parsed.protocol}//)`
           );
           process.exit(1);
         }

         if (process.env.NODE_ENV === 'production') {
           if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
             console.error('✗ DATABASE_URL — production ห้ามชี้ไป localhost');
             process.exit(1);
           }
           if (parsed.searchParams.get('sslmode') !== 'require') {
             console.error(
               '✗ DATABASE_URL — production ต้องมี ?sslmode=require (managed Postgres บังคับ TLS)'
             );
             process.exit(1);
           }
           // § เตือนอย่างเดียว ไม่บล็อก — ยังไม่ยืนยันว่า Neon ตั้งชื่อ pooled host
           //   ว่า "-pooler" เสมอไหม (Open Question ใน PRD) การ fail ตรงนี้เสี่ยง
           //   บล็อก deploy ที่ถูกต้องมากกว่าเสี่ยงปล่อยของผิดผ่าน
           if (parsed.hostname.includes('neon.tech') && !parsed.hostname.includes('-pooler')) {
             console.warn(
               '[verify-env] ⚠ DATABASE_URL ดูเหมือนเป็น direct endpoint ของ Neon — app ควรใช้ pooled endpoint'
             );
           }
         }
       }
     }
     ```
  3. เพิ่ม import ที่หัวไฟล์ (หลัง shebang + JSDoc):
     ```ts
     import { redactConnectionString } from '../src/lib/db/redact';
     ```
- **MIRROR**: `ENV_VALIDATION_SPEC`, `ENV_ERROR_FORMAT`, `PRODUCTION_ONLY_GATE`, `RATIONALE_COMMENT`
- **IMPORTS**: `../src/lib/db/redact` (relative — สคริปต์อื่นก็ใช้ `../src/...` เช่น `scripts/seed.ts:8`)
- **GOTCHA**:
  - ห่อด้วย block scope `{ }` เพื่อไม่ให้ตัวแปร `raw`/`parsed` ชนกับ `const u` ในบล็อก `AUTH_URL` ด้านล่าง
  - `new URL()` ของ Node **ยอมรับ** `postgresql://` (non-special scheme) แต่ `parsed.port`/`parsed.hostname` ยังอ่านได้ปกติ — ทดสอบด้วย Task 11
  - อย่าใส่ `minLen` ให้ `DATABASE_URL` — ความยาวไม่ได้บอกอะไร และจะได้ error ที่ทำให้เข้าใจผิด
- **VALIDATE**: Task 11 (`DATABASE_URL=not-a-url pnpm verify-env` ต้อง exit 1)

### Task 9: ให้ `verify-env.ts` โหลด `.env.local`

- **ACTION**: เพิ่ม dotenv loading เพื่อให้ `pnpm build` รันได้ในเครื่อง dev
- **IMPLEMENT**: หลัง JSDoc หัวไฟล์:
  ```ts
  import { config } from 'dotenv';

  // § โหลด .env.local เพื่อให้ `pnpm build` รันในเครื่อง dev ได้โดยไม่ต้อง export env เอง
  // (เหมือนที่ drizzle.config.ts / vitest.setup.ts / scripts/seed.ts ทำอยู่แล้ว)
  // override:false = production/CI ที่มี env จริงอยู่แล้วไม่ถูกเขียนทับ และ Vercel
  // ไม่มีไฟล์ .env.local อยู่แล้ว บรรทัดนี้จึงเป็น no-op บน production
  config({ path: '.env.local', override: false });
  ```
- **MIRROR**: `RATIONALE_COMMENT` — คัดลอกโครงคอมเมนต์จาก `scripts/seed.ts:14-15` และ `drizzle.config.ts:4-6`
- **IMPORTS**: `dotenv` (อยู่ใน dependencies แล้ว `^17.4.2`)
- **GOTCHA**: **นี่เปลี่ยนพฤติกรรมของ check ที่มีอยู่เดิมด้วย** — ก่อนหน้านี้ `pnpm build` ในเครื่อง dev จะ fail ที่ `AUTH_SECRET` เพราะ verify-env ไม่โหลด `.env.local` หลังแก้แล้วจะผ่าน ถือเป็นการแก้บั๊กที่ถูกต้องและปลอดภัย (`override: false` ทำให้ production ไม่ได้รับผลกระทบ) **แต่ต้องระบุใน commit message ให้ชัดว่าเป็นผลข้างเคียงที่ตั้งใจ**
- **VALIDATE**: `pnpm verify-env` ในเครื่องที่มี `.env.local` → ผ่านโดยไม่ต้อง export อะไร

### Task 10: แก้ 3 สคริปต์ให้ใช้ `pgClientOptions`

- **ACTION**: แทน `postgres(url)` ด้วย `postgres(url, pgClientOptions)` ทั้ง 3 จุด
- **IMPLEMENT**:
  | ไฟล์ | บรรทัด | เดิม | ใหม่ |
  |---|---|---|---|
  | `scripts/check-line-db.ts` | 6 | `postgres(process.env.DATABASE_URL!)` | `postgres(process.env.DATABASE_URL!, pgClientOptions)` |
  | `scripts/check-superadmin.ts` | 16 | `postgres(process.env.DATABASE_URL!)` | `postgres(process.env.DATABASE_URL!, pgClientOptions)` |
  | `scripts/seed-faq.ts` | 8 | `postgres(DATABASE_URL)` | `postgres(DATABASE_URL, pgClientOptions)` |

  เพิ่ม import ในแต่ละไฟล์:
  ```ts
  import { pgClientOptions } from '../src/lib/db/pg-options';
  ```
- **MIRROR**: `scripts/seed.ts:8` — รูปแบบ import `'../src/lib/...'` จาก `scripts/`
- **IMPORTS**: ตามข้างบน
- **GOTCHA**:
  - **นี่คือส่วนที่ PRD ตกไป** — ถ้าแก้แค่ `src/lib/db/index.ts` แล้ว Phase 3 รัน `seed-faq` กับ Neon จะเจอปัญหาเดิมที่เพิ่งแก้ไป
  - `check-superadmin.ts` ใช้ `process.env.DATABASE_URL!` แบบ non-null assertion — **อย่าเพิ่งไปแก้เป็น validation ที่ถูกต้อง** เพราะเป็น one-off diagnostic script ไม่ใช่ production path การขยายขอบเขตตรงนี้ทำให้ diff ใหญ่โดยไม่จำเป็น
- **VALIDATE**: `pnpm typecheck` ผ่าน (สคริปต์อยู่ใน tsconfig scope)

### Task 11: ตรวจรับทั้งชุด

- **ACTION**: รัน validation ทั้งหมดใน §Validation Commands ตามลำดับ
- **IMPLEMENT**: ดูหัวข้อถัดไป
- **MIRROR**: —
- **IMPORTS**: —
- **GOTCHA**: การทดสอบ `db:migrate` **ต้องใช้ database เปล่า** — ถ้ารันกับ `postgres` database ที่มีตารางอยู่แล้วจาก `db:push` จะเจอ `relation already exists` วิธีที่ปลอดภัยคือสร้าง database ชั่วคราวแยก **ห้ามใช้ `docker compose down -v`** เพราะจะลบข้อมูล dev ทิ้งทั้งหมด
- **VALIDATE**: ทุกคำสั่งผ่านตามที่ระบุ

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `pgClientOptions.prepare` | — | `false` | — |
| `pgClientOptions.max` | — | `<= 5` | — |
| `pgClientOptions.idle_timeout` | — | `> 0` | — |
| redact — เคสปกติ | `postgresql://neondb_owner:npg_s3cret@ep-x.neon.tech/neondb` | `...:***@...` และไม่มี `npg_s3cret` | — |
| redact — หลายครั้งในข้อความเดียว | ข้อความที่มี URL 2 ตัว | ไม่เหลือรหัสผ่านทั้งคู่ | ✅ |
| redact — สอง scheme | `postgres://` และ `postgresql://` | mask ทั้งคู่ | ✅ |
| redact — ไม่มีรหัสผ่าน | `postgres://user@host/db` | คืนค่าเดิม | ✅ |
| redact — ข้อความทั่วไป | `connection refused` | คืนค่าเดิม | ✅ |
| redact — string ว่าง | `''` | `''` | ✅ |
| `redactErrorMessage` — Error | `new Error('... postgres://u:s@h/d')` | mask แล้ว | — |
| `redactErrorMessage` — non-Error | `'postgres://u:s@h/d'` (string ดิบ) | mask แล้ว | ✅ |

### Edge Cases Checklist

- [x] Empty input — เทสต์ string ว่างใน redact
- [x] Invalid types — `redactErrorMessage` รับ `unknown` และทดสอบ non-Error
- [x] ไม่มี match — ข้อความทั่วไปต้องไม่ถูกแตะ
- [x] หลาย match — ต้อง mask ทุกตัว ไม่ใช่ตัวแรก
- [x] URL ผิดรูปแบบ — `DATABASE_URL=not-a-url` ต้อง exit 1
- [x] protocol ผิด — `mysql://...` ต้อง exit 1
- [ ] Concurrent access — **N/A** ไม่มี shared mutable state (`pgClientOptions` เป็น const, redact เป็น pure function)
- [ ] Network failure — **N/A** สำหรับ Phase นี้ (เป็น config ล้วน ไม่มีการต่อจริง — ทดสอบใน Phase 3/4)
- [ ] Permission denied — **N/A** Phase นี้

---

## Validation Commands

### 1. Static Analysis
```bash
pnpm typecheck
pnpm lint
```
**EXPECT**: zero type errors, zero lint errors

### 2. Unit Tests (เฉพาะไฟล์ใหม่)
```bash
pnpm vitest run src/lib/db/pg-options.test.ts src/lib/db/redact.test.ts
```
**EXPECT**: 11 tests passed

### 3. Full Unit Suite (ไม่มี regression)
```bash
pnpm vitest run --exclude '**/*.integration.test.ts'
```
**EXPECT**: ผ่านทั้งหมด — เท่ากับที่ CI รัน (`.github/workflows/ci.yml`)

### 4. Env Gate — พิสูจน์ว่ากันของผิดได้จริง
```bash
# ต้อง exit 1 — URL parse ไม่ผ่าน
DATABASE_URL=not-a-url pnpm verify-env; echo "exit=$?"

# ต้อง exit 1 — protocol ผิด
DATABASE_URL=mysql://u:p@h/d pnpm verify-env; echo "exit=$?"

# ต้อง exit 1 — production + localhost
NODE_ENV=production DATABASE_URL=postgresql://u:p@localhost:5432/db pnpm verify-env; echo "exit=$?"

# ต้อง exit 1 — production ไม่มี sslmode=require
NODE_ENV=production DATABASE_URL=postgresql://u:p@db.example.com/db pnpm verify-env; echo "exit=$?"

# ต้องผ่าน (exit 0) — ค่าถูกต้องจาก .env.local
pnpm verify-env; echo "exit=$?"
```
**EXPECT**: สี่คำสั่งแรก `exit=1` · คำสั่งสุดท้าย `exit=0`
**EXPECT เพิ่มเติม**: ข้อความ error ที่พิมพ์ออกมา **ต้องเห็นเป็น `:***@`** ไม่มีรหัสผ่านโผล่สักตัว — ตรวจด้วยตา

### 5. Database Validation — `db:migrate` บน DB เปล่า
```bash
# สร้าง database ชั่วคราว (ไม่แตะข้อมูล dev เดิม)
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE migrate_check;"

# รัน migration ทั้ง 14 ตัว
DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@127.0.0.1:5432/migrate_check pnpm db:migrate

# ตรวจ journal — ต้องได้ 14
docker compose exec -T postgres psql -U postgres -d migrate_check \
  -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"

# เก็บกวาด
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE migrate_check;"
```
**EXPECT**: `count = 14` (ตรงกับ `drizzle/meta/_journal.json` ที่มี 14 entries, idx 0–13)
**GOTCHA**: ถ้า `drizzle.__drizzle_migrations` ไม่พบ ให้ลอง `public.__drizzle_migrations` — drizzle บางเวอร์ชันวางตารางคนละ schema ตัวเลข 14 คือสิ่งที่ต้องได้ ไม่ใช่ชื่อ schema

### 6. Integration Tests — ยืนยันว่าไม่พังของเดิม
```bash
docker compose up -d postgres redis up-redis
pnpm vitest run --testNamePattern='' src/lib/cases/operations.integration.test.ts
```
**EXPECT**: ผ่าน — พิสูจน์ว่า `prepare: false` ไม่ทำให้ query ที่มีอยู่พัง
**หมายเหตุ**: ต้องมี seed data อยู่ก่อน (integration test บางตัวเช็ค `provinces` ไม่ว่าง — ดู `src/app/api/provinces/route.integration.test.ts:10`)

### 7. Manual Validation
- [ ] `pnpm dev` แล้วเปิดหน้าแรก — ยังต่อ docker Postgres ได้ตามปกติ
- [ ] ส่งเรื่องร้องเรียน 1 เคสในเครื่อง — เขียน DB ได้
- [ ] เปิดหน้า admin แล้ว login — อ่าน DB ได้
- [ ] `git diff` — ไม่มี connection string จริงหลุดเข้า diff สักบรรทัด

---

## Acceptance Criteria

- [ ] Task 1–10 เสร็จครบ
- [ ] Validation 1–6 ผ่านทั้งหมด
- [ ] `pgClientOptions.prepare === false` และมีเทสต์ล็อกไว้
- [ ] **ไม่เหลือจุดใดในโปรเจกต์ที่เรียก `postgres()` โดยไม่ส่ง `pgClientOptions`** — ยืนยันด้วย `grep -rn "postgres(" --include="*.ts" . | grep -v node_modules`
- [ ] `pnpm db:migrate` สร้าง schema บน DB เปล่าได้ครบ และ `__drizzle_migrations` มี 14 แถว
- [ ] `pnpm build` ล้มเหลวเมื่อ `DATABASE_URL` ผิดรูปแบบ
- [ ] ข้อความ error ทุกทางไม่มีรหัสผ่านโผล่
- [ ] zero type errors · zero lint errors

## Completion Checklist

- [ ] คอมเมนต์ "ทำไม" ขึ้นต้นด้วย `§` ตามธรรมเนียมโปรเจกต์
- [ ] `console.*` มี prefix `[module]`
- [ ] ไฟล์เทสต์อยู่ข้างไฟล์ต้นฉบับ ใช้ `import { describe, expect, test } from 'vitest'`
- [ ] ไม่มี magic number — `POOL_MAX`, `IDLE_TIMEOUT_SECONDS` เป็น named const
- [ ] ไม่มี `any` — ใช้ `unknown` แล้ว narrow
- [ ] ไม่ได้ขยายขอบเขตไปแตะ Phase 2/3/7
- [ ] commit message ระบุผลข้างเคียงของ Task 9 (verify-env โหลด `.env.local` แล้ว)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `prepare: false` ทำให้ query ช้าลงจนสังเกตได้ | ต่ำ | ปานกลาง | Validation 6 รัน integration test จริง; ถ้าช้าจริงค่อยวัดใน Phase 4 แล้วพิจารณาเปิดกลับหลังยืนยันว่า Neon pooler รองรับ |
| `new URL()` แปลง `postgresql://` ไม่เหมือนที่คาด | ปานกลาง | ต่ำ | Validation 4 ทดสอบครบทุกเคสก่อนถือว่าผ่าน — ไม่เดา |
| Task 9 ทำให้ `pnpm build` ผ่านทั้งที่ env ไม่ครบใน CI | **ต่ำ** | สูง | `override: false` + CI ไม่มีไฟล์ `.env.local` (ไม่ได้ commit) → เป็น no-op บน CI/Vercel |
| `db:migrate` ชนกับ DB ที่เคย `db:push` มาก่อน | **สูง** ในเครื่อง dev | ต่ำ | ใช้ database ชั่วคราวแยกตาม Validation 5 — **ห้าม `docker compose down -v`** |
| ชื่อ env ของ Vercel-Neon ไม่ใช่ `DATABASE_URL_UNPOOLED` | ปานกลาง | ต่ำ | รองรับ 2 ชื่อ + fallback; ยืนยันชื่อจริงใน Phase 2 แล้วตัดตัวที่ไม่ใช้ทิ้ง |

## Notes

**สิ่งที่ค้นพบระหว่างสำรวจและไม่ได้อยู่ใน PRD:**

1. **มี 3 สคริปต์สร้าง `postgres()` client เองด้วย option default** (`scripts/check-line-db.ts:6`, `scripts/check-superadmin.ts:16`, `scripts/seed-faq.ts:8`) — PRD ระบุแค่ `src/lib/db/index.ts` แต่ **2 ใน 3 คือสคริปต์ที่ Phase 3 ต้องรันกับ Neon** จึงเพิ่มเข้ามาเป็น Task 10 และเป็นเหตุผลที่แยก `pg-options.ts` ออกมาแทนที่จะแก้ inline

2. **`scripts/verify-env.ts` ไม่โหลด `.env.local`** ทำให้ `pnpm build` ในเครื่อง dev ล้มเหลวที่ `AUTH_SECRET` อยู่แล้วตั้งแต่ก่อนงานนี้ — Task 9 แก้ไปด้วยเพราะจำเป็นต่อการพิสูจน์ success criterion ของ Phase 1 และเป็น pattern ที่ไฟล์อื่นใช้กันหมดแล้ว

3. **โปรเจกต์ไม่มี logger library** — ใช้ `console.warn`/`console.error` พร้อม prefix `[module]` แผนนี้ตามธรรมเนียมเดิม ไม่แนะนำให้เพิ่ม logger ในงานนี้

4. **โปรเจกต์มีวัฒนธรรมเรื่อง secret ใน log อยู่แล้ว** — `src/lib/upstash.ts:78` มีคอมเมนต์ "ห้าม leak error detail ออก log — เป็น secret/PII risk" งาน redact นี้เป็นการต่อยอดหลักการเดิม ไม่ใช่ของใหม่ที่ยัดเข้ามา

**การตัดสินใจที่ควรรู้:**

- **redact เฉพาะรหัสผ่าน ไม่ redact host/user/db** — เพราะ host กับ database ไม่ใช่ความลับและจำเป็นตอน debug ว่าต่อผิด project หรือเปล่า (ซึ่งเป็นความเสี่ยงจริงตาม PRD เรื่อง Neon 2 project) การ mask ทั้ง URL ทำให้ log ไร้ประโยชน์โดยไม่ได้ความปลอดภัยเพิ่ม
- **neon-without-pooler เป็น warning ไม่ใช่ error** — เพราะยังไม่ยืนยันว่า Neon ตั้งชื่อ pooled host ว่า `-pooler` เสมอ (เป็น Open Question ใน PRD) การ fail ตรงนี้เสี่ยงบล็อก deploy ที่ถูกต้อง
- **`max: 5` เป็นค่าเริ่มต้นที่ยังไม่ได้วัด** — PRD ระบุว่า pool tuning ต้องรอ baseline จริงใน Phase 4 เทสต์จึงเช็ค `<= 5` ไม่ใช่ `=== 5`
