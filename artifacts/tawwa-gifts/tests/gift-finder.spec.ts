import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'),
) as {
  products: { id: string; occasion: string; price: number }[];
};

async function completeQuiz(
  page: Page,
  answers: { occasion: string; recipient: string; budget: string },
) {
  await page.goto('/gift-finder');
  await page.getByRole('button', { name: answers.occasion, exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: answers.recipient, exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: answers.budget, exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Delivery date').fill('2030-01-01');
  await page.getByRole('button', { name: 'Show my gifts' }).click();
}

function productIdsMatching(occasion: string, recipient: string, budget: string) {
  const recipientOccasion =
    recipient === 'A kid' ? 'kids' :
      recipient === 'New mum or newborn' ? 'newborn' :
        recipient === 'Someone retiring' ? 'retirement' : '';

  return catalog.products
    .filter(product =>
      product.occasion === occasion
      && (!recipientOccasion || product.occasion === recipientOccasion)
      && (budget === 'Under 25 KWD'
        ? product.price < 25
        : budget === '25–35 KWD'
          ? product.price >= 25 && product.price <= 35
          : product.price > 35),
    )
    .map(product => product.id);
}

test('gift finder recommends boxes matching occasion, recipient, and budget', async ({ page }) => {
  const answers = {
    occasion: 'Kids’ Birthday',
    recipient: 'A kid',
    budget: 'Under 25 KWD',
  };
  await completeQuiz(page, answers);

  const matchingIds = productIdsMatching('kids', answers.recipient, answers.budget);
  const visibleIds = matchingIds.slice(0, 4);
  expect(visibleIds.length).toBeGreaterThan(0);
  const cards = page.locator('.shop-products [data-testid^="card-product-"]');
  await expect(cards).toHaveCount(visibleIds.length);
  for (const id of visibleIds) await expect(page.getByTestId(`card-product-${id}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Good picks. You’ve got this.' })).toBeVisible();
});

test('gift finder offers a useful browse link when the answers have no matches', async ({ page }) => {
  await completeQuiz(page, {
    occasion: 'Kids’ Birthday',
    recipient: 'Someone retiring',
    budget: 'Under 25 KWD',
  });

  await expect(page.getByText('We’re still curating that occasion. Browse all boxes for now.')).toBeVisible();
  const browseLink = page.getByRole('link', { name: 'Browse occasions' });
  await expect(browseLink).toBeVisible();
  await browseLink.click();
  await expect(page).toHaveURL(/\/occasions$/);
});

test('starting the quiz again clears completion and returns to a fresh first question', async ({ page }) => {
  await completeQuiz(page, {
    occasion: 'Kids’ Birthday',
    recipient: 'A kid',
    budget: 'Under 25 KWD',
  });

  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByRole('heading', { name: 'What’s the occasion?' })).toBeVisible();
  await expect(page.locator('.progress-track')).toHaveAttribute('aria-label', 'Step 1 of 4');
  await expect(page.locator('.choice.selected')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start again' })).toHaveCount(0);
});
