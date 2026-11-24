import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { ConnectivityService } from '../core/ui/browser.services';
import { ToastService } from '../core/ui/toast.service';
import { Avatar } from '../shared/ui/game-bits';
import { Icon, IconName, Logo } from '../shared/ui/icon';

interface NavItem {
  label: string;
  link: string;
  icon: IconName;
}

/**
 * Authenticated app chrome. ≥768px: top bar with four primary items and an account menu.
 * <768px: bottom bar (Home, Games, Players, Profile), hidden on focus routes (score entry,
 * game creation) where a sticky action bar takes its place.
 */
@Component({
  selector: 'p-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CdkMenuTrigger, CdkMenu, CdkMenuItem, Icon, Logo, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main" class="sr-only-focusable fixed top-2 left-2 z-50 rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-2)]">Skip to content</a>

    <header class="sticky top-0 z-30 hidden border-b border-border bg-surface md:block">
      <nav class="mx-auto flex h-16 max-w-[1200px] items-center gap-1 px-6" aria-label="Primary">
        <a routerLink="/dashboard" class="mr-4 text-ink no-underline" aria-label="Porter home"><p-logo /></a>
        @for (item of desktopNav; track item.link) {
          <a [routerLink]="item.link" routerLinkActive="!bg-surface-muted !text-ink" ariaCurrentWhenActive="page"
            class="inline-flex h-9 items-center rounded-md px-3 text-[14px] font-medium text-ink-muted no-underline hover:text-ink">{{ item.label }}</a>
        }
        <span class="flex-1"></span>
        <button type="button" [cdkMenuTriggerFor]="accountMenu" class="flex items-center gap-2 rounded-md p-1 hover:bg-surface-muted"
          aria-label="Account menu">
          <p-avatar [name]="userName()" color="teal" size="sm" />
          <p-icon name="down" [size]="16" />
        </button>
      </nav>
    </header>

    <ng-template #accountMenu>
      <div cdkMenu class="min-w-56 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-2)]">
        <div class="px-3 py-2">
          <div class="font-medium">{{ userName() }}</div>
          <div class="t-small text-ink-muted">{{ auth.user()?.email }}</div>
        </div>
        <div class="my-1 h-px bg-border"></div>
        <a cdkMenuItem routerLink="/profile" class="flex h-10 items-center gap-2 rounded-md px-3 text-ink no-underline hover:bg-surface-muted focus:bg-surface-muted">
          <p-icon name="user" [size]="18" />Profile</a>
        <a cdkMenuItem routerLink="/settings" class="flex h-10 items-center gap-2 rounded-md px-3 text-ink no-underline hover:bg-surface-muted focus:bg-surface-muted">
          <p-icon name="settings" [size]="18" />Settings</a>
        <button cdkMenuItem type="button" (click)="logout()" class="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left hover:bg-surface-muted focus:bg-surface-muted">
          <p-icon name="logout" [size]="18" />Log out</button>
      </div>
    </ng-template>

    @if (!connectivity.online()) {
      <div class="sticky top-0 z-20 flex items-center justify-center gap-2 bg-amber-soft px-4 py-2 text-[13px] text-amber-ink md:top-16" role="status">
        <p-icon name="wifiOff" [size]="16" />You're offline. Unsaved scores stay on this device.
      </div>
    }

    <main id="main" tabindex="-1" class="outline-none" [class.pb-[68px]]="!focusMode()">
      <router-outlet />
    </main>

    @if (!focusMode()) {
      <nav class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Primary">
        @for (item of mobileNav; track item.link) {
          <a [routerLink]="item.link" routerLinkActive="is-active" ariaCurrentWhenActive="page" #rla="routerLinkActive"
            class="group flex h-[68px] flex-col items-center justify-center gap-[3px] text-[11px] font-medium text-ink-muted no-underline"
            [class.!text-primary]="rla.isActive">
            <span class="flex h-7 w-[52px] items-center justify-center rounded-full" [class.bg-primary-soft]="rla.isActive">
              <p-icon [name]="item.icon" />
            </span>{{ item.label }}
          </a>
        }
      </nav>
    }

    <div class="pointer-events-none fixed inset-x-4 z-40 flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-6"
      [class]="focusMode() ? 'bottom-[150px]' : 'bottom-[84px]'">
      @for (t of toasts.toasts(); track t.id) {
        <div class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md px-4 py-3 text-[14px] text-[#F6F4EF] shadow-[var(--shadow-2)]"
          [class]="t.kind === 'error' ? 'bg-[#7E2E21]' : 'bg-ink'">
          <p-icon [name]="t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check'" />
          <span class="flex-1">{{ t.message }}</span>
          @if (t.action; as a) {
            @if (a.link) {
              <a [routerLink]="a.link" class="font-medium text-[#A9D4CB]" (click)="toasts.dismiss(t.id)">{{ a.label }}</a>
            } @else {
              <button type="button" class="font-medium text-[#A9D4CB] underline-offset-2 hover:underline" (click)="a.run?.(); toasts.dismiss(t.id)">{{ a.label }}</button>
            }
          }
          <button type="button" class="-mr-2 inline-flex size-8 items-center justify-center rounded opacity-70 hover:opacity-100" aria-label="Dismiss" (click)="toasts.dismiss(t.id)">
            <p-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly desktopNav: NavItem[] = [
    { label: 'Dashboard', link: '/dashboard', icon: 'home' },
    { label: 'Games', link: '/games', icon: 'games' },
    { label: 'Players', link: '/players', icon: 'users' },
    { label: 'Statistics', link: '/statistics', icon: 'chart' },
  ];
  protected readonly mobileNav: NavItem[] = [
    { label: 'Home', link: '/dashboard', icon: 'home' },
    { label: 'Games', link: '/games', icon: 'games' },
    { label: 'Players', link: '/players', icon: 'users' },
    { label: 'Profile', link: '/profile', icon: 'user' },
  ];

  protected readonly userName = computed(() => this.auth.user()?.displayName ?? '');

  /** True on routes flagged `data: { focus: true }`, where the sticky action bar replaces the bottom nav. */
  protected readonly focusMode = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let r: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
        let focus = false;
        while (r) {
          focus = focus || r.data['focus'] === true;
          r = r.firstChild;
        }
        return focus;
      }),
    ),
    { initialValue: false },
  );

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
