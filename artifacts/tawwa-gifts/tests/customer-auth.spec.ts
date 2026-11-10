import { expect, test } from "@playwright/test";

const testUser = {
  id: "customer-test-id",
  aud: "authenticated",
  role: "authenticated",
  email: "shopper@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

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
        user: testUser,
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

test("new customers can sign up and are prompted to confirm their email", async ({ page }) => {
  await page.route("**/auth/v1/signup*", async route => {
    const request = route.request().postDataJSON();
    expect(request.email).toBe("newshopper@example.test");
    expect(request.password).toBe("strong-password-123");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...testUser,
        id: "new-customer-test-id",
        email: request.email,
        confirmation_sent_at: "2026-01-01T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/account");
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create an account." })).toBeVisible();
  await page.locator('input[name="email"]').fill("newshopper@example.test");
  await page.locator('input[name="password"]').fill("strong-password-123");
  await page.locator('input[name="confirmPassword"]').fill("strong-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("Check your inbox");
  await expect(page.locator('input[name="password"]')).toHaveValue("");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});
