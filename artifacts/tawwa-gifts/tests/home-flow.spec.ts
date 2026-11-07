import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'),
) as {
  occasions: { id: string; name: string; ar: string }[];
  products: { id: string; occasion: string }[];
};
const availableOccasions = catalog.occasions.filter(occasion =>
  catalog.products.some(product => product.occasion === occasion.id),
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tawwa-intro-seen', 'yes');
  });
});

test('English home flow reveals the prompt and shows only matching gifts', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('button-occasion-kids')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'What are you celebrating?' })).toHaveCount(0);
  await page.evaluate(() => {
    const hero = document.querySelector('.hero');
    window.scrollTo(0, (hero?.getBoundingClientRect().top ?? 0) + window.scrollY + 180);
  });
  await expect(page.getByRole('status').filter({ hasText: 'What are you celebrating?' })).toBeVisible();

  const beforeSelection = await page.evaluate(() => window.scrollY);
  await page.getByTestId('button-occasion-kids').click();

  const results = page.locator('#occasion-products');
  await expect(results.locator('#home-products-title')).toHaveText('Kids’ Birthday');
  await expect(page.getByTestId('button-occasion-kids')).toHaveAttribute('aria-pressed', 'true');
  const expectedIds = catalog.products.filter(product => product.occasion === 'kids').map(product => product.id);
  await expect(results.locator('[data-testid^="card-product-"]')).toHaveCount(expectedIds.length);
  for (const id of expectedIds) await expect(page.getByTestId(`card-product-${id}`)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeSelection);
  await expect(results.locator('#home-products-title')).toBeInViewport();
});

for (const language of [
  {
    label: 'English',
    lang: 'en',
    previous: 'Previous occasion',
    next: 'Next occasion',
    dotsLabel: 'Choose an occasion slide',
    keyboardAdvance: 'ArrowRight',
  },
  {
    label: 'Arabic',
    lang: 'ar',
    previous: 'المناسبة السابقة',
    next: 'المناسبة التالية',
    dotsLabel: 'اختر شريحة المناسبة',
    keyboardAdvance: 'ArrowLeft',
  },
]) {
  test(`${language.label} occasion controls and keyboard navigation stay in sync`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem('tawwa-lang', lang), language.lang);
    await page.goto('/');

    const controls = page.getByRole('group', { name: language.dotsLabel });
    const dots = controls.getByRole('button');
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');

    const next = page.getByTestId('button-occasion-next');
    const previous = page.getByTestId('button-occasion-previous');
    await expect(next).toHaveAccessibleName(language.next);
    await expect(previous).toHaveAccessibleName(language.previous);

    await next.click();
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
    await previous.click();
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');

    const lastDot = dots.nth(availableOccasions.length - 1);
    await lastDot.click();
    await expect(lastDot).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('button-occasion-kids').focus();
    await page.keyboard.press(language.keyboardAdvance);
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  });
}

test('reduced motion and a narrow Arabic viewport keep selection usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('tawwa-lang', 'ar');
    const original = Element.prototype.scrollIntoView;
    (window as typeof window & { scrollIntoViewCalls?: ScrollIntoViewOptions[] }).scrollIntoViewCalls = [];
    Element.prototype.scrollIntoView = function (options) {
      (window as typeof window & { scrollIntoViewCalls?: ScrollIntoViewOptions[] }).scrollIntoViewCalls?.push(options ?? {});
      original?.call(this, options);
    };
  });
  await page.goto('/');

  await expect(page.locator('.intro-overlay')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect.poll(() => page.locator('html').evaluate(element => getComputedStyle(element).scrollBehavior)).toBe('auto');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.evaluate(() => {
    const hero = document.querySelector('.hero');
    window.scrollTo(0, (hero?.getBoundingClientRect().top ?? 0) + window.scrollY + 180);
  });
  await expect(page.getByRole('status').filter({ hasText: 'ما المناسبة التي تحتفل بها؟' })).toBeVisible();
  await page.getByTestId('button-occasion-newborn').click();

  const results = page.locator('#occasion-products');
  await expect(results.locator('#home-products-title')).toHaveText('الأم والمولود الجديد');
  const matchingIds = catalog.products.filter(product => product.occasion === 'newborn').map(product => product.id);
  await expect(results.locator('[data-testid^="card-product-"]')).toHaveCount(matchingIds.length);
  for (const id of matchingIds) await expect(page.getByTestId(`card-product-${id}`)).toBeVisible();

  const scrollOptions = await page.evaluate(() => {
    return (window as typeof window & { scrollIntoViewCalls?: ScrollIntoViewOptions[] }).scrollIntoViewCalls ?? [];
  });
  expect(scrollOptions.at(-1)).toMatchObject({ behavior: 'auto', block: 'start' });
  await expect(results.locator('#home-products-title')).toBeInViewport();
});
