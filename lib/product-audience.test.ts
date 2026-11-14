import { describe, it, expect, vi } from "vitest";
import {
  isPurchaseText,
  matchesProductKeywords,
  resolveProductAudience,
  PURCHASE_KEYWORDS,
  INQUIRY_KEYWORDS,
} from "./product-audience";

describe("product-audience", () => {
  describe("matchesProductKeywords", () => {
    it("matches exact product name case-insensitively", () => {
      expect(matchesProductKeywords("Сайн уу, deep shoot үнэ хэд вэ?", "deep shoot")).toBe(true);
      expect(matchesProductKeywords("DEEP SHOOT авах гэсэн юм", "deep shoot")).toBe(true);
      expect(matchesProductKeywords("Special sale Deep Shoot AA багц", "deep shoot")).toBe(true);
    });

    it("matches multi-word product when words are present in text", () => {
      expect(
        matchesProductKeywords("Бид deep төрлийн арьсны shoot бүтээгдэхүүн худалдаалж байна", "deep shoot")
      ).toBe(true);
    });

    it("returns false when product name is not present", () => {
      expect(matchesProductKeywords("CO2 Carboxy Gel авах", "deep shoot")).toBe(false);
      expect(matchesProductKeywords("", "deep shoot")).toBe(false);
      expect(matchesProductKeywords("Сайн байна уу", "")).toBe(false);
    });
  });

  describe("isPurchaseText", () => {
    it("detects Mongolian purchase keywords", () => {
      expect(isPurchaseText("Deep shoot хүргэлтээр авъя")).toBe(true);
      expect(isPurchaseText("Хаяг: Хүүхдийн 100, утас: 99112233")).toBe(true);
      expect(isPurchaseText("Данс руу 484,000 шилжүүлсэн")).toBe(true);
      expect(isPurchaseText("Захиалга өгье")).toBe(true);
      expect(isPurchaseText("Xvrgelteer awch boloxuu?")).toBe(true);
      expect(isPurchaseText("Таны захиалга хүргэлтэнд гарлаа")).toBe(true);
      expect(isPurchaseText("Deep shoot тарихад гадуур гарсан")).toBe(true);
    });

    it("detects English purchase keywords", () => {
      expect(isPurchaseText("I want to order deep shoot")).toBe(true);
      expect(isPurchaseText("Payment confirmed, paid")).toBe(true);
      expect(isPurchaseText("Delivery to my address")).toBe(true);
    });

    it("returns false for pure inquiries without purchase signals", () => {
      expect(isPurchaseText("Deep shoot үнэ хэд вэ?")).toBe(false);
      expect(isPurchaseText("Sainuu ? Deep shoot yamar uramshuulal bgaa ve?")).toBe(false);
      expect(isPurchaseText("Мэдээлэл авъя гэсэн юм")).toBe(false);
      expect(isPurchaseText("")).toBe(false);
    });
  });

  describe("resolveProductAudience", () => {
    it("returns empty result if productName is empty", async () => {
      const mockSupabase = {} as any;
      const res = await resolveProductAudience(mockSupabase, "ws-1", {
        enabled: true,
        productName: "   ",
        audienceType: "all",
      });

      expect(res.contactIds).toEqual([]);
      expect(res.contacts).toEqual([]);
    });

    it("returns empty result if no active Facebook channels found", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "channels") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string) => {
                if (col === "is_active") {
                  return Promise.resolve({ data: [] });
                }
                return { eq: vi.fn().mockReturnThis() };
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      } as any;

      const res = await resolveProductAudience(mockSupabase, "ws-1", {
        enabled: true,
        productName: "deep shoot",
        audienceType: "all",
      });

      expect(res.contactIds).toEqual([]);
    });

    it("resolves and categorizes contacts from local conversations", async () => {
      const mockChannels = [
        {
          id: "ch-fb-1",
          platform: "facebook",
          display_name: "Ribeskin Mongolia",
          late_account_id: "late-1",
          username: "ribeskin",
        },
      ];

      const mockConversations = [
        {
          id: "conv-1",
          contact_id: "contact-buyer",
          channel_id: "ch-fb-1",
          late_conversation_id: "late-conv-1",
          last_message_preview: "Deep shoot HL 1 set хүргэлтээр авъя",
          last_message_at: "2026-11-14T10:00:00Z",
          contacts: {
            id: "contact-buyer",
            display_name: "Oyuna",
            avatar_url: null,
            is_subscribed: true,
          },
        },
        {
          id: "conv-2",
          contact_id: "contact-inquiry",
          channel_id: "ch-fb-1",
          late_conversation_id: "late-conv-2",
          last_message_preview: "Deep shoot үнэ хэд вэ?",
          last_message_at: "2026-11-14T09:00:00Z",
          contacts: {
            id: "contact-inquiry",
            display_name: "Khaliunaa",
            avatar_url: null,
            is_subscribed: true,
          },
        },
      ];

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "channels") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: mockChannels }),
                  }),
                }),
              }),
            };
          }
          if (table === "workspaces") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { late_api_key_encrypted: null } }),
                }),
              }),
            };
          }
          if (table === "conversations") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: mockConversations }),
              }),
            };
          }
          if (table === "comment_logs") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
            };
          }
          if (table === "tags") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [] }),
              }),
            };
          }
          if (table === "contact_custom_fields") {
            return {
              select: vi.fn().mockReturnValue({
                ilike: vi.fn().mockResolvedValue({ data: [] }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      } as any;

      // 1. AudienceType: all
      const resAll = await resolveProductAudience(mockSupabase, "ws-1", {
        enabled: true,
        productName: "deep shoot",
        audienceType: "all",
      });

      expect(resAll.contactIds).toHaveLength(2);
      expect(resAll.contactIds).toContain("contact-buyer");
      expect(resAll.contactIds).toContain("contact-inquiry");

      const buyer = resAll.contacts.find((c) => c.contactId === "contact-buyer");
      expect(buyer?.matchedCategory).toBe("purchased");

      const inquirer = resAll.contacts.find((c) => c.contactId === "contact-inquiry");
      expect(inquirer?.matchedCategory).toBe("interested");

      // 2. AudienceType: purchased only
      const resPurchased = await resolveProductAudience(mockSupabase, "ws-1", {
        enabled: true,
        productName: "deep shoot",
        audienceType: "purchased",
      });

      expect(resPurchased.contactIds).toEqual(["contact-buyer"]);
      expect(resPurchased.contacts[0].matchedCategory).toBe("purchased");

      // 3. AudienceType: interested only
      const resInterested = await resolveProductAudience(mockSupabase, "ws-1", {
        enabled: true,
        productName: "deep shoot",
        audienceType: "interested",
      });

      expect(resInterested.contactIds).toEqual(["contact-inquiry"]);
      expect(resInterested.contacts[0].matchedCategory).toBe("interested");
    });
  });
});
