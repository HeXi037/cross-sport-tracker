import { test, expect } from '@playwright/test';

test('user can log in', async ({ page }) => {
  await page.route('**/v0/auth/login', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    expect(body).toEqual({ username: 'alice', password: 'secret' });
    await route.fulfill({ status: 200, body: JSON.stringify({ access_token: 't' }) });
  });
  await page.goto('/login');
  await page.getByPlaceholder('Username').first().fill('alice');
  await page.getByPlaceholder('Password').first().fill('secret');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
});

test('failed signup shows error', async ({ page }) => {
  await page.route('**/v0/auth/signup', (route) =>
    route.fulfill({ status: 400, body: '{}' })
  );
  await page.goto('/login');
  await page.getByPlaceholder('Username').nth(1).fill('bob');
  await page.getByPlaceholder('Password').nth(1).fill('pass');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(page.getByRole('alert')).toHaveText(/signup failed/i);
});
