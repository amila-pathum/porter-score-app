import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  games: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.75',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  chart: 'M4 20h16M7 16v-6M12 16V6M17 16v-3',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  up: 'M18 15l-6-6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12l5 5L20 7',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  alert: 'M12 8v5M12 16.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  info: 'M12 16v-4M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 3l18 18',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  sort: 'M7 4v16M3 16l4 4 4-4M14 6h7M14 12h5M14 18h3',
  wifiOff: 'M2 8.8a15 15 0 0 1 4.2-2.6M9.6 5.2A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 3-1.8M16 11.4a10 10 0 0 1 3 1.1M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18',
  play: 'M7 4v16l13-8z',
  list: 'M4 6h16M4 12h16M4 18h10',
} as const;

export type IconName = keyof typeof PATHS;

/** Inline stroke icon. Decorative by default; pass `label` when the icon carries meaning on its own. */
@Component({
  selector: 'p-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="name() === 'more' ? 3 : 1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label()"
      focusable="false"
    >
      <path [attr.d]="d()" />
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly label = input<string | null>(null);
  protected readonly d = computed(() => PATHS[this.name()]);
}

@Component({
  selector: 'p-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1E5E57" />
      <path d="M9 11h14M9 16h14M9 21h8" stroke="#F6F4EF" stroke-width="2" stroke-linecap="round" />
      <circle cx="22.5" cy="21" r="2.5" fill="#C98A2E" />
    </svg>
    @if (showName()) {
      <span class="text-[17px] font-medium">Porter</span>
    }
  `,
})
export class Logo {
  readonly size = input(28);
  readonly showName = input(true);
}
