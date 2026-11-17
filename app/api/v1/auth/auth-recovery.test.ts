import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as forgotPasswordHandler } from "./forgot-password/route";
import { POST as resetPasswordHandler } from "./reset-password/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

describe("Auth Recovery API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("returns 400 if email is missing", async () => {
      const req = new NextRequest("http://localhost/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "" }),
      });
      const res = await forgotPasswordHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("И-мэйл хаягаа оруулна уу");
    });

    it("successfully calls resetPasswordForEmail", async () => {
      const mockReset = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          resetPasswordForEmail: mockReset,
        },
      } as any);

      const req = new NextRequest("http://localhost/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "beautytechllc24@gmail.com" }),
      });
      const res = await forgotPasswordHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockReset).toHaveBeenCalledWith(
        "beautytechllc24@gmail.com",
        expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback?next=/reset-password"),
        })
      );
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("validates password length", async () => {
      const req = new NextRequest("http://localhost/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ password: "123" }),
      });
      const res = await resetPasswordHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("6 тэмдэгттэй");
    });

    it("verifies OTP and updates password when email and token are provided", async () => {
      const mockVerifyOtp = vi.fn().mockResolvedValue({
        data: { session: { user: { id: "u-1" } } },
        error: null,
      });
      const mockUpdateUser = vi.fn().mockResolvedValue({
        data: { user: { id: "u-1" } },
        error: null,
      });

      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          verifyOtp: mockVerifyOtp,
          updateUser: mockUpdateUser,
        },
      } as any);

      const req = new NextRequest("http://localhost/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: "beautytechllc24@gmail.com",
          token: "123456",
          password: "new-secret-password-123",
        }),
      });

      const res = await resetPasswordHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: "beautytechllc24@gmail.com",
        token: "123456",
        type: "recovery",
      });
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "new-secret-password-123",
      });
    });
  });
});
