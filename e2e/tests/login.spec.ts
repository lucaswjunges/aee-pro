import { test, expect } from "@playwright/test";

test.describe("Fluxo de autenticação", () => {
  const email = `e2e-${Date.now()}@teste.com`;
  const password = "senha123";
  const name = "Usuário E2E";

  test("deve exibir página de login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("AEE+ PRO")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
  });

  test("deve registrar novo usuário e redirecionar", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Nome").fill(name);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Criar Conta" }).click();

    await expect(page).toHaveURL("/", { timeout: 5000 });
    await expect(page.getByText("Olá")).toBeVisible();
  });

  test("deve fazer login com usuário existente", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL("/", { timeout: 5000 });
    await expect(page.getByText("Olá")).toBeVisible();
  });
});
