import { expect, type Locator, type Page } from '@playwright/test';
import type { Catalog, CatalogProduct } from '@workspace/api-client-react';

// Deliberately independent of catalog.json: existing IDs have changed values,
// new IDs prove API-only entries work, and ordering is not alphabetical.
export const apiCatalog: Catalog = {
  occasions: [
    { id: 'retirement', name: 'Fresh adventures', ar: 'مغامرات جديدة', icon: 'sun' },
    { id: 'kids', name: 'Small celebrations', ar: 'احتفالات صغيرة', icon: 'gift' },
  ],
  products: [
    {
      id: 'z-api-only', occasion: 'retirement', name: 'API evening box', ar: 'صندوق المساء الجديد',
      description: 'An API-only evening selection.', descriptionAr: 'مختارات مسائية جديدة من المتجر.',
      contents: ['Evening tea', 'Blue notebook'], contentsAr: ['شاي المساء', 'دفتر أزرق'],
      price: 23.125, idealFor: 'For fresh adventures', idealForAr: 'للمغامرات الجديدة',
      delivery: 'Same-day delivery until 6 PM', deliveryAr: 'توصيل في نفس اليوم حتى السادسة',
    },
    {
      id: 'little-wonder', occasion: 'kids', age: '7-12',
      name: 'API creative afternoon', ar: 'وقت الإبداع الجديد',
      description: 'A changed creative kit from the API.', descriptionAr: 'مجموعة إبداع محدثة من المتجر.',
      contents: ['Watercolour set', 'Sketch pad'], contentsAr: ['ألوان مائية', 'دفتر رسم'],
      // This used to be under 25 in the bundle. The quiz must use this price.
      price: 41.875, idealFor: 'Young artists aged 7–12', idealForAr: 'للفنانين الصغار من ٧ إلى ١٢',
      delivery: 'Tonight, order before 5 PM', deliveryAr: 'الليلة عند الطلب قبل الخامسة',
    },
    {
      id: 'a-api-only', occasion: 'retirement', name: 'API morning box', ar: 'صندوق الصباح الجديد',
      description: 'A second API-only selection.', descriptionAr: 'مختارات صباحية جديدة من المتجر.',
      contents: ['Coffee beans'], contentsAr: ['حبوب القهوة'],
      price: 22.625, idealFor: 'Slow mornings', idealForAr: 'لصباح هادئ',
      delivery: 'Tonight, order before 5 PM', deliveryAr: 'الليلة عند الطلب قبل الخامسة',
    },
  ],
  governorates: ['Test delivery area'],
};

export type Language = 'en' | 'ar';

export async function prepareCatalogPage(page: Page, lang: Language = 'en') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(language => {
    localStorage.setItem('tawwa-intro-seen', 'yes');
    localStorage.setItem('tawwa-lang', language);
  }, lang);
  // Never read or mutate Supabase; unexpected catalog requests are intercepted too.
  await page.route('**/api/catalog', route => route.fulfill({ json: apiCatalog }));
}

export async function expectCards(scope: Locator, products: CatalogProduct[], lang: Language) {
  const cards = scope.locator('[data-testid^="card-product-"]');
  await expect(cards).toHaveCount(products.length);
  await expect.poll(() => cards.evaluateAll(elements => elements.map(el => el.getAttribute('data-testid'))))
    .toEqual(products.map(p => `card-product-${p.id}`));
  for (const product of products) {
    const card = scope.getByTestId(`card-product-${product.id}`);
    await expect(card.locator('h3')).toHaveText(lang === 'ar' ? product.ar : product.name);
    await expect(card.locator('p.muted')).toHaveText(lang === 'ar' ? product.descriptionAr : product.description);
    await expect(card.locator('.price')).toHaveText(`${product.price.toFixed(3)} KWD`);
  }
}

export async function finishFinder(page: Page, lang: Language, occasion: string, budget: 'under' | 'over') {
  const next = lang === 'ar' ? 'التالي' : 'Next';
  await page.getByRole('button', { name: occasion, exact: true }).click();
  await page.getByRole('button', { name: next, exact: true }).click();
  await page.getByRole('button', { name: lang === 'ar' ? 'صديق أو فرد من العائلة' : 'A friend or family', exact: true }).click();
  await page.getByRole('button', { name: next, exact: true }).click();
  const budgetLabel = budget === 'over'
    ? (lang === 'ar' ? 'أكثر من ٣٥ د.ك' : 'Over 35 KWD')
    : (lang === 'ar' ? 'أقل من ٢٥ د.ك' : 'Under 25 KWD');
  await page.getByRole('button', { name: budgetLabel, exact: true }).click();
  await page.getByRole('button', { name: next, exact: true }).click();
  await page.getByLabel(lang === 'ar' ? 'تاريخ التوصيل' : 'Delivery date').fill('2030-01-01');
  await page.getByRole('button', { name: lang === 'ar' ? 'اعرض الهدايا' : 'Show my gifts', exact: true }).click();
}
