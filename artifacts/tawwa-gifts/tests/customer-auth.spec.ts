import { expect, test } from "@playwright/test";

test("customer sign-in persists on this device and sign-out clears the saved session", async ({ page }) => {
  await page.route("**/auth/v1/token*", async route => {
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "test-customer-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "test-customer-refresh-token",
        user: {
          id: "customer-test-id",
          aud: "authenticated",
          role: "authenticated",
          email: "shopper@example.test",
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      }),
    });
  });

  await page.goto("/account");
  await page.locator('input[name="email"]').fill("shopper@example.test");
  await page.locator('input[name="password"]').fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByText("shopper@example.test")).toBeVisible();
  await expect(page.locator(".account-nav-link")).toContainText("Account");
  await expect(page.locator(".account-signout")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();

  await page.locator(".account-card").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in." })).toBeVisible();
  await expect(page.locator(".account-signout")).toHaveCount(0);
});
