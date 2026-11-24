import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DraftService } from './draft.service';

describe('DraftService', () => {
  let drafts: DraftService;
  const players = ['p1', 'p2', 'p3'];

  beforeEach(() => {
    localStorage.clear();
    drafts = TestBed.inject(DraftService);
  });

  it('uses the documented key format', () => {
    expect(drafts.key('g1', 5)).toBe('porter:draft:g1:5');
  });

  it('round-trips raw values, including invalid ones the user typed', () => {
    drafts.save('g1', 5, players, ['8', '-4', '']);
    const draft = drafts.load('g1', 5, players);
    expect(draft?.values).toEqual(['8', '-4', '']);
  });

  it('does not store an all-empty draft', () => {
    drafts.save('g1', 5, players, ['', ' ', '']);
    expect(localStorage.getItem('porter:draft:g1:5')).toBeNull();
  });

  it('discards corrupted JSON safely', () => {
    localStorage.setItem('porter:draft:g1:5', '{not json');
    expect(drafts.load('g1', 5, players)).toBeNull();
    expect(localStorage.getItem('porter:draft:g1:5')).toBeNull();
  });

  it('discards drafts whose shape or players no longer match', () => {
    localStorage.setItem('porter:draft:g1:5', JSON.stringify({ values: [1, 2, 3], playerIds: players, savedAt: 'x' }));
    expect(drafts.load('g1', 5, players)).toBeNull();

    drafts.save('g1', 6, players, ['1', '2', '3']);
    expect(drafts.load('g1', 6, ['p1', 'p3', 'p2'])).toBeNull();
  });

  it('clears after save', () => {
    drafts.save('g1', 5, players, ['1', '2', '3']);
    drafts.clear('g1', 5);
    expect(drafts.load('g1', 5, players)).toBeNull();
  });
});
