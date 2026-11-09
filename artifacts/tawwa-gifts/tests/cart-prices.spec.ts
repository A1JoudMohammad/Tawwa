import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Catalog } from '@workspace/api-client-react';

const catalog = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')) as Catalog;
const product = catalog.products.find(p => p.id === 'little-wonder')!;
const saved = {
  productId: product.id, quantity: 2, message: 'A special surprise!',
  date: '2027-01-14', acknowledgedPrice: product.price,
};
const fmt = (price: number) => `${price.toFixed(3)} KWD`;
const savedDate = new Intl.DateTimeFormat('en-KW', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${saved.date}T00:00:00Z`));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(item => {
    localStorage.setItem('tawwa-intro-seen', 'yes');
    if (localStorage.getItem('tawwa-cart') === null) {
      localStorage.setItem('tawwa-cart', JSON.stringify([item]));
    }
  }, saved);
});

for (const delta of [5, -5]) {
  test(`saved-cart reload requires review of a price ${delta > 0 ? 'increase' : 'decrease'}`, async ({ page }) => {
    const price = product.price + delta;
    await page.route('**/api/catalog', route => route.fulfill({
      json: { ...catalog, products: catalog.products.map(p => p.id === product.id ? { ...p, price } : p) },
    }));
    await page.goto('/cart');
    const notice = page.getByTestId('cart-price-change-notice');
    await expect(notice).toContainText(`Previously ${fmt(product.price)} → Now ${fmt(price)} per box`);
    await expect(notice).toContainText(`Updated order total: ${fmt(price * saved.quantity)}`);
    await expect(page.getByTestId('text-card-message-little-wonder')).toContainText(saved.message);
    await expect(page.getByTestId('text-delivery-date-little-wonder')).toHaveText(savedDate);
    await page.reload();
    await expect(notice).toBeVisible();
    await page.getByTestId('button-continue-checkout').click();
    await expect(page.getByTestId('button-confirm-order')).toBeDisabled();
    await page.getByTestId('button-accept-prices').click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId('button-confirm-order')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tawwa-cart') || '[]')))
      .toEqual([{ ...saved, acknowledgedPrice: price }]);
    await page.reload();
    await expect(notice).toHaveCount(0);
  });
}

test('a refresh during checkout blocks even form submission until the new total is reviewed', async ({ page }) => {
  let price = product.price;
  await page.route('**/api/catalog', route => route.fulfill({
    json: { ...catalog, products: catalog.products.map(p => p.id === product.id ? { ...p, price } : p) },
  }));
  await page.clock.install();
  await page.goto('/cart');
  await expect(page.getByTestId('cart-price-change-notice')).toHaveCount(0);
  await page.getByTestId('button-continue-checkout').click();
  await page.locator('#checkout-name').fill('Price Review Test');
  await page.locator('#checkout-phone').fill('55555555');
  await page.locator('#checkout-area').selectOption({ index: 1 });
  await page.locator('#checkout-address').fill('Test block 2 street 3');
  price += 4;
  await page.clock.fastForward(60_001);
  await expect(page.getByTestId('cart-price-change-notice')).toBeVisible();
  await expect(page.getByTestId('button-confirm-order')).toBeDisabled();
  await expect(page.locator('#checkout-name')).toHaveValue('Price Review Test');
  await expect(page.getByTestId('review-gift-little-wonder')).toContainText(saved.message);
  await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.getByRole('heading', { name: 'Your gift is on its way.' })).toHaveCount(0);
  await page.getByTestId('button-accept-prices').click();
  // Accepting one revision must not accept a later catalog revision.
  price += 1;
  await page.clock.fastForward(60_001);
  await expect(page.getByTestId('button-confirm-order')).toBeDisabled();
  await page.getByTestId('button-accept-prices').click();
  await expect(page.locator('#checkout-address')).toHaveValue('Test block 2 street 3');
  await page.getByTestId('button-confirm-order').click();
  await expect(page.getByRole('heading', { name: 'Your gift is on its way.' })).toBeVisible();
});

for (const acknowledgedPrice of [undefined, 'invalid', null, -10]) {
  test(`legacy or invalid saved price ${String(acknowledgedPrice)} requires review in Arabic`, async ({ page }) => {
    await page.route('**/api/catalog', route => route.fulfill({ json: catalog }));
    await page.addInitScript(item => {
      localStorage.setItem('tawwa-lang', 'ar');
      localStorage.setItem('tawwa-cart', JSON.stringify([item]));
    }, { ...saved, acknowledgedPrice });
    await page.goto('/cart');
    await expect(page.getByTestId('cart-price-change-notice')).toContainText('السعر السابق غير محفوظ');
    await expect(page.getByTestId('cart-price-change-notice')).toContainText(fmt(product.price * 2));
    await page.getByTestId('button-accept-prices').click();
    await expect(page.getByTestId('cart-price-change-notice')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tawwa-cart') || '[]')))
      .toEqual([saved]);
  });
}

test('changing quantity or adding another copy does not silently acknowledge a price change', async ({ page }) => {
  const price = product.price + 6;
  await page.route('**/api/catalog', route => route.fulfill({
    json: { ...catalog, products: catalog.products.map(p => p.id === product.id ? { ...p, price } : p) },
  }));
  await page.goto(`/product/${product.id}`);
  await page.getByTestId(`button-add-to-cart-${product.id}`).click();
  await page.getByTestId('link-toast-action').click();
  await expect(page.getByTestId('cart-price-change-notice')).toContainText(fmt(price * 3));
  await page.getByTestId(`button-cart-increase-${product.id}`).click();
  await expect(page.getByTestId('cart-price-change-notice')).toContainText(fmt(price * 4));
  await page.getByTestId(`button-cart-remove-${product.id}`).click();
  await expect(page.getByTestId('cart-price-change-notice')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A lovely gift goes here.' })).toBeVisible();
});
