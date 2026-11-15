"use client";

import { useState, useEffect } from "react";
import {
  Radio,
  Plus,
  Clock,
  CheckCircle2,
  Send,
  Loader2,
  XCircle,
  FileEdit,
  Calendar,
  Filter,
  ChevronDown,
  ArrowLeft,
  AlertCircle,
  ShoppingBag,
  MessageSquare,
  Sparkles,
  User,
  Tag,
  Eye,
  EyeOff,
  Check,
  Trash2,
  Pencil,
  X,
  Save,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  SegmentBuilder,
  createEmptyFilter,
  type SegmentFilter,
} from "@/components/segment-builder";
import type { Database, BroadcastStatus, Json } from "@/lib/types/database";
import type {
  ProductTargeting,
  MatchedContactDetail,
} from "@/lib/product-audience";

type Broadcast = Database["public"]["Tables"]["broadcasts"]["Row"];
type Channel = Database["public"]["Tables"]["channels"]["Row"];

const statusConfig: Record<
  BroadcastStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  draft: {
    label: "Draft",
    icon: FileEdit,
    className: "bg-muted text-muted-foreground",
  },
  scheduled: {
    label: "Scheduled",
    icon: Clock,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  sending: {
    label: "Sending",
    icon: Loader2,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Not scheduled";
  return new Date(dateStr).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTomorrowTime(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function getDaysAheadTime(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function BroadcastsView({
  broadcasts,
  workspaceId,
  facebookChannels = [],
}: {
  broadcasts: Broadcast[];
  workspaceId: string;
  facebookChannels?: Channel[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [items, setItems] = useState(broadcasts);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Facebook Channels state
  const [channels, setChannels] = useState<Channel[]>(facebookChannels);

  // Targeting in create modal
  const [enableProductTargeting, setEnableProductTargeting] = useState(true);
  const [targetChannelId, setTargetChannelId] = useState<string>("all_facebook");
  const [productName, setProductName] = useState("");
  const [audienceType, setAudienceType] = useState<"purchased" | "interested" | "all">("all");

  // Scheduling in create modal
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDateStr, setScheduledDateStr] = useState("");

  // Advanced segment builder toggle
  const [showSegmentFilter, setShowSegmentFilter] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>(
    createEmptyFilter()
  );

  // Audience Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewContacts, setPreviewContacts] = useState<MatchedContactDetail[]>([]);
  const [showContactList, setShowContactList] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (channels.length === 0) {
      async function loadChannels() {
        const supabase = createClient();
        const { data } = await supabase
          .from("channels")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("platform", "facebook")
          .eq("is_active", true);
        if (data) setChannels(data);
      }
      loadChannels();
    }
  }, [workspaceId, channels.length]);

  // Trigger audience resolution preview when product targeting changes
  useEffect(() => {
    if (!enableProductTargeting || !productName.trim()) {
      setPreviewCount(null);
      setPreviewContacts([]);
      return;
    }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await fetch("/api/v1/broadcasts/audience-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productTargeting: {
              enabled: true,
              channelId: targetChannelId,
              productName: productName.trim(),
              audienceType,
            },
            workspaceId,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setPreviewCount(data.totalRecipients || 0);
          setPreviewContacts(data.contacts || []);
        } else {
          setPreviewError(data.error || "Шүүлт хийхэд алдаа гарлаа");
        }
      } catch (err) {
        setPreviewError("Шүүлт хийхэд алдаа гарлаа");
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [enableProductTargeting, targetChannelId, productName, audienceType, workspaceId]);

  function resetCreateForm() {
    setNewName("");
    setProductName("");
    setEnableProductTargeting(true);
    setAudienceType("all");
    setTargetChannelId("all_facebook");
    setIsScheduled(false);
    setScheduledDateStr("");
    setShowSegmentFilter(false);
    setSegmentFilter(createEmptyFilter());
    setPreviewCount(null);
    setPreviewContacts([]);
    setShowContactList(false);
    setShowCreate(false);
  }

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);

    try {
      const fullSegmentFilter: SegmentFilter = {
        combinator: segmentFilter.combinator,
        groups: showSegmentFilter ? segmentFilter.groups : [],
        productTargeting: enableProductTargeting && productName.trim()
          ? {
              enabled: true,
              channelId: targetChannelId,
              productName: productName.trim(),
              audienceType,
            }
          : undefined,
      };

      let scheduledForIso: string | null = null;
      if (isScheduled && scheduledDateStr) {
        const dateObj = new Date(scheduledDateStr);
        if (!isNaN(dateObj.getTime()) && dateObj.getTime() > Date.now()) {
          scheduledForIso = dateObj.toISOString();
        }
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from("broadcasts")
        .insert({
          workspace_id: workspaceId,
          name: newName.trim(),
          status: scheduledForIso ? "scheduled" : "draft",
          message_content: {},
          segment_filter: fullSegmentFilter as unknown as Json,
          scheduled_for: scheduledForIso,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        // If scheduled, also schedule the job in background
        if (scheduledForIso) {
          await fetch(`/api/v1/broadcasts/${data.id}/schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scheduledFor: scheduledForIso,
              segmentFilter: fullSegmentFilter,
            }),
          });
        }

        setItems((prev) => [data, ...prev]);
        resetCreateForm();
        setSelectedId(data.id);
      }
    } catch (err) {
      console.error("Failed to create broadcast:", err);
    } finally {
      setCreating(false);
    }
  }

  const [broadcastToDelete, setBroadcastToDelete] = useState<Broadcast | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteFromList(broadcast: Broadcast) {
    setDeletingId(broadcast.id);
    try {
      const res = await fetch(`/api/v1/broadcasts/${broadcast.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Устгахад алдаа гарлаа");
      }
      setItems((prev) => prev.filter((b) => b.id !== broadcast.id));
      if (selectedId === broadcast.id) {
        setSelectedId(null);
      }
      setBroadcastToDelete(null);
    } catch (err) {
      console.error("Failed to delete broadcast:", err);
      alert(err instanceof Error ? err.message : "Устгахад алдаа гарлаа");
    } finally {
      setDeletingId(null);
    }
  }

  const selectedBroadcast = selectedId
    ? items.find((b) => b.id === selectedId) ?? null
    : null;

  if (selectedBroadcast) {
    return (
      <BroadcastDetail
        broadcast={selectedBroadcast}
        workspaceId={workspaceId}
        facebookChannels={channels}
        onBack={() => setSelectedId(null)}
        onUpdate={(updated) => {
          setItems((prev) =>
            prev.map((b) => (b.id === updated.id ? updated : b))
          );
        }}
        onDelete={(deletedId) => {
          setItems((prev) => prev.filter((b) => b.id !== deletedId));
          setSelectedId(null);
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Broadcasts (Зурвас түгээлт)</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Facebook хуудсаар бүтээгдэхүүн сонирхсон болон авч байсан хэрэглэгчид рүү зурвас түгээх, цаг товлох
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            Шинэ Broadcast үүсгэх
          </button>
        </div>

        {/* Create modal/form */}
        {showCreate && (
          <div className="mt-6 rounded-xl border border-primary/20 bg-card p-6 shadow-md space-y-6 animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Шинэ Broadcast тохируулах
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Бүтээгдэхүүн сонирхож байсан эсвэл авсан хэрэглэгчдийг олоод зурвас илгээх
                </p>
              </div>
              <button
                onClick={resetCreateForm}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            {/* 1. Broadcast Name */}
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground block mb-1.5">
                Broadcast-ын нэр
              </label>
              <input
                type="text"
                placeholder="Жишээ нь: Deep Shoot Урамшуулал 🎁..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* 2. Facebook Page & Product Targeting */}
            <div className="rounded-lg border border-border bg-accent/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">
                      🎯 Facebook Бүтээгдэхүүний онилгоо (Product Targeting)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Өмнө нь тухайн бүтээгдэхүүнийг чат/сэтгэгдэлд сонирхсон эсвэл авч байсан хүмүүсийг автоматаар олно
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableProductTargeting}
                    onChange={(e) => setEnableProductTargeting(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {enableProductTargeting && (
                <div className="space-y-4 pt-2 border-t border-border/60">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Select Facebook Page */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                        Facebook хуудас (Page)
                      </label>
                      <select
                        value={targetChannelId}
                        onChange={(e) => setTargetChannelId(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="all_facebook">Бүх Facebook хуудас</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.display_name || ch.username || "Facebook Page"}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Product Name Input */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                        Бүтээгдэхүүний нэр / Түлхүүр үг
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Жишээ нь: deep shoot"
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-20"
                        />
                        {productName && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                            Идэвхтэй
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Audience Type Selection */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Зорилтот бүлгийн төрөл
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setAudienceType("purchased")}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                          audienceType === "purchased"
                            ? "border-green-600 bg-green-500/10 text-foreground ring-1 ring-green-600"
                            : "border-border bg-background hover:bg-accent text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Өмнө нь авч байсан хүмүүс
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Захиалга, хүргэлт, худалдан авалт хийж байсан хэрэглэгчид
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAudienceType("interested")}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                          audienceType === "interested"
                            ? "border-blue-600 bg-blue-500/10 text-foreground ring-1 ring-blue-600"
                            : "border-border bg-background hover:bg-accent text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Сонирхож байсан хүмүүс
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Чат, сэтгэгдэлд үнэ, мэдээлэл лавлаж асуусан хүмүүс
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAudienceType("all")}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                          audienceType === "all"
                            ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                            : "border-border bg-background hover:bg-accent text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <Sparkles className="h-3.5 w-3.5" />
                          Бүгд (Сонирхсон + Авсан)
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Энэ бүтээгдэхүүний сонирхсон болон авсан бүх хүмүүс
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Live Audience Preview Box */}
                  {productName.trim() && (
                    <div className="rounded-lg border border-border bg-background p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {previewLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          <span className="text-xs font-medium">
                            {previewLoading
                              ? "Facebook харилцагчдаас хайж байна..."
                              : previewCount !== null
                              ? `🎯 Нийт ${previewCount} тохирох хэрэглэгч олдлоо`
                              : "Шүүлтүүрийн үр дүнг шалгаж байна..."}
                          </span>
                        </div>

                        {previewContacts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowContactList(!showContactList)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            {showContactList ? (
                              <>
                                <EyeOff className="h-3.5 w-3.5" /> Нуух
                              </>
                            ) : (
                              <>
                                <Eye className="h-3.5 w-3.5" /> Хэрэглэгчдийг харах ({previewContacts.length})
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Expandable Preview List */}
                      {showContactList && previewContacts.length > 0 && (
                        <div className="border-t border-border pt-3 max-h-56 overflow-y-auto space-y-2">
                          {previewContacts.map((c) => (
                            <div
                              key={c.contactId}
                              className="flex items-start justify-between gap-3 p-2 rounded-md bg-muted/40 text-xs"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0">
                                  {c.avatarUrl ? (
                                    <img
                                      src={c.avatarUrl}
                                      alt=""
                                      className="h-7 w-7 rounded-full object-cover"
                                    />
                                  ) : (
                                    c.displayName?.[0] || "?"
                                  )}
                                </div>
                                <div>
                                  <p className="font-semibold">{c.displayName}</p>
                                  <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                                    {c.matchedReason}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={cn(
                                  "rounded px-2 py-0.5 text-[10px] font-medium shrink-0",
                                  c.matchedCategory === "purchased"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                )}
                              >
                                {c.matchedCategory === "purchased"
                                  ? "🛍️ Авч байсан"
                                  : "💬 Сонирхсон"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Scheduling Section */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold">
                    📅 Цаг товлох (Schedule for later)
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => {
                      setIsScheduled(e.target.checked);
                      if (e.target.checked && !scheduledDateStr) {
                        setScheduledDateStr(getTomorrowTime(10));
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {isScheduled && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Сонгосон цагт систем автоматаар зорилтот хэрэглэгчид рүү зурвасыг түгээх болно.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="datetime-local"
                      value={scheduledDateStr}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(e) => setScheduledDateStr(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />

                    {/* Quick presets */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setScheduledDateStr(getTomorrowTime(9))}
                        className="rounded-md border border-input bg-muted/50 px-2.5 py-1 text-xs hover:bg-accent transition-colors"
                      >
                        Маргааш 09:00
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduledDateStr(getTomorrowTime(18))}
                        className="rounded-md border border-input bg-muted/50 px-2.5 py-1 text-xs hover:bg-accent transition-colors"
                      >
                        Маргааш 18:00
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduledDateStr(getDaysAheadTime(2, 10))}
                        className="rounded-md border border-input bg-muted/50 px-2.5 py-1 text-xs hover:bg-accent transition-colors"
                      >
                        2 өдрийн дараа
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Advanced Segment Builder */}
            <div>
              <button
                type="button"
                onClick={() => setShowSegmentFilter(!showSegmentFilter)}
                className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Filter className="h-3.5 w-3.5" />
                {showSegmentFilter ? "Бусад шүүлтүүрийг нуух" : "Нэмэлт сегмент шүүлтүүр оруулах (Segment Builder)"}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showSegmentFilter && "rotate-180"
                  )}
                />
              </button>

              {showSegmentFilter && (
                <div className="mt-3">
                  <SegmentBuilder
                    value={segmentFilter}
                    onChange={setSegmentFilter}
                    workspaceId={workspaceId}
                  />
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={resetCreateForm}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Болих
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isScheduled ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {creating
                  ? "Үүсгэж байна..."
                  : isScheduled
                  ? "Товлоод үүсгэх"
                  : "Үүсгээд нээх"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Broadcast list */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Radio className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Broadcast одоогоор байхгүй байна
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Facebook хуудсаар бүтээгдэхүүн сонирхож байсан болон авч байсан хүмүүс рүү шинэ Broadcast үүсгээрэй
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((broadcast) => {
              const status = statusConfig[broadcast.status];
              const StatusIcon = status.icon;
              const total = broadcast.total_recipients;

              // Check if has product targeting
              const filter = broadcast.segment_filter as SegmentFilter | null;
              const prodTargeting = filter?.productTargeting;

              return (
                <div
                  key={broadcast.id}
                  onClick={() => setSelectedId(broadcast.id)}
                  className="group flex w-full items-center justify-between gap-6 px-8 py-4 text-left transition-colors hover:bg-accent/50 cursor-pointer"
                >
                  {/* Status + Name */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                        {broadcast.name}
                      </h3>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          status.className
                        )}
                      >
                        <StatusIcon
                          className={cn(
                            "h-3 w-3",
                            broadcast.status === "sending" && "animate-spin"
                          )}
                        />
                        {status.label}
                      </span>

                      {prodTargeting?.enabled && prodTargeting.productName && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-medium">
                          <ShoppingBag className="h-3 w-3" />
                          {prodTargeting.productName} (
                          {prodTargeting.audienceType === "purchased"
                            ? "Авсан"
                            : prodTargeting.audienceType === "interested"
                            ? "Сонирхсон"
                            : "Бүгд"}
                          )
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {broadcast.scheduled_for
                          ? formatDate(broadcast.scheduled_for)
                          : "Not scheduled"}
                      </span>
                      <span>
                        Created {formatDate(broadcast.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Stats & Actions */}
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-lg font-semibold">{total}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Recipients
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-green-600">
                          {broadcast.sent}
                        </p>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Sent
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-blue-600">
                          {broadcast.delivered}
                        </p>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Delivered
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-red-600">
                          {broadcast.failed}
                        </p>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Failed
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBroadcastToDelete(broadcast);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-all"
                      title="Broadcast устгах"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal for List View */}
      {broadcastToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="rounded-full bg-red-100 dark:bg-red-950/50 p-2.5">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-foreground">
                  Broadcast устгах уу?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Энэ үйлдлийг буцаах боломжгүй
                </p>
              </div>
            </div>

            <p className="text-sm text-foreground/80">
              Та <strong className="text-foreground">"{broadcastToDelete.name}"</strong> нэртэй broadcast-ийг устгахдаа итгэлтэй байна уу?
              {broadcastToDelete.status === "scheduled" && (
                <span className="block mt-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-2 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ Энэ нь товлосон цагийн хуваарьтай байгаа бөгөөд автомат илгээлт цуцлагдана.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setBroadcastToDelete(null)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                Болих
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => handleDeleteFromList(broadcastToDelete)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
              >
                {deletingId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deletingId ? "Устгаж байна..." : "Устгах"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BroadcastDetail({
  broadcast,
  workspaceId,
  facebookChannels = [],
  onBack,
  onUpdate,
  onDelete,
}: {
  broadcast: Broadcast;
  workspaceId: string;
  facebookChannels?: Channel[];
  onBack: () => void;
  onUpdate: (updated: Broadcast) => void;
  onDelete?: (deletedId: string) => void;
}) {
  const messageContent = broadcast.message_content as { text?: string } | null;
  const [broadcastName, setBroadcastName] = useState(broadcast.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [messageText, setMessageText] = useState(messageContent?.text || "");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Scheduling state in detail
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(
    broadcast.scheduled_for
      ? new Date(broadcast.scheduled_for).toISOString().slice(0, 16)
      : getTomorrowTime(10)
  );

  const isDraftOrScheduled =
    broadcast.status === "draft" || broadcast.status === "scheduled";
  const isCurrentlyScheduled = broadcast.status === "scheduled";
  const status = statusConfig[broadcast.status];
  const StatusIcon = status.icon;

  const segmentFilter = broadcast.segment_filter as SegmentFilter | null;
  const prodTargeting = segmentFilter?.productTargeting;

  // Live audience resolution in detail
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceContacts, setAudienceContacts] = useState<MatchedContactDetail[]>([]);
  const [showContacts, setShowContacts] = useState(false);
  const [resolvingAudience, setResolvingAudience] = useState(false);

  useEffect(() => {
    if (prodTargeting?.enabled && prodTargeting.productName) {
      async function checkAudience() {
        setResolvingAudience(true);
        try {
          const res = await fetch("/api/v1/broadcasts/audience-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productTargeting: prodTargeting,
              workspaceId,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setAudienceCount(data.totalRecipients || 0);
            setAudienceContacts(data.contacts || []);
          }
        } catch {
          // ignore
        } finally {
          setResolvingAudience(false);
        }
      }
      checkAudience();
    }
  }, [prodTargeting, workspaceId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/broadcasts/${broadcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: broadcastName.trim() || broadcast.name,
          messageContent: { text: messageText },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Хадгалахад алдаа гарлаа");
      }

      const data = await res.json();
      onUpdate(data);
      setIsEditingName(false);
      setSuccess("Өөрчлөлт амжилттай хадгалагдлаа");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Хадгалахад алдаа гарлаа");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBroadcast() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/broadcasts/${broadcast.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Устгахад алдаа гарлаа");
      }
      setShowDeleteModal(false);
      if (onDelete) {
        onDelete(broadcast.id);
      } else {
        onBack();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Устгахад алдаа гарлаа");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend() {
    if (!messageText.trim()) {
      setError("Зурвасын агуулгыг бичнэ үү");
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/v1/broadcasts/${broadcast.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageContent: { text: messageText.trim() },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Зурвас илгээхэд алдаа гарлаа");
      }

      setSuccess(`${data.totalRecipients} хэрэглэгч рүү илгээж байна`);

      onUpdate({
        ...broadcast,
        status: "sending",
        total_recipients: data.totalRecipients,
        message_content: { text: messageText.trim() } as unknown as Json,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Илгээхэд алдаа гарлаа");
    } finally {
      setSending(false);
    }
  }

  async function handleScheduleSubmit() {
    if (!messageText.trim()) {
      setError("Зурвасын агуулгыг бичнэ үү");
      return;
    }

    const dateObj = new Date(scheduleTime);
    if (isNaN(dateObj.getTime()) || dateObj.getTime() <= Date.now()) {
      setError("Товлох цаг ирээдүйд байх ёстой");
      return;
    }

    setScheduling(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/v1/broadcasts/${broadcast.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: dateObj.toISOString(),
          messageContent: { text: messageText.trim() },
          segmentFilter: broadcast.segment_filter,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Цаг товлоход алдаа гарлаа");
      }

      setSuccess(`Амжилттай товлогдлоо: ${formatDate(data.scheduledFor)}`);
      setShowScheduleModal(false);

      onUpdate({
        ...broadcast,
        status: "scheduled",
        scheduled_for: data.scheduledFor,
        message_content: { text: messageText.trim() } as unknown as Json,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Цаг товлоход алдаа гарлаа");
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancelSchedule() {
    setScheduling(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/broadcasts/${broadcast.id}/schedule`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Товлолт цуцлахад алдаа гарлаа");
      }

      setSuccess("Цаг товлолт цуцлагдлаа");
      onUpdate({
        ...broadcast,
        status: "draft",
        scheduled_for: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Товлолт цуцлахад алдаа гарлаа");
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button
              onClick={onBack}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
              title="Буцах"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={broadcastName}
                      onChange={(e) => setBroadcastName(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-1 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") {
                          setBroadcastName(broadcast.name);
                          setIsEditingName(false);
                        }
                      }}
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving || !broadcastName.trim()}
                      className="rounded-lg bg-primary p-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      title="Нэр хадгалах"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setBroadcastName(broadcast.name);
                        setIsEditingName(false);
                      }}
                      className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent"
                      title="Болих"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-2xl font-bold truncate max-w-md">{broadcastName}</h1>
                    {isDraftOrScheduled && (
                      <button
                        onClick={() => setIsEditingName(true)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 transition-opacity"
                        title="Нэр засах"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                    status.className
                  )}
                >
                  <StatusIcon
                    className={cn(
                      "h-3.5 w-3.5",
                      broadcast.status === "sending" && "animate-spin"
                    )}
                  />
                  {status.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Created {formatDate(broadcast.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors shadow-sm"
              title="Broadcast бүрэн устгах"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Broadcast устгах
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Scheduled Banner */}
          {isCurrentlyScheduled && (
            <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                    Илгээхээр товлосон цаг: {formatDate(broadcast.scheduled_for)}
                  </p>
                  <p className="text-xs text-blue-700/80 dark:text-blue-400/80">
                    Энэ цагт систем автоматаар бүх зорилтот хэрэглэгчид рүү зурвас түгээх болно.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="rounded-lg bg-white dark:bg-card border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent shadow-sm"
                >
                  Цаг өөрчлөх
                </button>
                <button
                  onClick={handleCancelSchedule}
                  disabled={scheduling}
                  className="rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 text-xs font-medium hover:bg-red-200"
                >
                  Цуцлах
                </button>
              </div>
            </div>
          )}

          {/* Stats row for sending or completed */}
          {broadcast.total_recipients > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold">{broadcast.total_recipients}</p>
                <p className="text-xs text-muted-foreground">Recipients</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{broadcast.sent}</p>
                <p className="text-xs text-muted-foreground">Sent</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{broadcast.delivered}</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{broadcast.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          )}

          {/* Product Targeting Summary Card */}
          {prodTargeting?.enabled && prodTargeting.productName && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">
                      🎯 Facebook Бүтээгдэхүүний онилгоо: &quot;{prodTargeting.productName}&quot;
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Төрөл:{" "}
                      <span className="font-medium text-foreground">
                        {prodTargeting.audienceType === "purchased"
                          ? "Өмнө нь худалдан авч байсан хүмүүс"
                          : prodTargeting.audienceType === "interested"
                          ? "Сонирхож лавлаж байсан хүмүүс"
                          : "Сонирхсон болон авсан бүх хүмүүс"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-semibold">
                    {resolvingAudience ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      `🎯 ${audienceCount ?? "..."} хэрэглэгч`
                    )}
                  </span>
                  {audienceContacts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowContacts(!showContacts)}
                      className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:bg-accent text-xs"
                      title="Хэрэглэгчдийг харах"
                    >
                      {showContacts ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Matching Contacts List */}
              {showContacts && audienceContacts.length > 0 && (
                <div className="border-t border-primary/10 pt-3 max-h-56 overflow-y-auto space-y-2">
                  {audienceContacts.map((c) => (
                    <div
                      key={c.contactId}
                      className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-background border border-border text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0">
                          {c.avatarUrl ? (
                            <img
                              src={c.avatarUrl}
                              alt=""
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          ) : (
                            c.displayName?.[0] || "?"
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{c.displayName}</p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-sm">
                            {c.matchedReason}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[10px] font-medium shrink-0",
                          c.matchedCategory === "purchased"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        )}
                      >
                        {c.matchedCategory === "purchased"
                          ? "🛍️ Авч байсан"
                          : "💬 Сонирхсон"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Message composer */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Илгээх зурвас (Message)</label>
              <div className="flex items-center gap-3">
                {messageText.length > 0 && isDraftOrScheduled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Зурвасын текстийг цэвэрлэх үү?")) {
                        setMessageText("");
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 transition-colors font-medium"
                    title="Зурвасын текстийг арилгах"
                  >
                    <Trash2 className="h-3 w-3" />
                    Текст цэвэрлэх
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {messageText.length} тэмдэгт
                </span>
              </div>
            </div>

            {/* Quick Template suggestions */}
            {isDraftOrScheduled && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-muted-foreground text-[11px]">Бэлэн загвар:</span>
                <button
                  type="button"
                  onClick={() => {
                    const prod = prodTargeting?.productName || "бүтээгдэхүүн";
                    setMessageText(
                      `Сайн байна уу? Танд энэ өдрийн мэнд хүргэе! 🎉\nМанайхаас өмнө нь ${prod} авч байсан танд зориулан тусгай 20% хямдрал эхэллээ! 🎁\nТанд сонирхсон зүйл байвал энд хариу бичнэ үү.`
                    );
                  }}
                  className="rounded-md border border-border bg-accent/40 hover:bg-accent px-2 py-0.5 text-[11px] text-foreground transition-colors"
                >
                  🎁 Хямдрал, урамшуулал
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const prod = prodTargeting?.productName || "бүтээгдэхүүн";
                    setMessageText(
                      `Сайн байна уу? Та манай ${prod} бүтээгдэхүүний талаар сонирхож байсан билээ. 📦\nШинэ багц ирсэн тул танд онцгой нөхцөлөөр санал болгож байна. Дэлгэрэнгүйг сонирхох уу?`
                    );
                  }}
                  className="rounded-md border border-border bg-accent/40 hover:bg-accent px-2 py-0.5 text-[11px] text-foreground transition-colors"
                >
                  📦 Шинэ багц, бараа ирсэн
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessageText(
                      `Эрхэм хэрэглэгч танд энэ өдрийн мэнд хүргэе! ✨ Танд үйлчилгээ болон бүтээгдэхүүний талаар асууж тодруулах зүйл байвал бид байнга бэлэн байна.`
                    );
                  }}
                  className="rounded-md border border-border bg-accent/40 hover:bg-accent px-2 py-0.5 text-[11px] text-foreground transition-colors"
                >
                  💬 Мэндчилгээ & Тусламж
                </button>
              </div>
            )}

            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              disabled={!isDraftOrScheduled}
              placeholder="Зурвасын агуулгыг энд бичнэ үү... Жишээ нь: Сайн байна уу? Манайхаас өмнө нь Deep Shoot авч байсан үнэнч хэрэглэгч танд зориулсан 20% хямдрал эхэллээ! 🎁"
              rows={6}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
            />
            {isDraftOrScheduled && (
              <p className="text-xs text-muted-foreground">
                Энэхүү зурвас нь дээр тохируулсан зорилтот хэрэглэгчид рүү Facebook Messenger-ээр илгээгдэнэ.
              </p>
            )}
          </div>

          {/* Segment info if extra filters exist */}
          {segmentFilter && segmentFilter.groups && segmentFilter.groups.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Filter className="h-4 w-4 text-muted-foreground" />
                Нэмэлт сегмент шүүлтүүр
              </div>
              <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground max-h-36">
                {JSON.stringify(segmentFilter, null, 2)}
              </pre>
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {success}
            </div>
          )}

          {/* Actions */}
          {isDraftOrScheduled && (
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSend}
                  disabled={sending || !messageText.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {sending ? "Илгээж байна..." : "Одоо шууд илгээх"}
                </button>

                <button
                  onClick={() => setShowScheduleModal(true)}
                  disabled={scheduling || !messageText.trim()}
                  className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 shadow-sm"
                >
                  <Clock className="h-4 w-4 text-blue-600" />
                  {isCurrentlyScheduled ? "Товлосон цаг өөрчлөх" : "Цаг товлох"}
                </button>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 shadow-sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 text-primary" />
                )}
                {saving ? "Хадгалж байна..." : "Өөрчлөлтийг хадгалах"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-base">Зурвас илгээх цаг товлох</h3>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Broadcast-ыг ирээдүйн тодорхой огноо, цагт автоматаар илгээхээр тохируулна.
            </p>

            <div className="space-y-3">
              <input
                type="datetime-local"
                value={scheduleTime}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setScheduleTime(getTomorrowTime(9))}
                  className="rounded-md border border-input bg-muted/60 px-2.5 py-1 text-xs hover:bg-accent"
                >
                  Маргааш 09:00
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleTime(getTomorrowTime(18))}
                  className="rounded-md border border-input bg-muted/60 px-2.5 py-1 text-xs hover:bg-accent"
                >
                  Маргааш 18:00
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleTime(getDaysAheadTime(2, 10))}
                  className="rounded-md border border-input bg-muted/60 px-2.5 py-1 text-xs hover:bg-accent"
                >
                  2 өдрийн дараа
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Болих
              </button>
              <button
                type="button"
                onClick={handleScheduleSubmit}
                disabled={scheduling || !scheduleTime}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                {scheduling ? "Товлож байна..." : "Товлох"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Detail View */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="rounded-full bg-red-100 dark:bg-red-950/50 p-2.5">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-foreground">
                  Broadcast устгах уу?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Энэ үйлдлийг буцаах боломжгүй
                </p>
              </div>
            </div>

            <p className="text-sm text-foreground/80">
              Та <strong className="text-foreground">"{broadcastName}"</strong> нэртэй broadcast-ийг бүрэн устгахдаа итгэлтэй байна уу?
              {broadcast.status === "scheduled" && (
                <span className="block mt-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-2 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ Энэ нь товлосон цагийн хуваарьтай байгаа бөгөөд автомат илгээлт цуцлагдана.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                Болих
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteBroadcast}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "Устгаж байна..." : "Тийм, устгах"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
