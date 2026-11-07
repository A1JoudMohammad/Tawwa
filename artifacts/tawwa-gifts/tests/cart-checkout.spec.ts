import { expect, test } from '@playwright/test';

const formatDate = (value: string) => new Intl.DateTimeFormat('en-KW', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00.000Z`));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tawwa-intro-seen', 'yes');
  });
});

test('gift messages and delivery dates stay with each box through reload and checkout review', async ({ page }) => {
  const gifts = [
    {
      id: 'little-wonder',
      message: 'For your very big little day!',
      date: '2027-01-14',
    },
    {
      id: 'new-mom-moment',
      message: 'A little care, just for you.',
      date: '2027-02-20',
    },
  ];

  for (const gift of gifts) {
    await page.goto(`/product/${gift.id}`);
    await page.getByTestId(`input-card-message-${gift.id}`).fill(gift.message);
    await page.getByTestId(`input-delivery-date-${gift.id}`).fill(gift.date);
    await page.getByTestId(`button-add-to-cart-${gift.id}`).click();
  }

  await page.goto('/cart');
  for (const gift of gifts) {
    await expect(page.getByTestId(`text-card-message-${gift.id}`)).toContainText(gift.message);
    await expect(page.getByTestId(`text-delivery-date-${gift.id}`)).toHaveText(formatDate(gift.date));
  }

  await expect.poll(() => page.evaluate(() => {
    return JSON.parse(localStorage.getItem('tawwa-cart') || '[]');
  })).toEqual(gifts.map(gift => ({
    productId: gift.id,
    quantity: 1,
    message: gift.message,
    date: gift.date,
  })));

  await page.reload();
  for (const gift of gifts) {
    await expect(page.getByTestId(`text-card-message-${gift.id}`)).toContainText(gift.message);
    await expect(page.getByTestId(`text-delivery-date-${gift.id}`)).toHaveText(formatDate(gift.date));
  }

  await page.getByTestId('button-continue-checkout').click();
  const review = page.getByTestId('checkout-gift-review');
  for (const gift of gifts) {
    const reviewItem = page.getByTestId(`review-gift-${gift.id}`);
    await expect(reviewItem).toBeVisible();
    await expect(reviewItem.getByTestId(`text-card-message-${gift.id}`)).toContainText(gift.message);
    await expect(reviewItem.getByTestId(`text-delivery-date-${gift.id}`)).toHaveText(formatDate(gift.date));
  }
  await expect(review.getByTestId('review-gift-little-wonder')).toContainText(gifts[0].message);
  await expect(review.getByTestId('review-gift-new-mom-moment')).toContainText(gifts[1].message);
});
