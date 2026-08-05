# ย้ายฐานข้อมูลไปใช้ Neon (Serverless Postgres)

> โปรเจกต์: `subdistrict-works` — ระบบรับเรื่องร้องเรียน/ร้องทุกข์ Subdistrict Works (อ.เดโม จ.เดโม)

---

## Problem Statement

โปรเจกต์นี้ยังไม่มีฐานข้อมูล production — โค้ดพร้อม deploy แล้ว (Next.js 16 + Drizzle + 14 migrations) แต่เอกสารและ `.env.example` ชี้ไป Supabase ซึ่ง **ใช้ไม่ได้เพราะโควตา free tier ถูกโปรเจกต์อื่นใช้ไปแล้ว** ผลคือระบบขึ้น production ไม่ได้เลย และประชาชนในตำบลยังไม่มีช่องทางร้องเรียนออนไลน์ตามที่ตั้งใจ

ต้นทุนของการไม่แก้: โค้ดที่เขียนเสร็จแล้วทั้งหมด (14+ ตาราง, LINE bot, ระบบ PDPA, admin console) ค้างอยู่ที่ localhost ไม่สร้างคุณค่าให้ใคร

## Evidence

- `.env.example:32` = `DATABASE_URL=CHANGE_ME_paste_supabase_connection_string_here` — ยังไม่เคยถูกตั้งค่าจริง
- `DEPLOY.md:76-117` มี "ขั้นที่ 2: สมัคร Supabase" เต็มขั้น พร้อมตัวอย่าง connection string ที่เป็น placeholder
- `docker-compose.yml:51` — ปัจจุบันมีแค่ Postgres 17 ใน local สำหรับ dev
- `.github/workflows/ci.yml` — integration tests ถูก exclude เพราะ "ต้องการ Postgres+Redis จริง" ซึ่งไม่มีให้ใน CI
- **ข้อจำกัด Supabase 1 free project** — ผู้ใช้ยืนยันเอง (ยังไม่ได้ตรวจสอบกับ pricing page ปัจจุบัน แต่ไม่กระทบการตัดสินใจ เพราะเลือก Neon ไปแล้ว)

## Proposed Solution

ใช้ **Neon** เป็น Postgres สำหรับ production และ preview โดยเชื่อมผ่าน **Vercel Marketplace integration** ให้ Vercel inject env vars อัตโนมัติ — local dev ยังคงใช้ `docker compose up postgres` ต่อไป

เลือกแนวทางนี้เพราะ:
- **โค้ดไม่ต้อง rewrite** — ตรวจแล้วโปรเจกต์ไม่ได้ผูกกับ Supabase เลย (ไม่มี `src/lib/supabase/`, ไม่มี `@supabase/*` ใน dependencies) ต่อ Postgres ตรงผ่าน `postgres-js` + `DATABASE_URL` ซึ่ง Neon เป็น Postgres มาตรฐาน
- **ไม่ต้อง migrate ข้อมูลจริง** — เป็นโปรเจกต์ใหม่ ย้ายแค่ schema + master data → ไม่มี cutover ไม่มี downtime ไม่มีความเสี่ยงข้อมูลประชาชนหาย
- **Marketplace integration ลดการแตะ secret** — Vercel จัดการ env ให้ ไม่ต้องคัดลอก connection string ด้วยมือหลายที่

**หมายเหตุเรื่อง Neon project ที่มีอยู่เดิม (ตัดสินแล้ว):** มี Neon project ที่สร้างไว้ก่อนแล้วและ credential อยู่ใน `secrets/secret-keys.txt` แต่ **ยังว่างเปล่า ไม่เคยรัน migration** — เนื่องจาก Vercel Marketplace แบบ native จะสร้าง project ใหม่เสมอ (ผูกกับ project เดิมไม่ได้) จึงตัดสินใจ **ทิ้ง project เดิม** เพราะไม่มีข้อมูลให้เสีย และการมี 2 project คือกับดักที่ทำให้ seed ลงผิดตัว

ผลที่ตามมาซึ่งต้องจัดการ: **ค่าใน `secrets/secret-keys.txt` จะกลายเป็น credential ที่ตายแล้วแต่ยังใช้งานได้** — อันตรายกว่าไม่มีเสียอีก เพราะครั้งหน้าที่เปิดไฟล์อาจคัดลอกค่าเก่ามาใช้โดยไม่รู้ตัว → ต้องลบ Neon project เก่าที่ console และล้างค่าเก่าออกจากไฟล์ ถือเป็นงาน Must ไม่ใช่งานเก็บกวาด

## Key Hypothesis

เราเชื่อว่า **Neon serverless Postgres ที่เชื่อมผ่าน Vercel Marketplace** จะทำให้ **โปรเจกต์นี้ขึ้น production ได้โดยไม่ติดโควตา Supabase และไม่ต้องดูแล DB server เอง** สำหรับ **ทีมผู้ดูแลระบบ อบต. ที่ไม่ใช่สาย IT เต็มเวลา**

จะรู้ว่าถูกเมื่อ **ประชาชนส่งเรื่องร้องเรียนจริงผ่าน production ได้สำเร็จ 1 เคส และเจ้าหน้าที่ login เข้าไปเปลี่ยนสถานะเคสนั้นได้ โดยไม่มี connection error ใน log**

## What We're NOT Building

| ไม่ทำ | เหตุผล |
|---|---|
| ย้าย local dev ไป Neon | ผู้ใช้เลือก prod+preview เท่านั้น — local ใช้ docker ต่อ เพื่อให้ dev offline ได้และไม่กิน compute hours |
| ย้ายข้อมูลจริงจาก DB เดิม | เป็นโปรเจกต์ใหม่ ไม่มีข้อมูล production เดิม — ทำแค่ schema + master data |
| เปลี่ยน driver เป็น `@neondatabase/serverless` | `postgres-js` ผ่าน Neon pooler ใช้งานได้ปกติ การเปลี่ยน driver = เพิ่มความเสี่ยงโดยไม่มีปัญหาที่ต้องแก้ (YAGNI) |
| เปิดใช้ Row Level Security (RLS) | `docs/PRD.md` และ `docs/PRP-Plan.md` ออกแบบไว้บน Supabase RLS แต่ implementation จริงไม่ได้เดินตาม — การใส่ RLS ตอนนี้เป็นงานคนละก้อน ไม่ควรผูกกับการย้าย DB |
| เปิด integration tests ใน CI | น่าทำ (Neon branch ทำให้เป็นไปได้) แต่ไม่ใช่เงื่อนไขให้ระบบขึ้น production — แยกเป็นงานถัดไป |
| แก้ `docs/PRD.md` / `docs/PRP-Plan.md` | เป็น design doc เก่าที่ implementation ไม่ได้เดินตามอยู่แล้ว — แค่ใส่ banner ว่า superseded ก็พอ ไม่ rewrite |

## Success Metrics

| Metric | Target | How Measured | ส่งมอบใน |
|--------|--------|--------------|---------|
| **End-to-end บน production** | ส่งเคสได้ 1 เคส + เจ้าหน้าที่เปลี่ยนสถานะได้ | ทดสอบด้วยมือบน production URL หลัง deploy | Phase 4 |
| **Secret ไม่รั่ว** | 0 ครั้ง | `git log -p` + Vercel build log + CI log ไม่มี connection string; `secrets/` ยังอยู่ใน `.gitignore` | Phase 4 |
| **Build gate ทำงาน** | `pnpm build` ล้มเหลวทันทีถ้า `DATABASE_URL` รูปแบบผิด | เพิ่ม rule ใน `scripts/verify-env.ts` แล้วทดสอบด้วยค่าผิด | Phase 1 |
| **Migration journal ถูกต้อง** | `__drizzle_migrations` มี 14 แถว | query ตารางนั้นตรง ๆ หลัง `db:migrate` — พิสูจน์ว่าไม่ได้ใช้ `push` | Phase 3 |
| **Integration tests ผ่านบน Neon** | 100% ของ `*.integration.test.ts` | `pnpm vitest run` ชี้ไป Neon ผ่าน `.env.neon-provision` | Phase 3 |
| **Cold start ที่ผู้ใช้เจอ** | TBD — ต้องวัด baseline ก่อนตั้งเป้า | วัดเวลาโหลดหน้าแรกหลัง DB idle จนกว่าจะ suspend | Phase 4 |
| **Query latency (p95)** | TBD — ยังไม่มี baseline จาก docker local ให้เทียบ | Vercel Analytics / log ใน route handler | Phase 4 |

## Open Questions

- [x] ~~มี Neon project อยู่แล้วหรือยัง?~~ — **ตอบแล้ว**: มี แต่ว่างเปล่า → ตัดสินใจทิ้ง ให้ Marketplace สร้างใหม่ (ดู Decisions Log)
- [ ] 🔴 **`secrets/secret-keys.txt` มี `email=` อยู่ด้วยหรือไม่?** — ผู้ใช้ยืนยันว่าไฟล์เก็บ Neon connection string *(ยืนยันด้วยตาผู้ใช้เอง ผู้ช่วยไม่ได้เปิดอ่าน)* แต่ระหว่างทำ Phase 1 พบหลักฐานจากซอร์สโค้ดว่าไฟล์นี้ **ต้องมีบรรทัด `email=` ด้วย**:
      ```ts
      // scripts/check-superadmin.ts:7-13
      const secrets = readFileSync('secrets/secret-keys.txt', 'utf8');
      const emailMatch = secrets.match(/^email=(.+)$/m);
      if (!email) { console.error('superadmin email not found in secrets'); process.exit(1); }
      ```
      สอดคล้องกับข้อสังเกตเรื่องขนาด **55 bytes** ที่เคยตั้งไว้ — `email=<อีเมล>` พอดีกว่า connection string ที่ยาว 110–130 ตัวอักษรมาก
      **ผลกระทบ**: Phase 2 ขั้นที่ 5 เดิมเขียนว่า "ลบทั้งไฟล์ได้เลย" → **แก้เป็นลบเฉพาะบรรทัด connection string แล้ว** เพราะ `check-superadmin.ts` คือสคริปต์ที่ Phase 3 ต้องใช้
- [ ] Preview DB จะใช้ branch ต่อ PR หรือ branch กลางตัวเดียว (ยังไม่ตัดสิน — ดูตารางเทียบใน §Solution Detail)
- [ ] Neon pooler ปัจจุบันรองรับ protocol-level prepared statements หรือยัง (PgBouncer 1.21+ รองรับแล้ว) — ไม่กระทบการกระทำ (`prepare: false` ปลอดภัยทั้งสองทาง) แต่กระทบว่าจะจัดความเสี่ยงนี้เป็นอันดับ 1 หรือไม่
- [ ] โควตา free tier ของ Neon ปัจจุบัน (จำนวน branch / storage / compute hours ต่อเดือน) — **ยังไม่ยืนยัน ห้ามใช้ตัวเลขจากความจำ** ต้องเปิดหน้า pricing จริง เพราะมีผลตรงต่อการเลือก preview strategy และเรื่อง keep-warm
- [ ] Billing ผ่าน Vercel Marketplace ยังอยู่ใน free tier ของ Neon ไหม หรือกลายเป็น Vercel resource ที่คิดเงินคนละแบบ
- [ ] Neon region — มี `ap-southeast-1` (Singapore) ไหม? ถ้าไม่มี latency จากไทยจะเพิ่มขึ้นเท่าไร
- [ ] `scripts/backup.sh` ต้องใช้ `pg_dump` เวอร์ชันที่ตรงกับ Postgres ของ Neon — ต้องรู้เวอร์ชันจริงก่อน (local เป็น 17)
- [ ] จะรัน backup จากที่ไหน? Vercel serverless ไม่มี persistent FS (comment ใน `backup.sh:12` ระบุไว้แล้ว) — cron-job.org เรียก endpoint ได้ แต่ endpoint นั้นจะเก็บไฟล์ที่ไหน

---

## Users & Context

**Primary User**
- **Who**: ผู้ดูแลระบบของ Subdistrict Works — เจ้าหน้าที่ที่รับผิดชอบเว็บไซต์เพิ่มจากงานประจำ ไม่ใช่ DBA ไม่ใช่ DevOps
- **Current behavior**: ทำตาม `DEPLOY.md` ทีละขั้น คัดลอกค่าไปวางในหน้าเว็บ Vercel — ติดตั้งครั้งเดียวแล้วแทบไม่กลับมาแตะอีก
- **Trigger**: ถึงขั้นที่ 2 ของคู่มือ แล้วสมัคร Supabase ไม่ได้เพราะโควตาเต็ม → ค้างทั้งกระบวนการ
- **Success state**: เว็บขึ้นจริง ประชาชนส่งเรื่องได้ เจ้าหน้าที่เปิด dashboard เห็นเคส — และไม่ต้องมานั่งดูแล database อีก

**ผู้ใช้ปลายทางที่ได้รับผลกระทบทางอ้อม**
- ประชาชนในตำบลเดโม ที่จะส่งเรื่องร้องเรียนผ่านเว็บหรือ LINE — **ไม่รู้จักคำว่า Neon และไม่ควรต้องรู้** สิ่งเดียวที่รู้สึกได้คือหน้าเว็บโหลดเร็วหรือช้า (ประเด็น cold start)

**Job to Be Done**
เมื่อ **ผมพร้อม deploy ระบบร้องเรียนขึ้นใช้จริงแต่สมัคร Supabase เพิ่มไม่ได้** ผมอยาก **มีฐานข้อมูล Postgres ที่ต่อกับ Vercel ได้ทันทีโดยไม่ต้องดูแล server** เพื่อที่ **ประชาชนจะเริ่มส่งเรื่องร้องเรียนได้จริงเสียที**

**Non-Users**
- ทีม DBA / คนที่อยากปรับจูน Postgres ระดับลึก — ระบบนี้จงใจเลือก managed service เพื่อ *ไม่* ต้องมีคนแบบนั้น
- โปรเจกต์อื่นที่ใช้ Supabase free slot อยู่ — ไม่แตะ ไม่ย้าย ไม่เกี่ยวกัน

**Constraints**
- **Secret**: `secrets/secret-keys.txt` — ผู้ช่วย AI **ห้ามเปิดอ่าน ห้ามพิมพ์ลงแชท ห้ามส่งออกนอกเครื่อง** การคัดลอกค่าใด ๆ เป็นหน้าที่ผู้ใช้เท่านั้น (แต่ด้วย `vercel env pull` แผนนี้ออกแบบให้**ไม่ต้องคัดลอกเลยแม้แต่ครั้งเดียว** — ดู §Secret Handling Protocol)
- **งบประมาณ**: หน่วยงานราชการท้องถิ่น — ต้องอยู่ใน free tier ให้ได้ หรือถ้าเกินต้องรู้ล่วงหน้า
- **ทักษะผู้ดูแล**: ทุกขั้นตอนต้องอธิบายเป็นภาษาไทยแบบมือใหม่ทำตามได้ (มาตรฐานเดียวกับ `DEPLOY.md` เดิม)
- **PDPA**: ข้อมูลประชาชน (เลขบัตร, ชื่อ, เบอร์โทร, ตำแหน่งที่แจ้ง) อยู่ใน DB นี้ — backup และ access control ห้ามหย่อนกว่าเดิม

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| **Must** | แก้ `postgres-js` ให้ `prepare: false` + จูน pool | `src/lib/db/index.ts:27` ตั้ง `prepare: true` ซึ่งเป็นค่าที่**เสี่ยงพัง**บน pooled endpoint แบบ transaction mode — `prepare: false` เป็นค่าที่ปลอดภัยเสมอ ไม่ว่า pooler จะรองรับหรือไม่ (ดูหมายเหตุความไม่แน่นอนใน §Technical Risks) |
| **Must** | รองรับ 2 connection string (pooled + direct) | Neon แยก endpoint: app ใช้ pooled, DDL (`drizzle-kit migrate/generate`) และ `pg_dump` ต้องใช้ direct — `drizzle.config.ts:21` ตอนนี้ใช้ตัวเดียว |
| **Must** | ติดตั้ง Neon ผ่าน Vercel Marketplace + verify env | Vercel inject env ให้ทั้ง Production และ Preview scope เอง — ตัดขั้นตอน copy-paste connection string ออกทั้งหมด ซึ่งเป็นขั้นที่ผิดพลาดง่ายที่สุดสำหรับผู้ดูแลที่ไม่ใช่สาย IT และเป็นจุดที่ secret มีโอกาสรั่วมากที่สุด |
| **Must** | สร้าง schema + master data บน Neon | 14 migrations + `db:seed`, `db:seed-geodata`, `db:seed-faq`, `check-superadmin` |
| **Must** | เพิ่ม `db:migrate` script + เลิกใช้ `db:push` กับ production | `package.json:25-29` มีแค่ `db:push` — โปรเจกต์นี้**ยังไม่เคยมีเส้นทาง migration ที่ถูกต้องสำหรับ production** `push` sync DDL จาก `schema.ts` โดยไม่อ่านไฟล์ migration และไม่เขียน `__drizzle_migrations` journal → data migration แบบ `0013` จะถูกข้ามเงียบ ๆ |
| **Must** | Redact connection string ใน output ทุกช่องทาง | error ของ `postgres-js`/`drizzle-kit` มักพ่น connection string เต็ม ๆ ลง log — Vercel build log และ CI log เห็นได้ |
| **Must** | ลบ Neon project เก่า + ล้าง credential ที่ตายแล้ว | หลังสร้าง project ใหม่ผ่าน Marketplace ค่าเดิมใน `secrets/secret-keys.txt` ยังใช้ล็อกอินได้อยู่แต่ชี้ไป DB ที่ไม่ใช้ — เป็น stale credential ที่ทั้งเสี่ยงและทำให้หยิบผิดตัว |
| **Should** | `verify-env.ts` ตรวจ `DATABASE_URL` | ตอนนี้**ไม่ตรวจเลย** ทั้งที่รันใน `pnpm build` — ใส่ URL ผิดชนิด (direct แทน pooled) จะไปพังตอน runtime แทนที่จะพังตอน build |
| **Should** | Preview branch strategy | ผู้ใช้เลือก scope prod+preview — ต้องมีคำตอบว่า preview ต่อ DB ตัวไหน ไม่ให้ไปแตะ prod |
| **Should** | Backup + rollback path | PDPA — ข้อมูลประชาชนห้ามหาย; `scripts/backup.sh` มีอยู่แล้วแต่ยังไม่เคยทดสอบกับ Neon |
| **Should** | เขียน `DEPLOY.md` ขั้นตอน Neon ใหม่ | เป็นสิ่งที่ผู้ใช้จริงเห็น แต่ผู้ใช้เลือกให้ทำ **หลัง** โค้ดเสร็จ |
| **Could** | เปิด integration tests ใน CI ผ่าน Neon branch | ปลดล็อกได้ฟรี ๆ เมื่อมี Neon แล้ว — แต่ไม่ใช่เงื่อนไขขึ้น production |
| **Should** | วัด cold start จริง แล้วตัดสินเรื่อง keep-warm | cold start ประเมินไว้ว่าเสี่ยง**สูง**และกระทบประชาชนโดยตรง — ปล่อยเป็น "ทำก็ได้" ไม่สมเหตุสมผล **สิ่งที่เป็น Should คือการวัด** ส่วนจะ keep-warm หรือไม่ค่อยตัดสินจากตัวเลข (มี `/api/cron/*` + cron-job.org รออยู่แล้ว แต่แลกกับ compute hours) |
| **Won't** | เปลี่ยนไป `@neondatabase/serverless` | ไม่มีปัญหาที่ต้องแก้ |
| **Won't** | RLS / เปลี่ยน auth model | คนละก้อนงาน |
| **Won't** | ย้าย local dev ไป Neon | ผู้ใช้ตัดสินแล้ว |

### MVP Scope

**สิ่งที่ต้องมีเพื่อพิสูจน์ hypothesis:**

1. `prepare: false` + dual URL + verify-env gate (โค้ด)
2. Neon project ต่อกับ Vercel เรียบร้อย env ครบ
3. 14 migrations + master data อยู่บน Neon (ผ่าน `drizzle-kit migrate` เท่านั้น)
4. Deploy production แล้วส่งเคสจริงได้ 1 เคส + เจ้าหน้าที่เปลี่ยนสถานะเคสนั้นได้

ทุกอย่างนอกจากนี้ (preview branch, backup, เอกสาร) คือการทำให้ **ยั่งยืน** ไม่ใช่การพิสูจน์ว่า **ใช้ได้** — แต่ผู้ใช้เลือก "ทั้งหมดข้างต้น" เป็น definition of done จึงยังอยู่ในขอบเขตงาน แค่อยู่คนละ phase

### Preview DB — ตารางเทียบ (ยังไม่ตัดสิน)

| | **Branch ต่อ PR อัตโนมัติ** | **Branch กลางตัวเดียว** |
|---|---|---|
| **ทดสอบ migration** | ได้จริง — แต่ละ PR รัน migration บน copy ของ main แยกกัน เจอ conflict ก่อน merge | PR หลายตัวที่มี migration จะเหยียบกัน คนที่ merge ทีหลังเจอ schema แปลก ๆ |
| **แยกข้อมูล** | สมบูรณ์ — PR A ลบข้อมูลไม่กระทบ PR B | ไม่มี — ใครก็เขียนทับกันได้ |
| **โควตา** | กิน branch + compute ตามจำนวน PR ที่เปิดค้าง | คงที่ 1 branch |
| **ความซับซ้อน** | เปิด toggle ในหน้า integration (ถ้ามี) หรือใช้ GitHub Action `neondatabase/create-branch-action` | ตั้ง env `DATABASE_URL` ของ Preview scope ใน Vercel ครั้งเดียว จบ |
| **ค่าใช้จ่ายทางความคิดของผู้ดูแล อบต.** | สูง — มี branch เกิด/ดับตลอด งงได้ว่าตัวไหนคือของจริง | ต่ำ — มี main กับ preview แค่ 2 ตัว |
| **เสี่ยงไปแตะ prod** | ต่ำ | ต่ำ (ถ้าตั้ง env ถูก) |

**ข้อเสนอ:** เริ่มที่ **branch กลางตัวเดียว** ก่อน เพราะ (ก) โปรเจกต์นี้ไม่ได้มี PR พร้อมกันหลายสิบตัว — ดูจาก git history เป็นการพัฒนาแบบทีละ PR ต่อเนื่อง (ข) ยังไม่รู้โควตา free tier (ค) ผู้ดูแลปลายทางไม่ใช่สาย IT ความเรียบง่ายมีค่า — แล้วค่อยยกระดับเป็น branch ต่อ PR เมื่อเริ่มมี migration ชนกันจริง **ตัดสินใจขั้นสุดท้ายหลังตรวจโควตา free tier ใน Phase 2**

### User Flow (critical path)

```
ผู้ดูแล อบต.
  → Vercel Dashboard → Storage/Integrations → เลือก Neon → Create (เลือก region ให้ใกล้ไทยที่สุด)
  → Vercel inject connection string ทั้ง pooled + unpooled ให้อัตโนมัติ
  → (ครั้งเดียว) `pnpm dlx vercel env pull .env.neon-provision`   ← ไฟล์แยก ห้ามทับ .env.local
  → `pnpm db:migrate` + seed โดยชี้ env ไปที่ไฟล์นั้นเฉพาะกิจ
  → ลบ .env.neon-provision ทิ้งเมื่อเสร็จ
  → Redeploy
  → เปิดเว็บ ส่งเรื่องทดสอบ 1 เคส → login เจ้าหน้าที่ → เปลี่ยนสถานะ → ผ่าน
  → ลบ Neon project เก่าที่ console + ล้างค่าเก่าออกจาก secrets/secret-keys.txt
```

**จุดที่ผู้ดูแลต้องแตะ secret ด้วยมือ: ไม่มีเลย** — `vercel env pull` ดึงค่าจาก Vercel ลงเครื่องโดยตรง ไม่ต้องเปิดไฟล์ secret ไม่ต้อง copy-paste

### ⚠️ ห้าม pull ลง `.env.local` เด็ดขาด

`.env.local` คือที่อยู่ของ `DATABASE_URL` สำหรับ **docker local dev** (`.env.local.example:20`) การ pull ทับจะสร้างปัญหา 2 ชั้น:

1. **ระหว่างที่ไฟล์ยังอยู่** — `pnpm dev` บนเครื่องจะชี้ไป **production DB** โดยไม่มีอะไรเตือน นี่คือทางที่ข้อมูลทดสอบไหลลง prod จริง
2. **หลังลบไฟล์** — local dev ไม่เหลือ config เลย ต้องตั้งใหม่จาก `.env.local.example`

จึงใช้ชื่อไฟล์แยก `.env.neon-provision` ซึ่ง `.gitignore:10` (`.env.*`) ยังคุ้มอยู่ ✅ และไม่ชนกับอะไรทั้งสิ้น

ข้อควรระวังอื่น:
- `vercel env pull` ดึง env **ทั้งหมด** ของ scope นั้นลงมาเป็น plaintext (รวม `AUTH_SECRET`, S3 keys ไม่ใช่แค่ DB) — ลบทิ้งทันทีที่เสร็จ
- Vercel CLI ไม่ได้อยู่ใน `package.json` — ใช้ `pnpm dlx vercel` ได้เลย ไม่ต้องเพิ่ม dependency

---

## Technical Approach

**Feasibility: HIGH**

เหตุผลที่มั่นใจ — ตรวจโค้ดจริงแล้วพบว่า:

| ตรวจอะไร | ผล | ความหมาย |
|---|---|---|
| `src/lib/supabase/` | ไม่มีอยู่จริง | ไม่มี vendor lock-in ให้ถอด |
| `@supabase/*` ใน `package.json` | ไม่มีสักตัว | dependencies ไม่ต้องแตะ |
| `CREATE EXTENSION` ใน `drizzle/*.sql` | **0 ผลลัพธ์** | ไม่มี PostGIS/pgcrypto/extension พิเศษที่ Neon อาจไม่รองรับ |
| `0006_add_geography_fk.sql` | เป็นแค่ FK ของ provinces/districts/sub_districts | "geography" = เขตปกครองไทย ไม่ใช่ PostGIS — เข้าใจผิดได้ง่าย แต่เช็กแล้ว |
| Data layer | `postgres-js` + Drizzle ต่อตรงผ่าน `DATABASE_URL` | Neon = Postgres มาตรฐาน ใช้ได้ทันที |

**Supabase ปรากฏเฉพาะในเอกสาร** ได้แก่ `.env.example:32`, `DEPLOY.md` (7 จุด), `docs/PRD.md`, `docs/PRP-Plan.md` และ **eslint rule C3** (`eslint.config.mjs:41-43`) ที่บล็อก import `@/lib/supabase/admin` — ไฟล์ที่ **ไม่มีอยู่จริง** จึงเป็น rule ที่ป้องกันสิ่งที่ไม่มีทางเกิด ควรลบทิ้ง

### Architecture Notes

- **Connection string 2 ตัว**
  - `DATABASE_URL` → pooled endpoint (`...-pooler...`) สำหรับ Next.js runtime — Vercel serverless สร้าง instance เยอะ ต้องผ่าน pooler
  - `DATABASE_URL_UNPOOLED` → direct endpoint สำหรับ `drizzle-kit migrate` และ `pg_dump` ซึ่งต้องการ session-level features
  - **ชื่อตัวแปรเป็นสิ่งที่ integration กำหนด ไม่ใช่สิ่งที่เราตั้ง** — `DATABASE_URL_UNPOOLED` เป็นชื่อที่คาดว่าจะเจอ แต่ต้องยืนยันจากหน้า Vercel จริงใน Phase 2 แล้วค่อยฮาร์ดโค้ดชื่อลง `drizzle.config.ts`
  - `drizzle.config.ts` ต้องอ่านตัว unpooled ก่อน แล้ว fallback เป็น `DATABASE_URL`
- **`prepare: false` บังคับ** ที่ `src/lib/db/index.ts:27` — PgBouncer transaction mode ไม่ผูก connection กับ session จึงใช้ prepared statement ข้าม transaction ไม่ได้
- **ลด `max` จาก 10** — บน serverless แต่ละ instance ไม่ควรถือหลาย connection เพราะ pooler จัดการให้อยู่แล้ว การถือ 10 ต่อ instance ทำให้ชน connection limit เร็วโดยไม่จำเป็น
- **`sslmode=require`** — Neon บังคับ TLS; `postgres-js` อ่านจาก connection string ได้ (comment ที่ `index.ts:26` ระบุว่า "ssl ตาม connection string" อยู่แล้ว — ถูกต้อง)
- **`scripts/backup.sh` ใช้ `--no-owner --no-privileges` อยู่แล้ว** (`backup.sh:39-40`) ซึ่งจำเป็นพอดีสำหรับ managed Postgres ที่ role ต่างกัน — ไม่ต้องแก้ส่วนนี้

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **`prepare: true` ทำให้ query พังบน pooler** | **ปานกลาง–สูง — ยังไม่ยืนยัน** | ถ้าเกิด ระบบใช้ไม่ได้เลย | แก้เป็น `prepare: false` ใน Phase 1 + integration test ยืนยัน<br>**หมายเหตุความไม่แน่นอน**: PgBouncer 1.21+ รองรับ protocol-level prepared statements แล้ว และ Neon pooler อาจเปิดใช้อยู่ — **ยังไม่ได้ตรวจกับ Neon docs ปัจจุบัน** จึงไม่เคลมว่า "พังแน่นอน" แต่ `prepare: false` เป็นค่าที่ปลอดภัยทั้งสองทาง จึงยังทำอยู่ดี |
| **ใช้ `drizzle-kit push` แทน `migrate` บน production** | **สูง** (ปัจจุบัน `package.json` มีแค่ `db:push` ให้ใช้) | DB ไม่มี migration journal → migration ตัวถัดไปรันบน prod ที่มีข้อมูลประชาชนโดยไม่มีหลักยึด และ data migration แบบ `0013` (PDPA backfill) ถูกข้ามเงียบ ๆ | เพิ่ม `db:migrate` ใน Phase 1; Phase 3 ใช้ `migrate` เท่านั้น; success signal ตรวจว่า `__drizzle_migrations` มี 14 แถว |
| **`vercel env pull` ทับ `.env.local`** | **สูง** ถ้าไม่ระบุชื่อไฟล์ให้ชัด | `pnpm dev` บนเครื่องชี้ไป production DB เงียบ ๆ → ข้อมูลทดสอบไหลลง prod จริง; พอลบไฟล์ทิ้ง local dev ก็ไม่เหลือ config | บังคับใช้ชื่อ `.env.neon-provision` ทุกที่ใน PRD; ระบุใน Secret Protocol ข้อ 6 ว่าห้าม pull ลง `.env.local` |
| **Connection string รั่วออก log** | ปานกลาง | รหัสผ่าน DB หลุด → ข้อมูลประชาชนเสี่ยง (PDPA) | ห่อ error ทุกจุดด้วย redact helper; ตรวจ Vercel build log + CI log ด้วยตาก่อนปิดงาน; ถ้ารั่วให้ rotate password ที่ Neon ทันที |
| **Cold start จาก scale-to-zero** | **สูง** | ประชาชนคนแรกของวันเจอหน้าเว็บช้า — เป็นระบบราชการที่ traffic น้อยและกระจาย จึง idle บ่อย | วัด baseline จริงก่อน; ถ้าเกินรับได้ ใช้ cron ping ผ่าน `/api/cron/*` ที่มีอยู่ **แต่แลกกับ compute hours** ต้องดูโควตาก่อน |
| **Stale credential ในไฟล์ secret** — ค่าของ Neon project เก่าที่ทิ้งแล้วยังอยู่ใน `secrets/secret-keys.txt` และยังใช้ล็อกอินได้ | **สูง** (จะเกิดแน่ถ้าไม่ล้าง) | ครั้งหน้าหยิบค่าเก่ามาใช้ → seed/backup ลงผิด DB โดยไม่รู้ตัว; credential ที่ไม่มีใครเฝ้าคือช่องโหว่ | ลบ Neon project เก่าที่ console **ก่อน** แล้วค่อยล้างค่าออกจากไฟล์ (ลบที่ต้นทางก่อน ค่าที่หลงเหลือจะใช้ไม่ได้แม้หลุด) — เป็นงาน Must ใน Phase 2 |
| **`pg_dump` เวอร์ชันไม่ตรงกับ Neon** | ปานกลาง | backup ล้มเหลวเงียบ ๆ → PDPA เสี่ยง | เช็ก `SELECT version()` บน Neon ก่อน; ทดสอบ backup **และ restore** จริง 1 รอบ ไม่ใช่แค่ dump ผ่าน |
| **Free tier ไม่พอ / billing เปลี่ยนเมื่อผ่าน Vercel Marketplace** | ปานกลาง | หน่วยงานโดนเรียกเก็บเงินโดยไม่ตั้งใจ | ยืนยันโควตาและ billing model จากหน้าจริงก่อน Phase 2 |
| **Latency จากไทยสูงถ้าไม่มี region ใกล้** | ต่ำ–ปานกลาง | หน้าเว็บช้าทุก request | เลือก region ที่ใกล้ที่สุดตอนสร้าง project — **ย้าย region ทีหลังไม่ได้ง่าย ๆ ต้องเลือกให้ถูกครั้งเดียว** |

### Secret Handling Protocol (ข้อบังคับ ไม่ใช่ข้อแนะนำ)

1. `secrets/secret-keys.txt` — **ผู้ช่วย AI ไม่เปิดอ่านไฟล์นี้** ตลอดทั้งงาน
2. ไม่มีการพิมพ์/echo/print connection string ลงแชท, log, commit message, หรือ PR body
3. ไม่ส่งค่าไปยังบริการภายนอกใด ๆ
4. **ค่า secret ไหลทางเดียว: Vercel → เครื่อง ผ่าน `vercel env pull` เท่านั้น** ไม่มีการ copy-paste ด้วยมือในแผนนี้ — ถ้าเจอขั้นตอนไหนที่ต้องคัดลอกเอง แปลว่าแผนผิด ให้กลับมาแก้แผน ไม่ใช่คัดลอก
5. `secrets/` ต้องอยู่ใน `.gitignore` ตลอด — **ตรวจแล้วอยู่จริงที่ `.gitignore:7`** ✅
6. `.env.neon-provision` ที่ได้จาก `vercel env pull` ถือเป็น secret เต็มรูปแบบ — `.gitignore:10` (`.env.*`) ครอบคลุมแล้ว ✅ และต้องลบทิ้งเมื่อเสร็จงาน Phase 3
   **ห้าม pull ลง `.env.local`** — จะทับ config docker local dev และทำให้ `pnpm dev` ชี้ไป production DB เงียบ ๆ
7. คำสั่งที่อาจพ่น connection string (`drizzle-kit push`, `pg_dump`, error ของ `postgres-js`) ต้องผ่าน redact ก่อนแสดงผล
8. **Credential ที่เลิกใช้ต้องถูกทำลายที่ต้นทาง ไม่ใช่แค่ลบออกจากไฟล์** — ลบ Neon project เก่าที่ console ก่อน แล้วค่อยล้างไฟล์ ลำดับนี้สำคัญ
9. ถ้าสงสัยว่ารั่วแม้เพียงเล็กน้อย → rotate password ที่ Neon console ทันที ไม่ต้องรอยืนยัน

---

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Driver & config hardening | `prepare:false`, จูน pool, dual URL, **`db:migrate` script**, verify-env gate, redact helper, **+3 สคริปต์ที่สร้าง client เอง** | **✅ complete** | with 2 | - | [แผน](../plans/completed/neon-driver-config-hardening.plan.md) · [รายงาน](../reports/neon-driver-config-hardening-report.md) |
| 2 | Provision Neon + Vercel | ติดตั้ง Marketplace integration (สร้าง project ใหม่), ตรวจ env, **ลบ project เก่า + ล้าง stale credential** | pending | with 1 | - | - |
| 3 | Schema + master data | `vercel env pull` (ไฟล์แยก) → `db:migrate` 14 migrations → seed geodata/categories/FAQ/superadmin | pending | - | 1, 2 | - |
| 4 | Production cutover & verify | Redeploy, ทดสอบ end-to-end, ตรวจ log ว่าไม่มี secret รั่ว | pending | - | 3 | - |
| 5 | Preview branch | ตัดสิน strategy จากโควตาจริง แล้วตั้งค่า Preview env | pending | with 6 | 4 | - |
| 6 | Backup & rollback | ทดสอบ `backup.sh` + **restore จริง** กับ Neon, เขียนขั้นตอน rollback | pending | with 5 | 4 | - |
| 7 | เอกสาร & ล้างของเก่า | เขียน `DEPLOY.md` ขั้น Neon, แก้ `.env.example`, ลบ eslint rule C3, ใส่ banner ใน design doc เก่า | pending | - | 5, 6 | - |

### Phase Details

**Phase 1: Driver & config hardening**
- **Goal**: ทำให้โค้ดพร้อมต่อ Neon **ก่อน** จะมี Neon จริง — ทดสอบกับ docker local ได้ทั้งหมด
- **Scope**: `src/lib/db/index.ts` (`prepare:false` + pool), `drizzle.config.ts` (dual URL), `scripts/verify-env.ts` (ตรวจ `DATABASE_URL`), **เพิ่ม `"db:migrate": "drizzle-kit migrate"` ใน `package.json`**, redact helper + unit tests
  **+ พบระหว่างวางแผน**: มีอีก **3 สคริปต์ที่สร้าง `postgres()` client เองด้วย option default** — `scripts/check-line-db.ts:6`, `scripts/check-superadmin.ts:16`, `scripts/seed-faq.ts:8` โดย **2 ใน 3 คือสคริปต์ที่ Phase 3 ต้องรันกับ Neon** จึงต้องแก้ในเฟสนี้ด้วย ไม่งั้นแก้ `index.ts` ไปก็ยังพังอยู่ดี → แยก option ออกเป็น `src/lib/db/pg-options.ts` ใช้ร่วมกันทั้ง 4 จุด
- **Success signal**: `pnpm typecheck && pnpm test` ผ่าน; `pnpm build` **ล้มเหลว** เมื่อป้อน `DATABASE_URL` รูปแบบผิด (พิสูจน์ว่า gate ทำงาน); `pnpm db:migrate` รันกับ docker postgres เปล่าได้ครบ 14 migrations และ `__drizzle_migrations` มี 14 แถว

**Phase 2: Provision Neon + Vercel** *(ผู้ใช้ลงมือเอง — ผู้ช่วยเขียนขั้นตอนให้)*
- **Goal**: มี Neon project **ตัวเดียว** ที่ต่อกับ Vercel และ env ครบ — และของเก่าถูกทำลายเรียบร้อย
- **Scope**:
  1. เช็ก billing + โควตา free tier ในหน้า Marketplace **ก่อนกด Create** (Open Question: *โควตา free tier* และ *billing ผ่าน Marketplace*)
  2. ติดตั้ง Neon จาก Vercel Marketplace → **เลือก region ให้ใกล้ไทยที่สุด (เลือกผิดแล้วย้ายทีหลังยาก)**
  3. **จดชื่อตัวแปรที่ Vercel inject จริง** (คาดว่า `DATABASE_URL` + `DATABASE_URL_UNPOOLED` แต่ต้องดูของจริง) และยืนยันว่ามีครบทั้ง Production และ Preview scope → เอาชื่อนี้ไปใส่ `drizzle.config.ts`
  4. **ลบ Neon project เก่าที่ Neon console** (ยืนยันอีกครั้งว่าว่างเปล่าก่อนลบ)
  5. **ล้างเฉพาะบรรทัด connection string ออกจาก `secrets/secret-keys.txt`** — ผู้ใช้ทำเอง ผู้ช่วยไม่แตะไฟล์
     🔴 **ห้ามลบทั้งไฟล์** — พบระหว่างทำ Phase 1 ว่า `scripts/check-superadmin.ts:7-13` `readFileSync` ไฟล์นี้และ match `/^email=(.+)$/m` ถ้าไม่เจอจะ `process.exit(1)` ทันที ซึ่งเป็นสคริปต์ที่ **Phase 3 ขั้นที่ 4 ต้องใช้ยืนยัน superadmin พอดี** (ดู Open Question ด้านบน)
- **Success signal**: Vercel → Settings → Environment Variables มีตัวแปร connection string ครบทั้ง 2 scope และรู้ชื่อที่แน่นอนแล้ว; Neon console เหลือ project เดียว; ตอบ Open Question เรื่อง *โควตา*, *billing*, *region* ได้หมด
- **⚠️ ลำดับสำคัญ**: ลบ project เก่า **ก่อน** ล้างไฟล์ — ถ้าล้างไฟล์ก่อนแล้วลืมลบ project จะเหลือ DB ที่ไม่มีใครดูแลและไม่มีใครรู้ว่ามีอยู่

**Phase 3: Schema + master data**
- **Goal**: Neon มีตารางครบ มีข้อมูลอ้างอิงพร้อมใช้ และ **มี migration journal ที่ถูกต้องตั้งแต่วันแรก**
- **Scope**:
  1. `pnpm dlx vercel env pull .env.neon-provision` — **ไฟล์แยก ห้ามทับ `.env.local`**
  2. `pnpm db:migrate` (script ที่เพิ่มใน Phase 1) ชี้ direct URL — **ห้ามใช้ `db:push`**
  3. `db:seed-geodata` (จังหวัด/อำเภอ/ตำบล/หมู่บ้าน) → `db:seed` → `seed-faq`
  4. สร้าง superadmin แล้วยืนยันด้วย `check-superadmin`
  5. รัน integration tests ชี้ไป Neon 1 รอบ (ส่งมอบ metric *Integration tests ผ่านบน Neon*)
  6. **ลบ `.env.neon-provision` ทิ้ง**
- **Success signal**: นับจำนวนตารางตรงกับ schema; **ตาราง `__drizzle_migrations` มี 14 แถว** (พิสูจน์ว่าใช้ `migrate` ไม่ใช่ `push`); query จังหวัด/อำเภอ/ตำบลผ่าน `/api/provinces` ได้ข้อมูลจริง; `*.integration.test.ts` ผ่านหมด; **ไม่มี connection string โผล่ใน terminal output**; `.env.neon-provision` ไม่หลงเหลือ และ `.env.local` **ไม่ถูกแตะเลย**

> **ทำไมต้อง `migrate` ไม่ใช่ `push`** — `push` diff `schema.ts` กับ DB แล้ว sync DDL ตรง ๆ โดยไม่อ่านไฟล์ migration และไม่เขียน journal
> บน DB เปล่า schema ที่ได้จะเหมือนกัน (UPDATE ใน `0013` ไม่มีแถวให้แตะ) — แต่ DB จะ**ไม่มีประวัติว่ารัน migration ไหนไปแล้ว** ทำให้ migration ตัวถัดไปในอนาคตต้องรันบน prod ที่มีข้อมูลประชาชนจริงโดยไม่มีหลักยึด
> และถ้าตอนนั้นยังใช้ `push` อยู่ **data migration แบบ `0013` จะถูกข้ามเงียบ ๆ** — ซึ่งเป็น migration ประเภทที่ commit `d6eaff0` เพิ่งใช้ปิดช่องรั่ว PDPA ไปหมาด ๆ

**Phase 4: Production cutover & verify**
- **Goal**: พิสูจน์ hypothesis
- **Scope**: Redeploy → ส่งเรื่องร้องเรียนจริง 1 เคสผ่านหน้าเว็บ → เจ้าหน้าที่ login เปลี่ยนสถานะ → ตรวจ LINE flow ถ้าตั้งค่าไว้ → ไล่อ่าน Vercel runtime log และ build log หา secret ที่หลุด
- **Success signal**: เคสจบ lifecycle ได้จริง; log สะอาด; ไม่มี `prepared statement` error

**Phase 5: Preview branch**
- **Goal**: PR ใหม่ทดสอบได้โดยไม่แตะ prod
- **Scope**: ตัดสิน strategy จากโควตาที่รู้แล้วใน Phase 2 → ตั้งค่า → เปิด PR ทดสอบ 1 ตัวเพื่อยืนยัน
- **Success signal**: preview deployment ของ PR ทดสอบเขียนข้อมูลได้ และข้อมูลนั้น**ไม่ปรากฏใน prod**

**Phase 6: Backup & rollback**
- **Goal**: ข้อมูลประชาชนกู้คืนได้จริง ไม่ใช่แค่ "มีสคริปต์ backup"
- **Scope**: รัน `backup.sh` กับ Neon → **restore ไฟล์นั้นเข้า branch เปล่าแล้วตรวจว่าข้อมูลครบ** → ตัดสินว่ารัน backup จากที่ไหน (Open Question เรื่อง *ที่รัน backup*) → เขียนขั้นตอน rollback กลับ docker/ผู้ให้บริการอื่น
- **Success signal**: restore สำเร็จและนับ row ตรงกับต้นทาง — dump ผ่านอย่างเดียวไม่นับ; มีคำตอบเป็นลายลักษณ์อักษรว่า backup รันจากที่ไหนและไฟล์ไปอยู่ที่ไหน

**Phase 7: เอกสาร & ล้างของเก่า**
- **Goal**: ผู้ดูแล อบต. คนถัดไปทำตามคู่มือได้โดยไม่เจอ Supabase ให้สับสน
- **Scope**: เขียน `DEPLOY.md` "ขั้นที่ 2: สร้างฐานข้อมูล Neon" ใหม่ทั้งขั้น + แก้อีก 6 จุดที่อ้างถึง; `.env.example:26-32`; `.env.local.example:17-20` (เพิ่มหมายเหตุ); ลบ eslint rule C3 ที่ `eslint.config.mjs:41-43`; ใส่ banner "superseded" ใน `docs/PRD.md` และ `docs/PRP-Plan.md`
- **Success signal**: `grep -ri supabase` เหลือเฉพาะใน design doc เก่าที่มี banner กำกับ; มีคนอ่าน `DEPLOY.md` แล้วทำตามได้โดยไม่ต้องถาม

### Parallelism Notes

- **Phase 1 ‖ 2** — Phase 1 เป็นงานโค้ดล้วนที่ทดสอบกับ docker local ได้ ไม่ต้องรอ Neon; Phase 2 เป็นงานหน้าเว็บที่ผู้ใช้ทำเอง ทั้งสองไม่แตะไฟล์เดียวกัน
- **Phase 3 → 4** ต้องเรียงกัน — ไม่มีข้อมูลก็ทดสอบ end-to-end ไม่ได้
- **Phase 5 ‖ 6** — preview branch กับ backup แตะคนละส่วน (Vercel env กับ shell script) และทั้งคู่ต้องรอ prod นิ่งก่อน
- **Phase 7 ปิดท้าย** ตามที่ผู้ใช้เลือก ("โค้ดก่อน เอกสารทีหลัง") — และมีเหตุผลเชิงเทคนิคด้วย: เอกสารควรสะท้อนสิ่งที่ทำจริงแล้ว ไม่ใช่สิ่งที่ตั้งใจจะทำ

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| ผู้ให้บริการ DB | Neon | Supabase, Railway, Fly Postgres, self-host ต่อ | Supabase ติดโควตา free project; Neon เป็น Postgres มาตรฐาน + มี native integration กับ Vercel + branching |
| ขอบเขต environment | Production + Preview | prod อย่างเดียว, ทุก env รวม local | prod อย่างเดียวเสี่ยง dev/prod drift; ทุก env ทำให้ dev ต้องออนไลน์และกิน compute hours |
| ข้อมูลที่ย้าย | schema + master data | ย้ายข้อมูลจริงทั้งหมด, schema เปล่า | เป็นโปรเจกต์ใหม่ ไม่มีข้อมูล production เดิม; master data (เขตปกครอง/หมวดหมู่/FAQ) จำเป็นต่อการใช้งานวันแรก |
| วิธีเชื่อม Vercel | Marketplace integration | ตั้ง env เอง, ผูก Neon account เดิมแบบ OAuth | ลดจำนวนครั้งที่ต้องแตะ secret ด้วยมือ + จัดการ preview env ให้ |
| Neon project ที่มีอยู่เดิม | **ทิ้ง** ให้ Marketplace สร้างใหม่ | เก็บของเดิมแล้วผูกเข้า Vercel, ตั้ง env เอง | project เดิมยังว่างเปล่า — ไม่มีข้อมูลให้เสีย; Marketplace แบบ native ผูก project ที่มีอยู่ไม่ได้ จะกลายเป็น 2 project ซึ่งเป็นกับดักที่ทำให้ seed ลงผิดตัว |
| การดึง env มาที่เครื่อง | `vercel env pull` | คัดลอกจาก `secrets/secret-keys.txt` ด้วยมือ | ทำให้ไม่ต้องเปิดไฟล์ secret เลยแม้แต่ครั้งเดียว — ตรงกับข้อบังคับที่ผู้ใช้ตั้งไว้พอดี |
| Driver | คง `postgres-js` | `@neondatabase/serverless`, `node-postgres` | ไม่มีปัญหาที่ต้องแก้ — เปลี่ยน driver = ความเสี่ยงเปล่า (YAGNI) |
| การจัดการ secret | ผู้ช่วยไม่แตะไฟล์ + ค่าไหลผ่าน `vercel env pull` เท่านั้น | ให้สคริปต์อ่านไฟล์ตอนรัน, ผู้ใช้ copy-paste เอง | ผู้ใช้เลือกให้ผู้ช่วยไม่แตะไฟล์ — และ `vercel env pull` ทำให้ไม่ต้อง copy-paste เลยแม้แต่ครั้งเดียว ได้ทั้งความปลอดภัยและความสะดวก |
| ไฟล์ปลายทางของ `env pull` | `.env.neon-provision` | `.env.local` | pull ลง `.env.local` จะทับ config docker local dev → `pnpm dev` ชี้ไป prod DB เงียบ ๆ และพอลบไฟล์ทิ้ง local dev ก็ไม่เหลือ config |
| วิธีสร้าง schema บน prod | `drizzle-kit migrate` | `drizzle-kit push`, รันไฟล์ SQL ด้วยมือ | `push` ไม่เขียน `__drizzle_migrations` journal และข้าม data migration แบบ `0013` — วางรากฐานผิดตั้งแต่วันแรกแล้วเจ็บตอน migration ตัวถัดไปบน prod ที่มีข้อมูลจริง |
| Preview DB | **ยังไม่ตัดสิน** — เอนไปทาง branch กลาง | branch ต่อ PR | รอข้อมูลโควตา free tier จริงก่อน (Phase 2) |
| ลำดับงาน | โค้ด → provision → data → verify → เอกสาร | เอกสารไปพร้อมโค้ด | ผู้ใช้เลือก; และเอกสารควรบันทึกสิ่งที่ทำจริง ไม่ใช่สิ่งที่วางแผน |

---

## Research Summary

**Market / Platform Context**

- Neon เป็น serverless Postgres ที่แยก storage ออกจาก compute ทำให้ scale-to-zero และสร้าง branch แบบ copy-on-write ได้ — เป็นคุณสมบัติที่ Supabase (ซึ่งเป็น Postgres แบบ instance ปกติ + ชั้น PostgREST/Auth/Storage) ไม่มีในรูปแบบเดียวกัน
- โปรเจกต์นี้**ไม่ได้ใช้** ฟีเจอร์เสริมของ Supabase เลย (ไม่มี Auth, Storage, PostgREST, Realtime — ใช้ Auth.js, AWS S3, Drizzle, Upstash Redis แทน) จึงไม่มีอะไรต้องหาตัวแทน ประเด็นเดียวคือ "หา Postgres สักตัว"
- Pattern ที่ต้องระวังกับ Postgres แบบ pooled บน serverless: **prepared statement มีปัญหากับ PgBouncer transaction mode** เป็น pitfall ที่รู้จักกันดี และโปรเจกต์นี้เข้าเงื่อนไขพอดี — **แต่ PgBouncer 1.21+ เพิ่มการรองรับระดับ protocol แล้ว จึงไม่ใช่ข้อห้ามเด็ดขาดอีกต่อไป ต้องตรวจว่า Neon pooler ปัจจุบันเปิดใช้หรือไม่**
- **ยังไม่ได้ยืนยัน** จากหน้าเว็บจริง: โควตา free tier ปัจจุบัน, region ที่ให้บริการ, พฤติกรรม auto-suspend, และรูปแบบ billing เมื่อผ่าน Vercel Marketplace — ทั้งหมดอยู่ใน Open Questions ตั้งใจไม่เดาตัวเลข

**Technical Context (จากการตรวจโค้ดจริง)**

- `src/lib/db/index.ts:15-31` — lazy singleton, `postgres(url, { max: 10, prepare: true })` ← จุดที่ต้องแก้
- `drizzle.config.ts:7-23` — โหลด `.env.local`, ใช้ `DATABASE_URL` ตัวเดียว ← ต้องรองรับ direct URL
- `drizzle/0000` – `0013` — 14 migration files, ไม่มี extension, ไม่มี PostGIS
- `scripts/` — `seed.ts`, `seed-geodata.ts`, `seed-faq.ts`, `seed-villages.ts`, `check-superadmin.ts`, `backup.sh` ครบสำหรับ Phase 3 และ 6
- `.github/workflows/ci.yml` — รันแค่ lint/typecheck/unit + contrast gate; integration tests ถูก exclude เพราะไม่มี DB ใน CI
- `eslint.config.mjs:41-43` — rule C3 บล็อก import `@/lib/supabase/admin` ซึ่งเป็นไฟล์ที่ไม่มีอยู่จริง (dead rule)
- `docs/PRD.md`, `docs/PRP-Plan.md` — design doc รุ่นก่อนที่ออกแบบบน Supabase + RLS + Edge Runtime + PostgREST; implementation จริงไม่ได้เดินตามเส้นนี้ ทำให้อ่านแล้วเข้าใจผิดได้ ควรใส่ banner

---

*Generated: 2026-08-05 · Updated: 2026-08-05 (ผ่านรีวิว — แก้ 11 ประเด็น: env pull ทับ `.env.local`, `push` vs `migrate`, นับ migration ผิด, เคลม `prepare` แรงเกินหลักฐาน, metric ลอย, ความขัดแย้งเรื่องแตะ secret)*

*Status: READY — ไม่มี blocker เหลือแล้ว*
- **Phase 1 เริ่มได้ทันที** — งานโค้ดล้วน ทดสอบกับ docker local ได้ ไม่ต้องรอ Neon
- **ก่อนกด Create ใน Phase 2** — เช็ก **โควตา free tier** + **billing model** ในหน้า Marketplace แล้วเลือก **region ให้ใกล้ไทยที่สุด** (ย้ายทีหลังยาก)
- Open Questions ที่เหลือทั้งหมดตอบได้ระหว่างทาง ไม่บล็อกการเริ่มงาน
