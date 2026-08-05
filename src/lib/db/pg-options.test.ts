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
