// Proves the isolated e2e stack is wired: backend health, the Vite proxy to
// it, and a browser session created through the API.
import { test, expect, api, uniqueEmail } from "./fixtures";
import { API_URL } from "./support/stack";

test("stack: backend healthy, signup through the proxy signs the browser in", async ({ page, request }) => {
  const health = await request.get(`${API_URL}/healthz`);
  expect(health.status()).toBe(200);
  expect(await health.text()).toBe("ok");

  await api(page.request).signupAndLogin(uniqueEmail("smoke"));
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).name).toBe("E2E Tester");

  await page.goto("/stylebook");
  await expect(page).toHaveURL(/\/stylebook$/);
});
