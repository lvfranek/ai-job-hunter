import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidSessionCookie, sessionToken, verifyLogin } from "./auth";

function hashPassword(password: string): string {
  const salt = "testsalt";
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

describe("auth", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_EMAIL", "Me@Example.com");
    vi.stubEnv("AUTH_PASSWORD_HASH", hashPassword("secret"));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the right email and password, ignoring email case and whitespace", () => {
    expect(verifyLogin("me@example.com", "secret")).toBe(true);
    expect(verifyLogin("  ME@EXAMPLE.COM ", "secret")).toBe(true);
  });

  it("rejects a wrong email or a wrong password", () => {
    expect(verifyLogin("other@example.com", "secret")).toBe(false);
    expect(verifyLogin("me@example.com", "wrong")).toBe(false);
  });

  it("throws when AUTH_EMAIL is missing", () => {
    vi.stubEnv("AUTH_EMAIL", "");
    expect(() => verifyLogin("me@example.com", "secret")).toThrow("AUTH_EMAIL is not set");
  });

  it("invalidates sessions when the email changes", () => {
    const token = sessionToken();
    expect(isValidSessionCookie(token)).toBe(true);
    vi.stubEnv("AUTH_EMAIL", "new@example.com");
    expect(isValidSessionCookie(token)).toBe(false);
  });
});
