import { AvatarColor } from '../api/models';

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dateYearFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "15 Nov", or "15 Nov 2025" when not in the current year. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? dateFmt.format(d) : dateYearFmt.format(d);
}

export function longDate(d: Date = new Date()): string {
  return longDateFmt.format(d);
}

export function time(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "just now", "12 min ago", "3 h ago", else a short date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return shortDate(iso);
}

/** "2 h 14 min" between two timestamps. */
export function duration(fromIso: string | null, toIso: string | null): string | null {
  if (!fromIso || !toIso) return null;
  const min = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
  if (min < 1) return null;
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function defaultGameName(now: Date = new Date()): string {
  return `Porter · ${dateFmt.format(now)}`;
}

export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

export const AVATAR_CLASSES: Record<AvatarColor, string> = {
  teal: 'bg-[#DCEAE6] text-[#1E5E57]',
  amber: 'bg-[#F5E4C4] text-[#774D0D]',
  olive: 'bg-[#E3E9DA] text-[#45582E]',
  slate: 'bg-[#DEE6F0] text-[#2D5070]',
  plum: 'bg-[#EDE6F0] text-[#5B4466]',
  clay: 'bg-[#F3E1DC] text-[#86402F]',
};

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
