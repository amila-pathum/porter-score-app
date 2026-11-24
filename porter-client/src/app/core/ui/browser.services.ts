import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Online/offline status from the browser. */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }
}

/** Safe localStorage access: never throws (private mode, quota, disabled storage). */
@Injectable({ providedIn: 'root' })
export class SafeStorage {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: drafts simply aren't persisted */
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Per-device preferences (not account data). */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly storage = inject(SafeStorage);
  readonly keepScreenOn = signal(this.storage.get('porter:pref:keepScreenOn') !== 'false');

  setKeepScreenOn(value: boolean): void {
    this.keepScreenOn.set(value);
    this.storage.set('porter:pref:keepScreenOn', String(value));
  }
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/**
 * Keeps the screen awake while a game is open (Screen Wake Lock API), so the phone on the table doesn't
 * lock between deals. Silently does nothing where unsupported. Call from a component's injection context.
 */
export function useWakeLock(): void {
  const prefs = inject(PreferencesService);
  const destroyRef = inject(DestroyRef);
  let sentinel: WakeLockSentinelLike | null = null;
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } });

  const acquire = async () => {
    if (!prefs.keepScreenOn() || !nav?.wakeLock || document.visibilityState !== 'visible') return;
    try {
      sentinel = await nav.wakeLock.request('screen');
    } catch {
      sentinel = null;
    }
  };
  const onVisibility = () => void acquire();

  void acquire();
  document.addEventListener('visibilitychange', onVisibility);
  destroyRef.onDestroy(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release().catch(() => undefined);
  });
}
