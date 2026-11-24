/**
 * Client-side competition ranking used ONLY for previews (e.g. "Nimal 3rd → 4th" before saving a
 * correction). Official standings always come from the API.
 */
export function competitionRanks(totals: number[]): number[] {
  return totals.map((t) => 1 + totals.filter((o) => o < t).length);
}

/** A whole, non-negative number with no sign, decimals or spaces. */
export const SCORE_PATTERN = /^\d+$/;

/** Scores at or above this get a soft "double-check" hint. Never blocks saving: there is no rule limit. */
export const HIGH_SCORE_HINT = 100;

export type ScoreIssue = 'empty' | 'negative' | 'decimal' | 'invalid' | null;

export function scoreIssue(raw: string): ScoreIssue {
  const v = raw.trim();
  if (v === '') return 'empty';
  if (SCORE_PATTERN.test(v)) return null;
  if (/^-\s*\d/.test(v)) return 'negative';
  if (/^\d*[.,]\d+$/.test(v)) return 'decimal';
  return 'invalid';
}

export function scoreIssueMessage(issue: ScoreIssue): string {
  switch (issue) {
    case 'empty':
      return 'Enter a score';
    case 'negative':
      return "Can't be negative";
    case 'decimal':
      return 'Whole numbers only';
    case 'invalid':
      return 'Enter a whole number';
    default:
      return '';
  }
}
