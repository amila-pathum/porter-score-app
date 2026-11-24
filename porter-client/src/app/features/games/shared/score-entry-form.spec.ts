import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { GamePlayerState } from '../../../core/api/models';
import { ScoreEntryForm } from './score-entry-form';

const PLAYERS: GamePlayerState[] = [
  { playerId: 'k', name: 'Kasun', avatarColor: 'teal', seat: 1, total: 35, rank: 2, isTied: false },
  { playerId: 'n', name: 'Nimal', avatarColor: 'amber', seat: 2, total: 54, rank: 3, isTied: false },
  { playerId: 'a', name: 'Amali', avatarColor: 'olive', seat: 3, total: 26, rank: 1, isTied: false },
  { playerId: 't', name: 'Tharindu', avatarColor: 'slate', seat: 4, total: 55, rank: 4, isTied: false },
];

describe('ScoreEntryForm', () => {
  let fixture: ComponentFixture<ScoreEntryForm>;
  let form: ScoreEntryForm;
  let el: HTMLElement;

  async function type(index: number, value: string) {
    const input = el.querySelector<HTMLInputElement>(`[data-testid="score-${index}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(ScoreEntryForm);
    fixture.componentRef.setInput('players', PLAYERS);
    fixture.componentRef.setInput('dealNumber', 5);
    await fixture.whenStable();
    form = fixture.componentInstance;
    el = fixture.nativeElement;
  });

  it('renders one numeric-keyboard row per player in seat order', () => {
    const inputs = el.querySelectorAll<HTMLInputElement>('input.score-in');
    expect(inputs.length).toBe(4);
    expect(inputs[0].getAttribute('inputmode')).toBe('numeric');
    expect(inputs[0].type).toBe('text');
    expect(inputs[0].getAttribute('aria-label')).toBe('Kasun, deal 5 score. Total so far 35');
    expect(inputs[3].getAttribute('enterkeyhint')).toBe('done');
    expect(el.textContent).toContain('35 · 2nd');
  });

  it('previews the new total without changing rank text', async () => {
    await type(0, '8');
    expect(el.textContent).toContain('→ 43');
    expect(el.textContent).toContain('35 · 2nd');
    expect(form.enteredCount()).toBe(1);
  });

  it('flags format errors immediately but missing scores only after a save attempt', async () => {
    await type(0, '-4');
    expect(el.textContent).toContain("Can't be negative");
    expect(el.textContent).not.toContain('Enter a score');

    expect(form.validateForSave()).toBe(false);
    await fixture.whenStable();
    expect(el.textContent).toContain('Enter a score');
    expect(el.querySelector('[data-testid="score-0"]')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('is valid with all whole numbers and exposes scores and sum', async () => {
    for (const [i, v] of ['8', '0', '15', '9'].entries()) await type(i, v);
    expect(form.allValid()).toBe(true);
    expect(form.scores()).toEqual([8, 0, 15, 9]);
    expect(form.sum()).toBe(32);
  });

  it('accepts large scores (no upper limit) with a soft warning', async () => {
    for (const [i, v] of ['250', '0', '1', '2'].entries()) await type(i, v);
    expect(form.allValid()).toBe(true);
    expect(el.textContent).toContain('unusually high');
  });

  it('warns softly when nobody scored 0', async () => {
    for (const [i, v] of ['1', '2', '3', '4'].entries()) await type(i, v);
    expect(form.allValid()).toBe(true);
    expect(el.textContent).toContain('No player has 0');
  });

  it('clear() empties the inputs after a save', async () => {
    await type(0, '8');
    form.clear();
    await fixture.whenStable();
    expect(form.values()).toEqual(['', '', '', '']);
  });

  it('shows server field errors on the right row', async () => {
    fixture.componentRef.setInput('serverErrors', { 2: "Scores can't be negative." });
    await fixture.whenStable();
    expect(el.textContent).toContain("Scores can't be negative.");
  });
});

describe('ScoreEntryForm in edit mode', () => {
  it('starts from the saved scores and reports deltas', async () => {
    const fixture = TestBed.createComponent(ScoreEntryForm);
    fixture.componentRef.setInput('players', PLAYERS);
    fixture.componentRef.setInput('dealNumber', 3);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('original', [5, 9, 0, 12]);
    await fixture.whenStable();
    const form = fixture.componentInstance;
    expect(form.values()).toEqual(['5', '9', '0', '12']);
    expect(form.changedCount()).toBe(0);

    form.setValues(['5', '19', '0', '12']);
    await fixture.whenStable();
    expect(form.changedCount()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Was 9 · +10');
  });
});
