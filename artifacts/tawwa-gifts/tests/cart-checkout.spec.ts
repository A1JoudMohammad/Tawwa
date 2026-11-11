import { expect, test } from '@playwright/test';

const formatDate = (value: string) => new Intl.DateTimeFormat('en-KW', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00.000Z`));

test.beforeEach(async ({ page }) => {
  await page.route('**/api/payments/config', route => route.fulfill({
    json: { deliveryFee: 0.5, currency: 'usd', kwdToChargeRate: 3.221725, kwdToChargeRateDate: '2026-11-11', testMode: true },
  }));
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
  })).toEqual(gifts.map(gift => expect.objectContaining({
    productId: gift.id,
    quantity: 1,
    message: gift.message,
    date: gift.date,
    acknowledgedPrice: expect.any(Number),
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
  await expect(page.getByTestId('checkout-charge-estimate')).toContainText('USD');
});

test('cart shows the exact USD test total alongside KWD prices', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tawwa-cart', JSON.stringify([{
      productId: 'little-wonder',
      quantity: 1,
      message: '',
      date: '',
      acknowledgedPrice: 18.5,
    }]));
  });
  await page.goto('/cart');
  const estimate = page.getByTestId('payment-charge-estimate');
  await expect(estimate).toContainText('USD');
  await expect(estimate).toContainText('61.21');
  await expect(estimate).toContainText('3.221725');
});
