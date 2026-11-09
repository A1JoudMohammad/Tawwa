import { expect, test } from '@playwright/test';
import { apiCatalog, expectCards, prepareCatalogPage } from './fixtures/api-catalog';

for (const lang of ['en', 'ar'] as const) {
  const retryLabel = lang === 'ar' ? 'حاول مرة أخرى' : 'Try again';

  test(`${lang}: initial 503 retries automatically, shows no bundled fallback, and recovers on retry`, async ({ page }) => {
    await prepareCatalogPage(page, lang);
    let requests = 0;
    let recover = false;
    let releaseFirst!: () => void;
    const firstResponse = new Promise<void>(resolve => { releaseFirst = resolve; });
    await page.route('**/api/catalog', async route => {
      requests++;
      if (requests === 1) await firstResponse;
      await route.fulfill(recover
        ? { json: apiCatalog }
        : { status: 503, json: { error: 'The gift catalog is temporarily unavailable. Please try again.' } });
    });
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText(lang === 'ar' ? 'نجهز لك الهدايا' : 'Loading the gift boxes');
    await expect(page.locator('[data-testid^="card-product-"]')).toHaveCount(0);
    releaseFirst();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(lang === 'ar' ? 'الهدايا غير متاحة مؤقتاً.' : 'The gift boxes are temporarily unavailable.');
    expect(requests).toBe(2); // initial request plus the configured automatic retry
    await expect(page.locator('[data-testid^="card-product-"]')).toHaveCount(0);
    await expect(page.locator('.occasion-tile')).toHaveCount(0);
    recover = true;
    await alert.getByRole('button', { name: retryLabel, exact: true }).click();
    await expectCards(page.locator('#occasion-products'), apiCatalog.products, lang);
    await expect(alert).toHaveCount(0);
    expect(requests).toBe(3);
  });

  test(`${lang}: a failed polling refresh keeps stale gifts, warns, and recovers with changed data`, async ({ page }) => {
    await prepareCatalogPage(page, lang);
    let requests = 0;
    let failing = false;
    let response = apiCatalog;
    await page.route('**/api/catalog', route => {
      requests++;
      return route.fulfill(failing
        ? { status: 503, json: { error: 'Catalog unavailable' } }
        : { json: response });
    });
    await page.clock.install();
    await page.goto('/occasions');
    await expectCards(page.locator('.shop-products'), apiCatalog.products, lang);
    failing = true;
    await page.clock.fastForward(60_001);
    await expect.poll(() => requests).toBe(2);
    // Let the real query retry timer elapse; do not patch query internals.
    await page.clock.runFor(1_100);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(lang === 'ar'
      ? 'تعذر تحديث الهدايا. قد تكون التفاصيل المعروضة قديمة.'
      : 'Catalog refresh failed. The details shown may be out of date.');
    expect(requests).toBe(3);
    await expectCards(page.locator('.shop-products'), apiCatalog.products, lang);
    failing = false;
    response = {
      ...apiCatalog,
      products: [{ ...apiCatalog.products[1], name: 'Recovered API gift', ar: 'هدية محدثة بعد التعافي', price: 46.375 }],
    };
    await alert.getByRole('button', { name: retryLabel, exact: true }).click();
    await expectCards(page.locator('.shop-products'), response.products, lang);
    await expect(alert).toHaveCount(0);
    await expect(page.getByTestId('card-product-z-api-only')).toHaveCount(0);
    expect(requests).toBe(4);
  });
}
