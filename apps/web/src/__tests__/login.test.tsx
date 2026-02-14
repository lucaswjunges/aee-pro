import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { LoginPage } from "@/pages/login";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  it("deve renderizar formulário de login", () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByText("AEE+ PRO")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("deve ter link para registro", () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByText("Criar conta")).toHaveAttribute("href", "/register");
  });
});
