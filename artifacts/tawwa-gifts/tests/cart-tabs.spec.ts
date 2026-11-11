import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Catalog } from '@workspace/api-client-react';

const catalog = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')) as Catalog;
const gifts = [
  { productId: 'little-wonder', quantity: 2, message: 'Happy birthday!', date: '2027-01-14', acknowledgedPrice: 1 },
  { productId: 'new-mom-moment', quantity: 1, message: 'A little care for you.', date: '2027-02-20',
    acknowledgedPrice: catalog.products.find(p => p.id === 'new-mom-moment')!.price },
];
const readCart = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tawwa-cart') || '[]'));
const expectPersonalization = async (page: Page) => {
  await expect(page.getByTestId('text-card-message-new-mom-moment')).toContainText(gifts[1].message);
  const date = new Intl.DateTimeFormat('en-KW', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${gifts[1].date}T00:00:00Z`));
  await expect(page.getByTestId('text-delivery-date-new-mom-moment')).toHaveText(date);
};

test.beforeEach(async ({ context, page }) => {
  await context.route('**/api/payments/config', route => route.fulfill({
    json: { deliveryFee: 0.5, currency: 'usd', kwdToChargeRate: 3.221725, kwdToChargeRateDate: '2026-11-11', testMode: true },
  }));
  await context.route('**/api/catalog', route => route.fulfill({
    json: { ...catalog, products: catalog.products.filter(p => p.id !== 'little-wonder') },
  }));
  await context.addInitScript(() => {
    localStorage.setItem('tawwa-intro-seen', 'yes');
    // Count actual writes, including any accidental echo from storage listeners.
    const original = Storage.prototype.setItem;
    (window as any).cartWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tawwa-cart') (window as any).cartWrites++;
      return original.call(this, key, value);
    };
  });
  await page.goto('/cart');
  await page.evaluate(items => {
    localStorage.setItem('tawwa-cart', JSON.stringify(items));
    window.dispatchEvent(new Event('tawwa-cart-update'));
    (window as any).cartWrites = 0;
  }, gifts);
});

test('two tabs share removal and quantity edits without echo writes or losing personalization', async ({ context, page }) => {
  const other = await context.newPage();
  await other.goto('/cart');
  await expect(other.getByTestId('cart-unavailable-little-wonder')).toBeVisible();
  await page.getByTestId('button-cart-remove-little-wonder').click();
  await expect(other.getByTestId('cart-unavailable-little-wonder')).toHaveCount(0);
  await expectPersonalization(other);
  await other.getByTestId('button-cart-increase-new-mom-moment').click();
  await expect(page.locator('.qty')).toContainText('2');
  await expectPersonalization(page);
  await page.getByTestId('button-cart-decrease-new-mom-moment').click();
  await expect(other.locator('.qty')).toContainText('1');
  expect(await readCart(other)).toEqual([gifts[1]]);
  expect(await page.evaluate(() => (window as any).cartWrites)).toBe(2);
  expect(await other.evaluate(() => (window as any).cartWrites)).toBe(1);
  await other.reload();
  await expectPersonalization(other);
  expect(await readCart(page)).toEqual([gifts[1]]);
  expect(await page.evaluate(() => (window as any).cartWrites)).toBe(2);
  expect(await other.evaluate(() => (window as any).cartWrites)).toBe(0);
});

test('checkout clears both tabs and a later edit cannot revive the old cart', async ({ context, page }) => {
  const orderId = '00000000-0000-4000-8000-000000000002';
  const sessionId = 'cs_test_cart_tabs_session';
  const product = catalog.products.find(item => item.id === 'new-mom-moment')!;
  const chargeTotal = (
    Math.round(product.price * 3.221725 * 100) +
    Math.round(0.5 * 3.221725 * 100)
  ) / 100;
  await context.route('**/api/payments/checkout', route => route.fulfill({
    json: {
      checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
      orderId,
    },
  }));
  await context.route('https://checkout.stripe.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<title>Stripe test checkout</title>',
  }));
  await context.route('**/api/payments/order-status', route => route.fulfill({
    json: {
      orderId,
      status: 'paid',
      currency: 'kwd',
      subtotal: product.price,
      deliveryFee: 0.5,
      total: product.price + 0.5,
      chargeCurrency: 'usd',
      chargeTotal,
      items: [{
        productId: product.id,
        name: product.name,
        nameAr: product.ar,
        quantity: 1,
        unitPrice: product.price,
        message: gifts[1].message,
        date: gifts[1].date,
      }],
    },
  }));
  const other = await context.newPage();
  await other.goto('/cart');
  await page.getByTestId('button-cart-remove-little-wonder').click();
  await expect(other.getByTestId('cart-unavailable-little-wonder')).toHaveCount(0);
  await page.getByTestId('button-continue-checkout').click();
  await page.locator('#checkout-email').fill('shopper@example.test');
  await page.locator('#checkout-name').fill('Gift Shopper');
  await page.locator('#checkout-phone').fill('55512345');
  await page.locator('#checkout-area').selectOption({ index: 1 });
  await page.locator('#checkout-address').fill('Kuwait, Block 1, Street 2, House 3');
  await page.getByTestId('button-confirm-order').click();
  await expect(page).toHaveURL(new RegExp(`checkout\\.stripe\\.com/c/pay/${sessionId}`));
  await page.goto(`/checkout/return?order_id=${orderId}&session_id=${sessionId}`);
  await expect(page.getByRole('heading', { name: 'Your gift is on its way.' })).toBeVisible();
  await expect(other.getByRole('heading', { name: 'A lovely gift goes here.' })).toBeVisible();
  expect(await other.evaluate(() => localStorage.getItem('tawwa-cart'))).toBe('[]');
  await other.goto('/product/new-mom-moment');
  await other.getByTestId('button-add-to-cart-new-mom-moment').click();
  const saved = await readCart(other);
  expect(saved).toEqual([expect.objectContaining({ productId: 'new-mom-moment', quantity: 1 })]);
  expect(saved[0].message).not.toBe(gifts[1].message);
  expect(saved[0].date).not.toBe(gifts[1].date);
  await page.goto('/cart');
  await expect(page.getByTestId('text-card-message-new-mom-moment')).not.toContainText(gifts[1].message);
  await expect(page.locator('.qty')).toContainText('1');
});

test('storage clear syncs, unrelated keys are ignored, and receiving updates never writes', async ({ context, page }) => {
  const other = await context.newPage();
  await other.goto('/cart');
  await other.evaluate(() => localStorage.setItem('unrelated', 'value'));
  await expect(page.getByTestId('cart-unavailable-little-wonder')).toBeVisible();
  await other.evaluate(() => localStorage.clear());
  await expect(page.getByRole('heading', { name: 'A lovely gift goes here.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tawwa-cart'))).toBeNull();
  expect(await page.evaluate(() => (window as any).cartWrites)).toBe(0);
  expect(await other.evaluate(() => (window as any).cartWrites)).toBe(0);
});

test('an edit in a tab with a delayed storage event uses the latest saved cart', async ({ context, page }) => {
  const other = await context.newPage();
  await other.goto('/cart');
  await expect(other.getByTestId('cart-unavailable-little-wonder')).toBeVisible();
  // Simulate a background tab that has not processed its storage event yet.
  await other.evaluate(() => window.addEventListener('storage', event => event.stopImmediatePropagation(), { capture: true }));
  await page.getByTestId('button-cart-remove-little-wonder').click();
  await other.getByTestId('button-cart-increase-new-mom-moment').click();
  await expect(other.getByTestId('cart-unavailable-little-wonder')).toHaveCount(0);
  await expect(page.locator('.qty')).toContainText('2');
  expect(await readCart(page)).toEqual([{ ...gifts[1], quantity: 2 }]);
  await expectPersonalization(other);
});
