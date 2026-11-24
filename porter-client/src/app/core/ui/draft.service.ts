import { Injectable, inject } from '@angular/core';
import { SafeStorage } from './browser.services';

export interface ScoreDraft {
  /** Raw input strings in seat order (kept even when invalid, so nothing typed is lost). */
  values: string[];
  /** Player ids in seat order, used to detect drafts that no longer match the game. */
  playerIds: string[];
  savedAt: string;
}

/**
 * Unsaved score drafts, stored per game and deal under `porter:draft:{gameId}:{dealNumber}`.
 * Corrupted or mismatched entries are discarded rather than trusted.
 */
@Injectable({ providedIn: 'root' })
export class DraftService {
  private readonly storage = inject(SafeStorage);

  key(gameId: string, dealNumber: number): string {
    return `porter:draft:${gameId}:${dealNumber}`;
  }

  load(gameId: string, dealNumber: number, playerIds: string[]): ScoreDraft | null {
    const raw = this.storage.get(this.key(gameId, dealNumber));
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw) as Partial<ScoreDraft>;
      const valid =
        Array.isArray(draft.values) &&
        Array.isArray(draft.playerIds) &&
        typeof draft.savedAt === 'string' &&
        draft.values.length === playerIds.length &&
        draft.values.every((v) => typeof v === 'string' && v.length <= 12) &&
        draft.playerIds.join() === playerIds.join();
      if (!valid || draft.values!.every((v) => v.trim() === '')) {
        this.clear(gameId, dealNumber);
        return null;
      }
      return draft as ScoreDraft;
    } catch {
      this.clear(gameId, dealNumber);
      return null;
    }
  }

  save(gameId: string, dealNumber: number, playerIds: string[], values: string[]): void {
    if (values.every((v) => v.trim() === '')) {
      this.clear(gameId, dealNumber);
      return;
    }
    const draft: ScoreDraft = { values, playerIds, savedAt: new Date().toISOString() };
    this.storage.set(this.key(gameId, dealNumber), JSON.stringify(draft));
  }

  clear(gameId: string, dealNumber: number): void {
    this.storage.remove(this.key(gameId, dealNumber));
  }
}
