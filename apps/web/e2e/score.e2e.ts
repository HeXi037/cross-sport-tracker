import { test, expect } from '@playwright/test';

test('record padel match', async ({ page }) => {
  await page.route('**/v0/players', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        players: [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
          { id: '3', name: 'Cara' },
          { id: '4', name: 'Dan' },
        ],
      }),
    })
  );
  let matchCalled = false;
  await page.route('**/v0/matches', async (route) => {
    matchCalled = true;
    await route.fulfill({ status: 200, body: JSON.stringify({ id: 'm1' }) });
  });
  let setsCalled = false;
  await page.route('**/v0/matches/m1/sets', async (route) => {
    setsCalled = true;
    const body = JSON.parse(route.request().postData() || '{}');
    expect(body.sets).toEqual([{ A: 6, B: 4 }]);
    await route.fulfill({ status: 200, body: '{}' });
  });

  await page.goto('/record/padel');
  await page.getByLabel('Player A1').selectOption('1');
  await page.getByLabel('Player A2').selectOption('2');
  await page.getByLabel('Player B1').selectOption('3');
  await page.getByLabel('Player B2').selectOption('4');
  await page.getByPlaceholder('Set 1 A').fill('6');
  await page.getByPlaceholder('Set 1 B').fill('4');
  await page.getByRole('button', { name: 'Save' }).click();
  expect(matchCalled).toBe(true);
  expect(setsCalled).toBe(true);
});
