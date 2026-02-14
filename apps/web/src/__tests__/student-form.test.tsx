import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudentForm } from "@/components/students/student-form";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ success: true }),
    put: vi.fn().mockResolvedValue({ success: true }),
  },
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
}

describe("StudentForm", () => {
  it("deve renderizar seção de Identificação", () => {
    renderWithRouter(<StudentForm />);
    expect(screen.getByText("Identificação")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo *")).toBeInTheDocument();
    expect(screen.getByLabelText("Data de nascimento")).toBeInTheDocument();
    expect(screen.getByLabelText("Ano/Série")).toBeInTheDocument();
    expect(screen.getByLabelText("Escola")).toBeInTheDocument();
  });

  it("deve renderizar seção de Diagnóstico", () => {
    renderWithRouter(<StudentForm />);
    expect(screen.getByLabelText("Diagnóstico")).toBeInTheDocument();
    expect(screen.getByLabelText("CID")).toBeInTheDocument();
    expect(screen.getByLabelText("Classificação")).toBeInTheDocument();
    expect(screen.getByLabelText("Medicamentos")).toBeInTheDocument();
  });

  it("deve renderizar seção de Família", () => {
    renderWithRouter(<StudentForm />);
    expect(screen.getByText("Família")).toBeInTheDocument();
    expect(screen.getByLabelText("Responsável principal")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da mãe")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do pai")).toBeInTheDocument();
  });

  it("deve renderizar seção de Desenvolvimento", () => {
    renderWithRouter(<StudentForm />);
    expect(screen.getByText("Desenvolvimento")).toBeInTheDocument();
    expect(screen.getByLabelText("Motor")).toBeInTheDocument();
    expect(screen.getByLabelText("Linguagem")).toBeInTheDocument();
    expect(screen.getByLabelText("Cognitivo")).toBeInTheDocument();
    expect(screen.getByLabelText("Leitura")).toBeInTheDocument();
  });

  it("deve renderizar seção de AEE", () => {
    renderWithRouter(<StudentForm />);
    expect(screen.getByText("AEE - Atendimento Educacional Especializado")).toBeInTheDocument();
    expect(screen.getByLabelText("Professor(a) AEE")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de atendimento")).toBeInTheDocument();
    expect(screen.getByLabelText("Dificuldades iniciais")).toBeInTheDocument();
    expect(screen.getByLabelText("Potencialidades")).toBeInTheDocument();
  });

  it("deve mostrar botão Cadastrar para novo aluno", () => {
    renderWithRouter(<StudentForm />);
    expect(screen.getByRole("button", { name: "Cadastrar Aluno" })).toBeInTheDocument();
  });

  it("deve mostrar botão Salvar Alterações para edição", () => {
    const student = {
      id: "1",
      userId: "u1",
      name: "João Teste",
      dateOfBirth: "2015-01-01",
      grade: "3º ano",
      school: "Escola ABC",
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    } as any;
    renderWithRouter(<StudentForm student={student} />);
    expect(screen.getByRole("button", { name: "Salvar Alterações" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("João Teste")).toBeInTheDocument();
  });
});
