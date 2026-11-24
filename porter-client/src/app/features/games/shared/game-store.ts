import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { GameState } from '../../../core/api/models';
import { PorterApi } from '../../../core/api/porter-api';
import { ApiProblem, toProblem } from '../../../core/api/problem';

/**
 * State for one game, provided at the `games/:id` route so moving between play, progress, deal and
 * results screens doesn't refetch. Every write replaces the state with the server's response.
 */
@Injectable()
export class GameStore {
  private readonly api = inject(PorterApi);
  private loadedId: string | null = null;
  private sub: Subscription | null = null;

  readonly game = signal<GameState | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiProblem | null>(null);

  readonly playersById = computed(() => new Map((this.game()?.players ?? []).map((p) => [p.playerId, p])));

  /** Loads the game unless it's already loaded (or loading). `force` refetches. */
  load(id: string, force = false): void {
    if (!force && this.loadedId === id && (this.game() || this.loading())) return;
    if (this.loadedId !== id) this.game.set(null);
    this.loadedId = id;
    this.loading.set(true);
    this.error.set(null);
    this.sub?.unsubscribe();
    this.sub = this.api.getGame(id).subscribe({
      next: (g) => {
        this.game.set(g);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toProblem(e));
        this.loading.set(false);
      },
    });
  }

  reload(): void {
    if (this.loadedId) this.load(this.loadedId, true);
  }

  set(game: GameState): void {
    this.loadedId = game.id;
    this.error.set(null);
    this.game.set(game);
  }
}

/** Status → the screen that owns it. */
export function screenFor(game: GameState): 'setup' | 'play' | 'results' {
  return game.status === 'draft' ? 'setup' : game.status === 'active' ? 'play' : 'results';
}
