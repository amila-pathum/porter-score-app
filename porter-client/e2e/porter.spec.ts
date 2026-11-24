import { expect, test } from '@playwright/test';
import { PASSWORD, createGame, register, saveDeal, standings } from './helpers';

const FRIDAY = ['Kasun', 'Nimal', 'Amali', 'Tharindu'];
const POYA: number[][] = [
  [0, 14, 6, 21], [9, 0, 12, 5], [17, 8, 0, 11], [4, 22, 9, 0], [0, 6, 15, 13], [12, 0, 3, 27], [7, 10, 0, 8],
  [0, 5, 18, 16], [25, 12, 7, 0], [3, 0, 11, 9], [0, 19, 6, 14], [10, 7, 0, 5], [6, 13, 12, 0],
];

test.describe('Porter core workflows', () => {
  test('Flow 1: register, log out, log in, create players and start a game', async ({ page }) => {
    const email = await register(page, 'Kasun');
    await expect(page.getByRole('heading', { name: 'Welcome, Kasun' })).toBeVisible();

    // Log out and back in.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // A saved player from the Players page…
    await page.goto('/players');
    await page.getByRole('button', { name: 'New player' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill('Kasun');
    await page.getByRole('button', { name: 'Save player' }).click();
    await expect(page.getByRole('link', { name: /Kasun/ })).toBeVisible();

    // …plus three created inline while setting up the game.
    await page.goto('/games/new');
    await page.getByLabel('Game name').fill('Friday Night Porter');
    await page.getByRole('button', { name: /Kasun/ }).click();
    const search = page.getByRole('searchbox', { name: 'Search or add a player' });
    for (const name of ['Nimal', 'Amali', 'Tharindu']) {
      await search.fill(name);
      await search.press('Enter');
      await expect(page.getByRole('list', { name: 'Selected players in seat order' })).toContainText(name);
    }
    await expect(page.getByText('4 of 4')).toBeVisible();
    await page.getByTestId('create-start').click();

    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('heading', { name: 'Friday Night Porter' })).toBeVisible();
    await expect(page.getByTestId('deal-number')).toHaveText('1');
    await expect(page.getByTestId('wild-card')).toHaveAccessibleName('Wild card for deal 1: Ace');
    await expect(page.getByTestId('wild-card')).toContainText('Ace');
  });

  test('Flow 2: enter Deal 1 and verify totals and standings @mobile', async ({ page }) => {
    await register(page);
    await createGame(page, 'Friday Night Porter', FRIDAY);

    await page.getByTestId('score-0').fill('0');
    await page.getByTestId('score-1').fill('12');
    await page.getByTestId('score-2').fill('5');
    await page.getByTestId('score-3').fill('18');
    await expect(page.getByText('Deal sum 35')).toBeVisible();
    await page.getByTestId('save-deal').click();

    await expect(page.getByText('Deal 1 saved')).toBeVisible();
    await expect(page.getByTestId('deal-number')).toHaveText('2');
    await expect(page.getByTestId('score-0')).toHaveValue('');

    if ((page.viewportSize()?.width ?? 1280) < 768) await page.getByRole('tab', { name: 'Standings' }).click();
    expect(await standings(page)).toEqual([
      { rank: 1, name: 'Kasun', total: 0 },
      { rank: 2, name: 'Amali', total: 5 },
      { rank: 3, name: 'Nimal', total: 12 },
      { rank: 4, name: 'Tharindu', total: 18 },
    ]);
  });

  test('Flow 3: play all 13 deals and see final results', async ({ page }) => {
    await register(page);
    await createGame(page, 'Poya Night Porter', FRIDAY);

    for (let d = 0; d < 13; d++) await saveDeal(page, d + 1, POYA[d]);

    await expect(page.getByTestId('results-title')).toHaveText('Game complete');
    await expect(page.getByText('Completed · 13 of 13 deals')).toBeVisible();
    const winner = page.getByTestId('winner');
    await expect(winner).toContainText('Winner');
    await expect(winner).toContainText('Kasun');
    await expect(winner).toContainText('93');
    const final = page.getByRole('region', { name: 'Final standings' }).getByRole('listitem');
    await expect(final).toHaveText([/Kasun.*93/s, /Amali.*99/s, /Nimal.*116/s, /Tharindu.*129/s]);
  });

  test('Flow 4: correct a historical deal and see totals and ranks recalculate', async ({ page }) => {
    await register(page);
    await createGame(page, 'Friday Night Porter', FRIDAY);
    const fridays = [[0, 12, 5, 18], [18, 0, 7, 25], [5, 9, 0, 12], [12, 33, 14, 0]];
    for (let d = 0; d < fridays.length; d++) await saveDeal(page, d + 1, fridays[d]);
    expect((await standings(page)).map((s) => `${s.rank} ${s.name} ${s.total}`)).toEqual(['1 Amali 26', '2 Kasun 35', '3 Nimal 54', '4 Tharindu 55']);

    const gameUrl = page.url().replace(/\/play$/, '');
    await page.goto(`${gameUrl}/deals/3/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Deal 3' })).toBeVisible();
    await page.getByTestId('score-1').fill('19');
    await expect(page.getByText('Was 9 · +10')).toBeVisible();
    const impact = page.getByRole('region', { name: 'Effect of this change' });
    await expect(impact).toContainText("Nimal's total");
    await expect(impact).toContainText('3rd');
    await expect(impact).toContainText('4th');
    await page.getByTestId('save-correction').click();

    await expect(page).toHaveURL(/\/progress\?highlight=3$/);
    await expect(page.getByText(/Deal 3 corrected\. Nimal is now 4th/)).toBeVisible();
    expect((await standings(page)).map((s) => `${s.rank} ${s.name} ${s.total}`)).toEqual(['1 Amali 26', '2 Kasun 35', '3 Tharindu 55', '4 Nimal 64']);
  });

  test('Flow 5: a tied result uses competition ranking and joint winners', async ({ page }) => {
    await register(page);
    await createGame(page, 'Avurudu Porter', ['Kasun', 'Nimal', 'Amali']);
    // Kasun and Nimal tie on 13; Amali 26.
    for (let d = 1; d <= 13; d++) await saveDeal(page, d, d % 2 ? [1, 1, 2] : [1, 1, 2]);

    const winner = page.getByTestId('winner');
    await expect(winner).toContainText('Joint winners');
    await expect(winner).toContainText('Kasun & Nimal');
    const final = page.getByRole('region', { name: 'Final standings' }).getByRole('listitem');
    await expect(final.nth(0).getByLabel('Rank 1, tied')).toBeVisible();
    await expect(final.nth(1).getByLabel('Rank 1, tied')).toBeVisible();
    await expect(final.nth(2).getByLabel('Rank 3')).toBeVisible(); // competition ranking: 1, 1, 3
  });

  test('Flow 6: invalid score entry shows errors, keeps input, then saves @mobile', async ({ page }) => {
    await register(page);
    await createGame(page, 'Error Night', ['Kasun', 'Nimal']);

    await page.getByTestId('score-0').fill('-4');
    await expect(page.getByText("Can't be negative")).toBeVisible();
    await page.getByTestId('save-deal').click();
    await expect(page.getByText(/1 score is missing · 1 score needs fixing\. Nothing was saved\./)).toBeVisible();
    await expect(page.getByTestId('score-0')).toHaveValue('-4');
    await expect(page.getByTestId('score-1')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('deal-number')).toHaveText('1');

    await page.getByTestId('score-0').fill('2.5');
    await expect(page.getByText('Whole numbers only')).toBeVisible();

    await page.getByTestId('score-0').fill('7');
    await page.getByTestId('score-1').fill('0');
    await page.getByTestId('save-deal').click();
    await expect(page.getByTestId('deal-number')).toHaveText('2');
  });

  test('Draft scores survive a reload', async ({ page }) => {
    await register(page);
    await createGame(page, 'Reload Night', ['Kasun', 'Nimal']);
    await page.getByTestId('score-0').fill('11');
    await page.waitForTimeout(400); // draft autosave debounce
    await page.reload();
    await expect(page.getByText(/Restored unsaved scores/)).toBeVisible();
    await expect(page.getByTestId('score-0')).toHaveValue('11');
  });
});
