import { describe, expect, test } from 'vitest';
import { checkAuthUrl, checkDatabaseUrl } from './env-checks';

const PROD = true;
const DEV = false;

describe('checkDatabaseUrl', () => {
  test('passes a well-formed dev connection string', () => {
    const r = checkDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:5432/postgres', DEV);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test('stays silent when the value is missing — presence is required[] job', () => {
    expect(checkDatabaseUrl(undefined, PROD).errors).toEqual([]);
    expect(checkDatabaseUrl('', PROD).errors).toEqual([]);
  });

  test('rejects a string that is not a URL', () => {
    const r = checkDatabaseUrl('not-a-url', DEV);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('parse ไม่ผ่าน');
  });

  // § สำคัญเชิงความปลอดภัย — ข้อความ error ไปโผล่ใน build log ที่คนอื่นอ่านได้ (PDPA)
  test('masks the password when reporting an unparseable connection string', () => {
    const r = checkDatabaseUrl('postgresql://dbuser:SUPERSECRET@host:notaport/db', DEV);
    expect(r.errors[0]).not.toContain('SUPERSECRET');
    expect(r.errors[0]).toContain('dbuser:***@');
  });

  test('rejects a non-postgres protocol', () => {
    const r = checkDatabaseUrl('mysql://u:p@host/db', DEV);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('postgresql://');
  });

  test('does not apply production rules outside production', () => {
    // localhost + ไม่มี sslmode — ถูกต้องสำหรับ docker local
    const r = checkDatabaseUrl('postgresql://postgres:postgres@localhost:5432/postgres', DEV);
    expect(r.errors).toEqual([]);
  });

  test('rejects localhost in production', () => {
    const r = checkDatabaseUrl('postgresql://u:p@localhost:5432/db?sslmode=require', PROD);
    expect(r.errors.some((e) => e.includes('localhost'))).toBe(true);
  });

  test('requires TLS in production when sslmode is absent', () => {
    const r = checkDatabaseUrl('postgresql://u:p@db.example.com/db', PROD);
    expect(r.errors.some((e) => e.includes('TLS'))).toBe(true);
  });

  test('rejects an sslmode that does not enforce TLS', () => {
    for (const mode of ['disable', 'allow', 'prefer']) {
      const r = checkDatabaseUrl(`postgresql://u:p@db.example.com/db?sslmode=${mode}`, PROD);
      expect(r.errors.some((e) => e.includes('TLS'))).toBe(true);
    }
  });

  test('accepts every sslmode that does enforce TLS', () => {
    for (const mode of ['require', 'verify-ca', 'verify-full']) {
      const r = checkDatabaseUrl(`postgresql://u:p@db.example.com/db?sslmode=${mode}`, PROD);
      expect(r.errors).toEqual([]);
    }
  });

  test('collects both production failures at once instead of stopping at the first', () => {
    const r = checkDatabaseUrl('postgresql://u:p@localhost:5432/db', PROD);
    expect(r.errors).toHaveLength(2);
  });

  test('warns — but does not block — on a Neon endpoint that looks unpooled', () => {
    const r = checkDatabaseUrl('postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/db?sslmode=require', PROD);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('pooled endpoint');
  });

  test('stays quiet on a Neon pooled endpoint', () => {
    const r = checkDatabaseUrl(
      'postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require',
      PROD
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe('checkAuthUrl', () => {
  test('does not apply outside production', () => {
    expect(checkAuthUrl('http://localhost:3000', DEV).errors).toEqual([]);
  });

  test('stays silent when the value is missing', () => {
    expect(checkAuthUrl(undefined, PROD).errors).toEqual([]);
  });

  test('accepts a canonical https url in production', () => {
    const r = checkAuthUrl('https://sw.example.go.th', PROD);
    expect(r.errors).toEqual([]);
  });

  test('rejects a string that is not a URL', () => {
    const r = checkAuthUrl('not a url', PROD);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('parse ไม่ผ่าน');
  });

  test('rejects http in production', () => {
    const r = checkAuthUrl('http://sw.example.go.th', PROD);
    expect(r.errors.some((e) => e.includes('https://'))).toBe(true);
  });

  test('rejects localhost in production', () => {
    const r = checkAuthUrl('https://localhost:3000', PROD);
    expect(r.errors.some((e) => e.includes('localhost'))).toBe(true);
  });

  test('collects both failures at once for http://localhost', () => {
    const r = checkAuthUrl('http://localhost:3000', PROD);
    expect(r.errors).toHaveLength(2);
  });
});
