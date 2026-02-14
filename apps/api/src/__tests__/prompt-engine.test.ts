import { describe, it, expect } from "vitest";
import { renderPrompt, buildStudentDataBlock } from "../lib/prompt-engine";

describe("renderPrompt", () => {
  it("deve substituir placeholders com dados do aluno", () => {
    const template = "Aluno: {{name}}, Série: {{grade}}, Diagnóstico: {{diagnosis}}";
    const student = { name: "João", grade: "3º ano", diagnosis: "TEA Nível 1" };
    const result = renderPrompt(template, student);
    expect(result).toBe("Aluno: João, Série: 3º ano, Diagnóstico: TEA Nível 1");
  });

  it("deve substituir campos vazios por 'não informado'", () => {
    const template = "Nome: {{name}}, CID: {{diagnosticoCid}}";
    const student = { name: "Maria", diagnosticoCid: "" };
    const result = renderPrompt(template, student);
    expect(result).toBe("Nome: Maria, CID: não informado");
  });

  it("deve substituir campos null por 'não informado'", () => {
    const template = "Nome: {{name}}, Escola: {{school}}";
    const student = { name: "Pedro", school: null };
    const result = renderPrompt(template, student);
    expect(result).toBe("Nome: Pedro, Escola: não informado");
  });

  it("deve substituir campos undefined por 'não informado'", () => {
    const template = "Nome: {{name}}, Turma: {{turma}}";
    const student = { name: "Ana" };
    const result = renderPrompt(template, student);
    expect(result).toBe("Nome: Ana, Turma: não informado");
  });

  it("deve lidar com template sem placeholders", () => {
    const template = "Texto fixo sem variáveis";
    const result = renderPrompt(template, { name: "Teste" });
    expect(result).toBe("Texto fixo sem variáveis");
  });

  it("deve substituir múltiplas ocorrências do mesmo campo", () => {
    const template = "{{name}} é aluno. O nome do aluno é {{name}}.";
    const result = renderPrompt(template, { name: "Lucas" });
    expect(result).toBe("Lucas é aluno. O nome do aluno é Lucas.");
  });

  it("deve converter valores numéricos para string", () => {
    const template = "Idade: {{maeIdade}}";
    const result = renderPrompt(template, { maeIdade: 35 });
    expect(result).toBe("Idade: 35");
  });
});

describe("buildStudentDataBlock", () => {
  it("deve gerar bloco formatado com dados do aluno", () => {
    const student = { name: "João", grade: "3º ano", school: "Escola ABC" };
    const result = buildStudentDataBlock(student);
    expect(result).toContain("- Nome: João");
    expect(result).toContain("- Ano/Série: 3º ano");
    expect(result).toContain("- Escola: Escola ABC");
  });

  it("deve mostrar 'não informado' para campos ausentes", () => {
    const student = { name: "Maria" };
    const result = buildStudentDataBlock(student);
    expect(result).toContain("- Nome: Maria");
    expect(result).toContain("- Escola: não informado");
  });
});
