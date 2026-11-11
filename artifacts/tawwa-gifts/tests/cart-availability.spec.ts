import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Catalog } from '@workspace/api-client-react';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'),
) as Catalog;
const savedGifts = [
  { productId: 'little-wonder', quantity: 2, message: 'A very special birthday!', date: '2027-01-14' },
  { productId: 'new-mom-moment', quantity: 1, message: 'A little care for you.', date: '2027-02-20' },
];
const availableProduct = catalog.products.find(product => product.id === savedGifts[1].productId)!;
const availableTotal = `${availableProduct.price.toFixed(3)} KWD`;

test.beforeEach(async ({ page }) => {
  await page.route('**/api/payments/config', route => route.fulfill({
    json: { deliveryFee: 0.5, currency: 'usd', kwdToChargeRate: 3.221725, kwdToChargeRateDate: '2026-11-11', testMode: true },
  }));
  await page.addInitScript(gifts => {
    localStorage.setItem('tawwa-intro-seen', 'yes');
    if (localStorage.getItem('tawwa-cart') === null) {
      localStorage.setItem('tawwa-cart', JSON.stringify(gifts));
    }
  }, savedGifts);
});

for (const duringCheckout of [false, true]) {
  test(`catalog refresh keeps unavailable gifts visible ${duringCheckout ? 'during checkout' : 'in the cart'}`, async ({ page }) => {
    let unavailable = false;
    await page.route('**/api/catalog', route => route.fulfill({
      json: { ...catalog, products: catalog.products.filter(product => !unavailable || product.id !== savedGifts[0].productId) },
    }));
    await page.clock.install();
    await page.goto('/cart');
    await expect(page.getByTestId('text-card-message-little-wonder')).toContainText(savedGifts[0].message);
    if (duringCheckout) {
      await page.getByTestId('button-continue-checkout').click();
      await expect(page.getByTestId('checkout-gift-review')).toBeVisible();
    }

    unavailable = true;
    // Exercise the provider's real polling refresh, without reloading the page.
    await page.clock.fastForward(60_001);
    await expect(page.getByTestId('cart-unavailable-notice')).toBeVisible();
    const row = page.getByTestId('cart-unavailable-little-wonder');
    await expect(row).toContainText('This box is no longer available.');
    await expect(row).toContainText('Quantity: 2');
    await expect(row.getByTestId('text-card-message-little-wonder')).toContainText(savedGifts[0].message);
    const savedDate = new Intl.DateTimeFormat('en-KW', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${savedGifts[0].date}T00:00:00Z`));
    await expect(row.getByTestId('text-delivery-date-little-wonder')).toHaveText(savedDate);
    await expect(page.getByTestId('button-continue-checkout')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Confirm demo order' })).toHaveCount(0);
    const totalIncludingDelivery = availableTotal.replace(/(\d+(?:\.\d+)?) KWD$/, (_, amount) => `${(Number(amount) + 0.5).toFixed(3)} KWD`);
    await expect(page.getByTestId('cart-order-total')).toHaveText(`Order total${totalIncludingDelivery}`);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tawwa-cart') || '[]'))).toEqual(savedGifts);

    await page.reload();
    await expect(page.getByTestId('cart-unavailable-little-wonder')).toBeVisible();
    await expect(page.getByTestId('text-card-message-little-wonder')).toContainText(savedGifts[0].message);
    await page.getByTestId('button-cart-remove-little-wonder').click();
    await expect(page.getByTestId('cart-unavailable-notice')).toHaveCount(0);
    await expect(page.getByTestId('button-continue-checkout')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tawwa-cart') || '[]'))).toEqual([savedGifts[1]]);
    await page.getByTestId('button-continue-checkout').click();
    await expect(page.getByTestId('review-gift-new-mom-moment')).toContainText(savedGifts[1].message);
  });
}

test('an entirely unavailable saved cart is not empty and can be removed in Arabic', async ({ page }) => {
  await page.route('**/api/catalog', route => route.fulfill({ json: { ...catalog, products: [] } }));
  await page.addInitScript(() => localStorage.setItem('tawwa-lang', 'ar'));
  await page.goto('/cart');
  await expect(page.getByTestId('cart-unavailable-notice')).toContainText('رسائلك وتواريخك ما زالت محفوظة');
  await expect(page.getByTestId('button-continue-checkout')).toBeDisabled();
  for (const gift of savedGifts) {
    await expect(page.getByTestId(`text-card-message-${gift.productId}`)).toContainText(gift.message);
    await expect(page.getByTestId(`text-delivery-date-${gift.productId}`)).not.toBeEmpty();
    await page.getByTestId(`button-cart-remove-${gift.productId}`).click();
  }
  await expect(page.getByRole('heading', { name: 'هديتك الجميلة تبدأ من هنا.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tawwa-cart') || '[]'))).toEqual([]);
});
