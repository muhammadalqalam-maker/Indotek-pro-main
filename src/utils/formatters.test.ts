import { describe, expect, it } from 'vitest';
import { formatDateIndo, formatDateTimeWITA, formatDateWITA, getWitaDateISO } from './formatters';

describe('WITA date formatting', () => {
  it('uses the WITA calendar date even when UTC is still on the previous day', () => {
    const instant = new Date('2026-10-16T16:30:00.000Z');

    expect(getWitaDateISO(instant)).toBe('2026-10-17');
    expect(formatDateWITA(instant)).toBe('Sabtu, 17 Oktober 2026');
  });

  it('formats timestamp values in WITA while preserving date-only values', () => {
    expect(formatDateIndo('2026-10-16T23:30:00.000Z', true)).toBe('17 Oktober 2026');
    expect(formatDateIndo('2026-10-16', true)).toBe('16 Oktober 2026');
  });

  it('formats activity timestamps in WITA', () => {
    const formatted = formatDateTimeWITA('2026-10-16T16:30:00.000Z');

    expect(formatted).toContain('17 Okt');
    expect(formatted).toContain('00.30');
  });
});
