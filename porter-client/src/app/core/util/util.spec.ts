import { describe, expect, it } from 'vitest';
import { passwordPolicy, passwordStrength } from '../../shared/forms';
import { FormControl } from '@angular/forms';
import { safeReturnUrl } from '../auth/auth.guards';
import { duration, joinNames, ordinal } from './format';
import { HIGH_SCORE_HINT, competitionRanks, scoreIssue, scoreIssueMessage } from './ranking';

describe('competitionRanks (preview only)', () => {
  it.each([
    [[20, 20, 25, 30], [1, 1, 3, 4]],
    [[10, 15, 15, 20], [1, 2, 2, 4]],
    [[35, 64, 26, 55], [2, 4, 1, 3]],
    [[0, 0], [1, 1]],
  ])('%j → %j', (totals, ranks) => expect(competitionRanks(totals)).toEqual(ranks));
});

describe('scoreIssue', () => {
  it.each([
    ['', 'empty'],
    ['  ', 'empty'],
    ['0', null],
    ['8', null],
    ['5000', null],
    [' 12 ', null],
    ['-4', 'negative'],
    ['2.5', 'decimal'],
    ['3,5', 'decimal'],
    ['abc', 'invalid'],
    ['1e3', 'invalid'],
  ])('%j → %s', (raw, issue) => expect(scoreIssue(raw)).toBe(issue));

  it('has a human message for every issue', () => {
    expect(scoreIssueMessage('negative')).toBe("Can't be negative");
    expect(scoreIssueMessage('decimal')).toBe('Whole numbers only');
    expect(scoreIssueMessage(null)).toBe('');
  });

  it('high-score hint is a soft threshold, not a rule', () => {
    expect(HIGH_SCORE_HINT).toBeGreaterThan(50);
    expect(scoreIssue(String(HIGH_SCORE_HINT * 10))).toBeNull();
  });
});

describe('format helpers', () => {
  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd']])(
    'ordinal(%i) = %s', (n, s) => expect(ordinal(n)).toBe(s));

  it('joins names naturally', () => {
    expect(joinNames(['Kasun'])).toBe('Kasun');
    expect(joinNames(['Kasun', 'Nimal'])).toBe('Kasun & Nimal');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B & C');
  });

  it('formats durations', () => {
    expect(duration('2026-11-15T13:50:00Z', '2026-11-15T16:04:00Z')).toBe('2 h 14 min');
    expect(duration('2026-11-15T13:50:00Z', '2026-11-15T14:05:00Z')).toBe('15 min');
    expect(duration(null, '2026-11-15T14:05:00Z')).toBeNull();
  });
});

describe('safeReturnUrl', () => {
  it('only allows same-app paths', () => {
    expect(safeReturnUrl('/games/1/play')).toBe('/games/1/play');
    expect(safeReturnUrl('https://evil.example')).toBe('/dashboard');
    expect(safeReturnUrl('//evil.example')).toBe('/dashboard');
    expect(safeReturnUrl('/login?x=1')).toBe('/dashboard');
    expect(safeReturnUrl(null)).toBe('/dashboard');
  });
});

describe('password policy', () => {
  const check = (v: string) => passwordPolicy(new FormControl(v));
  it('requires 8+ chars, a letter and a number', () => {
    expect(check('Password1')).toBeNull();
    expect(check('short1')).toEqual({ minlength: true });
    expect(check('12345678')).toEqual({ letter: true });
    expect(check('password')).toEqual({ digit: true });
  });
  it('rates strength', () => {
    expect(passwordStrength('').level).toBe(0);
    expect(passwordStrength('abc123').level).toBe(1);
    expect(passwordStrength('tablecards7').level).toBe(2);
    expect(passwordStrength('table-cards-77!').level).toBe(3);
  });
});
