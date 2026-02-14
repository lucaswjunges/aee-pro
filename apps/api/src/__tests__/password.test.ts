import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../lib/password";

describe("password", () => {
  it("deve gerar hash e verificar senha correta", async () => {
    const hash = await hashPassword("minha-senha-123");
    expect(hash).toContain(":");
    expect(await verifyPassword("minha-senha-123", hash)).toBe(true);
  });

  it("deve rejeitar senha incorreta", async () => {
    const hash = await hashPassword("senha-correta");
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });

  it("deve gerar hashes diferentes para mesma senha", async () => {
    const hash1 = await hashPassword("mesma-senha");
    const hash2 = await hashPassword("mesma-senha");
    expect(hash1).not.toBe(hash2);
  });

  it("deve rejeitar formato inválido de hash", async () => {
    expect(await verifyPassword("qualquer", "sem-separador")).toBe(false);
  });
});
