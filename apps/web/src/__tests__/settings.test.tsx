import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { SettingsPage } from "@/pages/settings";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      success: true,
      data: { aiProvider: null, aiApiKeyMasked: null, aiModel: null },
    }),
    put: vi.fn().mockResolvedValue({ success: true }),
    post: vi.fn().mockResolvedValue({ success: true, data: { message: "OK" } }),
  },
}));

// Mock auth to provide a user
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual("@/lib/auth");
  return {
    ...actual,
    useAuth: () => ({
      user: { id: "1", name: "Teste", email: "teste@email.com" },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar título da página", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });

  it("deve renderizar card de perfil", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText("Perfil")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  it("deve renderizar card de configuração de IA", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText("Configuração de IA")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Chave de API")).toBeInTheDocument();
  });

  it("deve renderizar botões de ação", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole("button", { name: "Salvar Perfil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar Configurações de IA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Testar Conexão" })).toBeInTheDocument();
  });
});
