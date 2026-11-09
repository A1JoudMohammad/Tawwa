import { expect, test } from '@playwright/test';
import { apiCatalog, expectCards, finishFinder, prepareCatalogPage, type Language } from './fixtures/api-catalog';

for (const lang of ['en', 'ar'] as const satisfies readonly Language[]) {
  const occasionNames = apiCatalog.occasions.map(o => lang === 'ar' ? o.ar : o.name);

  test(`${lang}: Home renders API occasion order, product order and changed values`, async ({ page }) => {
    await prepareCatalogPage(page, lang);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('.occasion-label')).toHaveText(occasionNames);
    const results = page.locator('#occasion-products');
    await expectCards(results, apiCatalog.products, lang);
    await expect(page.getByTestId('button-occasion-newborn')).toHaveCount(0);
    await page.getByTestId('button-occasion-retirement').click();
    await expect(results.locator('h2')).toHaveText(occasionNames[0]);
    await expectCards(results, [apiCatalog.products[0], apiCatalog.products[2]], lang);
  });

  test(`${lang}: occasions uses API labels, ordering, prices and filters`, async ({ page }) => {
    await prepareCatalogPage(page, lang);
    await page.goto('/occasions');
    await expect(page.locator('.filter-group').first().locator('label')).toHaveText(occasionNames);
    await expectCards(page.locator('.shop-products'), apiCatalog.products, lang);
    await page.getByRole('radio', { name: occasionNames[1], exact: true }).check();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(occasionNames[1]);
    await expectCards(page.locator('.shop-products'), [apiCatalog.products[1]], lang);
    // Changed age/price must affect filtering, not only the displayed text.
    await page.getByRole('radio', { name: lang === 'ar' ? 'الأعمار ٧–١٢' : 'Ages 7–12', exact: true }).check();
    await expectCards(page.locator('.shop-products'), [apiCatalog.products[1]], lang);
    await page.getByRole('radio', { name: lang === 'ar' ? 'أقل من ٢٥ د.ك' : 'Under 25 KWD', exact: true }).check();
    await expect(page.locator('[data-testid^="card-product-"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: lang === 'ar' ? 'هل اخترت تفاصيل كثيرة؟' : 'A little too specific?' })).toBeVisible();
  });

  test(`${lang}: gift finder uses API choices, recommendation order and changed price`, async ({ page }) => {
    await prepareCatalogPage(page, lang);
    await page.goto('/gift-finder');
    await expect(page.locator('.choice')).toHaveText(occasionNames);
    await finishFinder(page, lang, occasionNames[0], 'under');
    await expectCards(page.locator('.shop-products'), [apiCatalog.products[0], apiCatalog.products[2]], lang);
    await page.getByRole('button', { name: lang === 'ar' ? 'ابدأ من جديد' : 'Start again', exact: true }).click();
    await finishFinder(page, lang, occasionNames[1], 'over');
    await expectCards(page.locator('.shop-products'), [apiCatalog.products[1]], lang);
    await page.getByRole('button', { name: lang === 'ar' ? 'ابدأ من جديد' : 'Start again', exact: true }).click();
    await finishFinder(page, lang, occasionNames[1], 'under');
    await expect(page.locator('[data-testid^="card-product-"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: lang === 'ar' ? 'تصفح المناسبات' : 'Browse occasions', exact: true })).toBeVisible();
  });

  test(`${lang}: product detail renders every changed bilingual API field`, async ({ page }) => {
    await prepareCatalogPage(page, lang);
    const product = apiCatalog.products[1];
    await page.goto(`/product/${product.id}`);
    const detail = page.locator('.product-detail');
    await expect(detail.locator('h1')).toHaveText(lang === 'ar' ? product.ar : product.name);
    await expect(detail.locator('.eyebrow')).toHaveText(occasionNames[1]);
    await expect(detail.locator('.price')).toHaveText('41.875 KWD');
    await expect(detail.locator('p.muted')).toHaveText(lang === 'ar' ? product.descriptionAr : product.description);
    await expect(detail.locator('.detail-benefit').nth(0)).toHaveText(lang === 'ar' ? product.idealForAr : product.idealFor);
    await expect(detail.locator('.detail-benefit').nth(1)).toHaveText(lang === 'ar' ? product.deliveryAr : product.delivery);
    await expect(detail.locator('.contents li')).toHaveText(lang === 'ar' ? product.contentsAr : product.contents);
    await expect(page.getByTestId(`button-add-to-cart-${product.id}`)).toBeEnabled();
  });
}

test('an API-only product opens from its card, while an omitted bundled product cannot be bought', async ({ page }) => {
  await prepareCatalogPage(page);
  await page.goto('/occasions');
  await page.getByTestId('card-product-z-api-only').getByRole('link', { name: 'API evening box', exact: true }).click();
  await expect(page).toHaveURL(/\/product\/z-api-only$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('API evening box');
  await expect(page.getByTestId('button-add-to-cart-z-api-only')).toBeEnabled();
  // This ID exists in the bundle, but is not in the available API products.
  await page.goto('/product/new-mom-moment');
  await expect(page.getByRole('heading', { name: '404 Page Not Found' })).toBeVisible();
  await expect(page.locator('[data-testid^="button-add-to-cart-"]')).toHaveCount(0);
  await expect(page.locator('.product-detail')).toHaveCount(0);
});

test('an empty API catalog does not restore bundled occasions or gifts on any discovery page', async ({ page }) => {
  await prepareCatalogPage(page);
  await page.route('**/api/catalog', route => route.fulfill({
    json: { ...apiCatalog, occasions: [], products: [] },
  }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose an occasion' })).toBeVisible();
  await expect(page.locator('[data-testid^="button-occasion-"]').filter({ hasText: 'See gifts' })).toHaveCount(0);
  await expect(page.locator('[data-testid^="card-product-"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'All occasions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little too specific?' })).toBeVisible();
  await expect(page.locator('input[name="occasion"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="card-product-"]')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Gift Finder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What’s the occasion?' })).toBeVisible();
  await expect(page.locator('.choice')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
});
