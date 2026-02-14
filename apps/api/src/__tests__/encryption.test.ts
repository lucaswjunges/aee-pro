import { describe, it, expect } from "vitest";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption";

const TEST_SECRET = "test-secret-key-for-vitest";

describe("encryption", () => {
  it("deve criptografar e descriptografar corretamente (round-trip)", async () => {
    const plaintext = "sk-abc123xyz789";
    const encrypted = await encrypt(plaintext, TEST_SECRET);
    const decrypted = await decrypt(encrypted, TEST_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  it("deve gerar ciphertext diferente para mesmo plaintext (IV aleatório)", async () => {
    const plaintext = "same-key-value";
    const enc1 = await encrypt(plaintext, TEST_SECRET);
    const enc2 = await encrypt(plaintext, TEST_SECRET);
    expect(enc1).not.toBe(enc2);
  });

  it("deve falhar ao descriptografar com secret errado", async () => {
    const encrypted = await encrypt("minha-chave", TEST_SECRET);
    await expect(decrypt(encrypted, "wrong-secret")).rejects.toThrow();
  });

  it("deve lidar com string vazia", async () => {
    const encrypted = await encrypt("", TEST_SECRET);
    const decrypted = await decrypt(encrypted, TEST_SECRET);
    expect(decrypted).toBe("");
  });

  it("deve lidar com strings longas", async () => {
    const longKey = "sk-" + "a".repeat(500);
    const encrypted = await encrypt(longKey, TEST_SECRET);
    const decrypted = await decrypt(encrypted, TEST_SECRET);
    expect(decrypted).toBe(longKey);
  });
});

describe("maskApiKey", () => {
  it("deve mascarar chave longa mostrando início e fim", () => {
    expect(maskApiKey("sk-abc123xyz789")).toBe("sk-a...z789");
  });

  it("deve retornar **** para chave curta (8 chars ou menos)", () => {
    expect(maskApiKey("12345678")).toBe("****");
    expect(maskApiKey("short")).toBe("****");
  });

  it("deve funcionar com chave de 9 caracteres", () => {
    expect(maskApiKey("123456789")).toBe("1234...6789");
  });
});
