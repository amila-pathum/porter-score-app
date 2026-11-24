import { Page, expect } from '@playwright/test';

export const PASSWORD = 'Password1';

export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

/** Registers a fresh account through the UI and lands on the dashboard. */
export async function register(page: Page, name = 'Kasun'): Promise<string> {
  const email = uniqueEmail();
  await page.goto('/register');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

/**
 * Creates a game from the New game screen, adding each player inline through the search box,
 * then "Create & start". Ends on the score-entry screen for Deal 1.
 */
export async function createGame(page: Page, name: string, players: string[]): Promise<void> {
  await page.goto('/games/new');
  await page.getByLabel('Game name').fill(name);
  const search = page.getByRole('searchbox', { name: 'Search or add a player' });
  for (const p of players) {
    await search.fill(p);
    await page.getByRole('button', { name: new RegExp(`Add "${p}" as a new player`) }).click();
    await expect(page.getByRole('list', { name: 'Selected players in seat order' })).toContainText(p);
  }
  await page.getByTestId('create-start').click();
  await expect(page).toHaveURL(/\/games\/[0-9a-f-]+\/play$/);
  await expect(page.getByTestId('deal-number')).toHaveText('1');
}

/** Types one score per seat and saves; waits until the next deal (or results) is shown. */
export async function saveDeal(page: Page, dealNumber: number, scores: number[]): Promise<void> {
  await expect(page.getByTestId('deal-number')).toHaveText(String(dealNumber));
  for (let i = 0; i < scores.length; i++) await page.getByTestId(`score-${i}`).fill(String(scores[i]));
  await page.getByTestId('save-deal').click();
  if (dealNumber < 13) await expect(page.getByTestId('deal-number')).toHaveText(String(dealNumber + 1));
  else await expect(page).toHaveURL(/\/results\?completed=1$/);
}

/** Reads the visible standings as [{ rank, name, total }] in display order. */
export async function standings(page: Page): Promise<{ rank: number; name: string; total: number }[]> {
  const rows = page.locator('[data-testid="standing"]:visible');
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((els) =>
    els.map((el) => ({ rank: Number(el.getAttribute('data-rank')), name: el.getAttribute('data-name') ?? '', total: Number(el.getAttribute('data-total')) })),
  );
}
