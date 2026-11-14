import { describe, it, expect, vi } from "vitest";
import {
  scheduleBroadcastRun,
  cancelBroadcastSchedule,
  scheduleBroadcastDelivery,
} from "./scheduler";

describe("scheduler", () => {
  describe("scheduleBroadcastRun", () => {
    it("throws error if scheduled time is in the past", async () => {
      const mockSupabase = {} as any;
      const pastDate = new Date(Date.now() - 60000);

      await expect(
        scheduleBroadcastRun(mockSupabase, "b-1", pastDate)
      ).rejects.toThrow("Scheduled time must be in the future");
    });

    it("cancels existing pending triggers and inserts new scheduled job", async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const mockJobsDelete = vi.fn().mockReturnThis();
      const mockJobsEq = vi.fn().mockReturnThis();
      const mockJobsContains = vi.fn().mockResolvedValue({ error: null });

      const mockBroadcastsUpdate = vi.fn().mockReturnThis();
      const mockBroadcastsEq = vi.fn().mockReturnThis();
      const mockBroadcastsSelect = vi.fn().mockReturnThis();
      const mockBroadcastsSingle = vi.fn().mockResolvedValue({
        data: {
          id: "b-1",
          status: "scheduled",
          scheduled_for: futureDate.toISOString(),
        },
        error: null,
      });

      const mockJobsInsert = vi.fn().mockReturnThis();
      const mockJobsInsertSelect = vi.fn().mockReturnThis();
      const mockJobsInsertSingle = vi.fn().mockResolvedValue({
        data: { id: "job-1" },
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "scheduled_jobs") {
            return {
              delete: mockJobsDelete.mockReturnValue({
                eq: mockJobsEq.mockReturnValue({
                  contains: mockJobsContains,
                }),
              }),
              insert: mockJobsInsert.mockReturnValue({
                select: mockJobsInsertSelect.mockReturnValue({
                  single: mockJobsInsertSingle,
                }),
              }),
            };
          }
          if (table === "broadcasts") {
            return {
              update: mockBroadcastsUpdate.mockReturnValue({
                eq: mockBroadcastsEq.mockReturnValue({
                  select: mockBroadcastsSelect.mockReturnValue({
                    single: mockBroadcastsSingle,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const res = await scheduleBroadcastRun(mockSupabase, "b-1", futureDate);

      expect(res.status).toBe("scheduled");
      expect(mockJobsContains).toHaveBeenCalledWith("payload", { broadcastId: "b-1" });
      expect(mockBroadcastsUpdate).toHaveBeenCalledWith({
        status: "scheduled",
        scheduled_for: futureDate.toISOString(),
      });
      expect(mockJobsInsert).toHaveBeenCalledWith({
        type: "trigger_scheduled_broadcast",
        payload: { broadcastId: "b-1" },
        run_at: futureDate.toISOString(),
      });
    });
  });

  describe("cancelBroadcastSchedule", () => {
    it("deletes pending trigger job and sets broadcast status back to draft", async () => {
      const mockJobsDelete = vi.fn().mockReturnThis();
      const mockJobsEq = vi.fn().mockReturnThis();
      const mockJobsContains = vi.fn().mockResolvedValue({ error: null });

      const mockBroadcastsUpdate = vi.fn().mockReturnThis();
      const mockBroadcastsEq = vi.fn().mockReturnThis();
      const mockBroadcastsSelect = vi.fn().mockReturnThis();
      const mockBroadcastsSingle = vi.fn().mockResolvedValue({
        data: {
          id: "b-1",
          status: "draft",
          scheduled_for: null,
        },
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "scheduled_jobs") {
            return {
              delete: mockJobsDelete.mockReturnValue({
                eq: mockJobsEq.mockReturnValue({
                  contains: mockJobsContains,
                }),
              }),
            };
          }
          if (table === "broadcasts") {
            return {
              update: mockBroadcastsUpdate.mockReturnValue({
                eq: mockBroadcastsEq.mockReturnValue({
                  select: mockBroadcastsSelect.mockReturnValue({
                    single: mockBroadcastsSingle,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const res = await cancelBroadcastSchedule(mockSupabase, "b-1");

      expect(res.status).toBe("draft");
      expect(mockJobsContains).toHaveBeenCalledWith("payload", { broadcastId: "b-1" });
      expect(mockBroadcastsUpdate).toHaveBeenCalledWith({
        status: "draft",
        scheduled_for: null,
      });
    });
  });
});
