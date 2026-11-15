import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

describe("Broadcast [broadcastId] API route", () => {
  const mockUser = { id: "user-123" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PATCH /api/v1/broadcasts/[broadcastId]", () => {
    it("returns 401 if user is not authenticated", async () => {
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      } as any);

      const req = new NextRequest("http://localhost/api/v1/broadcasts/b-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated Name" }),
      });

      const res = await PATCH(req, {
        params: Promise.resolve({ broadcastId: "b-1" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Нэвтэрнэ үү");
    });

    it("updates broadcast name and message content successfully", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: "b-1",
          name: "Deep Shoot Promo Updated",
          message_content: { text: "Шинэ зурвасын агуулга" },
        },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });

      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "broadcasts") {
            return { update: mockUpdate };
          }
          return {};
        }),
      } as any);

      const req = new NextRequest("http://localhost/api/v1/broadcasts/b-1", {
        method: "PATCH",
        body: JSON.stringify({
          name: "Deep Shoot Promo Updated",
          messageContent: { text: "Шинэ зурвасын агуулга" },
        }),
      });

      const res = await PATCH(req, {
        params: Promise.resolve({ broadcastId: "b-1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("Deep Shoot Promo Updated");
      expect(data.message_content.text).toBe("Шинэ зурвасын агуулга");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Deep Shoot Promo Updated",
          message_content: { text: "Шинэ зурвасын агуулга" },
        })
      );
    });
  });

  describe("DELETE /api/v1/broadcasts/[broadcastId]", () => {
    it("returns 401 if user is not authenticated", async () => {
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      } as any);

      const req = new NextRequest("http://localhost/api/v1/broadcasts/b-1", {
        method: "DELETE",
      });

      const res = await DELETE(req, {
        params: Promise.resolve({ broadcastId: "b-1" }),
      });

      expect(res.status).toBe(401);
    });

    it("cleans up scheduled jobs, recipients, and deletes the broadcast", async () => {
      const mockJobsContains = vi.fn().mockResolvedValue({ error: null });
      const mockJobsDelete = vi.fn().mockReturnValue({ contains: mockJobsContains });

      const mockRecipientsEq = vi.fn().mockResolvedValue({ error: null });
      const mockRecipientsDelete = vi.fn().mockReturnValue({ eq: mockRecipientsEq });

      const mockBroadcastEq = vi.fn().mockResolvedValue({ error: null });
      const mockBroadcastDelete = vi.fn().mockReturnValue({ eq: mockBroadcastEq });

      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "scheduled_jobs") {
            return { delete: mockJobsDelete };
          }
          if (table === "broadcast_recipients") {
            return { delete: mockRecipientsDelete };
          }
          if (table === "broadcasts") {
            return { delete: mockBroadcastDelete };
          }
          return {};
        }),
      } as any);

      const req = new NextRequest("http://localhost/api/v1/broadcasts/b-1", {
        method: "DELETE",
      });

      const res = await DELETE(req, {
        params: Promise.resolve({ broadcastId: "b-1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deletedId).toBe("b-1");

      expect(mockJobsContains).toHaveBeenCalledWith("payload", { broadcastId: "b-1" });
      expect(mockRecipientsEq).toHaveBeenCalledWith("broadcast_id", "b-1");
      expect(mockBroadcastEq).toHaveBeenCalledWith("id", "b-1");
    });
  });
});
