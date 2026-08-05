import { describe, expect, test } from 'vitest';
import { redactConnectionString, redactErrorMessage } from './redact';

describe('redactConnectionString', () => {
  test('masks the password while keeping user, host and database readable', () => {
    const result = redactConnectionString(
      'postgresql://neondb_owner:npg_s3cret@ep-x.neon.tech/neondb'
    );
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
