import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database";
import { createZernioClient, type Zernio } from "@/lib/zernio-client";

export interface ProductTargeting {
  enabled: boolean;
  channelId?: string; // channel UUID or 'all_facebook'
  productName: string; // e.g. "deep shoot"
  audienceType: "purchased" | "interested" | "all";
  sources?: {
    chatHistory?: boolean;
    comments?: boolean;
    tags?: boolean;
    customFields?: boolean;
  };
}

export interface MatchedContactDetail {
  contactId: string;
  displayName: string;
  avatarUrl: string | null;
  channelId: string;
  channelDisplayName: string;
  platform: string;
  matchedCategory: "purchased" | "interested";
  matchedReason: string;
  lastInteractionAt: string | null;
}

export interface ProductAudienceResult {
  contactIds: string[];
  contacts: MatchedContactDetail[];
}

/**
 * Common phrases and keywords in Mongolian and English that indicate
 * a customer ordered, requested delivery, paid, or bought a product.
 */
export const PURCHASE_KEYWORDS = [
  // Mongolian purchase & delivery phrases
  "хүргэлт",
  "хүргэлтээр",
  "хүргүүлэх",
  "хүргэх хаяг",
  "хүргэлтийн ажилтан",
  "хүргэлтэнд гарлаа",
  "бараагаа авсан",
  "xvrgelt",
  "xurgelt",
  "xurgelteer",
  "захиалга",
  "захиалъя",
  "захиалах",
  "захиалсан",
  "захиална",
  "zahialga",
  "zahialii",
  "zahialya",
  "авъя",
  "авна",
  "авсан",
  "awya",
  "avya",
  "avna",
  "avsan",
  "данс",
  "дансаар",
  "dans",
  "шилжүүл",
  "шилжүүллээ",
  "шилжүүлсэн",
  "shiljuulsen",
  "shiljuullee",
  "төлбөр",
  "төлбөр баталгааж",
  "төлсөн",
  "tulbur",
  "хаяг",
  "хаягаар",
  "утсаа үлдээе",
  "утас",
  "утсаар",
  "hayag",
  "utas",
  "худалдан авсан",
  "худалдан авалт",
  "авч байсан",
  // Usage indicators from customers who have the product
  "тарихад",
  "хэрэглэхэд",
  "хэрэглэж байгаа",
  // English order phrases
  "order",
  "ordered",
  "bought",
  "purchased",
  "purchase",
  "delivery",
  "paid",
  "payment confirmed",
];

export const INQUIRY_KEYWORDS = [
  "үнэ",
  "хэд вэ",
  "хэд бэ",
  "une",
  "hed ve",
  "hed be",
  "хямдрал",
  "урамшуулал",
  "байна уу",
  "bnuu",
  "bgaa ve",
  "ямар үнэтэй",
  "мэдээлэл",
  "сонирхож байна",
  "sonirhoj bn",
  "яаж хэрэглэх",
  "хэрэглэх заавар",
  "протокол",
  "брошур",
  "найрлага",
  "хэзээ ирэх",
];

export function isPurchaseText(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // If it's a phrase like "мэдээлэл авъя" (just requesting info) and doesn't contain delivery/payment keywords
  const isPureInfoRequest =
    lower.includes("мэдээлэл авъя") ||
    lower.includes("мэдээлэл авах") ||
    lower.includes("зөвлөгөө авъя") ||
    lower.includes("зөвлөгөө авах") ||
    lower.includes("тайлбар авъя");

  const hasStrongOrderSignals =
    lower.includes("хүргэлт") ||
    lower.includes("xvrgelt") ||
    lower.includes("xurgelt") ||
    lower.includes("захиал") ||
    lower.includes("данс") ||
    lower.includes("шилжүүл") ||
    lower.includes("төлбөр") ||
    lower.includes("хаяг") ||
    lower.includes("утас") ||
    lower.includes("бараагаа авсан") ||
    lower.includes("order") ||
    lower.includes("paid");

  if (isPureInfoRequest && !hasStrongOrderSignals) {
    return false;
  }

  return PURCHASE_KEYWORDS.some((kw) => lower.includes(kw));
}

export function matchesProductKeywords(
  text: string | null | undefined,
  productName: string
): boolean {
  if (!text || !productName) return false;
  const lowerText = text.toLowerCase();
  const lowerProd = productName.trim().toLowerCase();

  if (lowerText.includes(lowerProd)) return true;

  // Also check individual words if multi-word product (e.g. "deep shoot")
  const parts = lowerProd.split(/\s+/).filter((p) => p.length > 2);
  if (parts.length > 1) {
    return parts.every((p) => lowerText.includes(p));
  }
  return false;
}

/**
 * Resolves contacts who were interested in or purchased a specific product on Facebook Page.
 * Queries:
 * 1. Zernio Inbox Search (if API key available for deep message history)
 * 2. Supabase local `conversations` (last_message_preview)
 * 3. Supabase local `comment_logs` (Facebook comments)
 * 4. Supabase local `contact_tags` and `tags`
 * 5. Supabase local `contact_custom_fields`
 * 6. Supabase local `messages`
 */
export async function resolveProductAudience(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  targeting: ProductTargeting
): Promise<ProductAudienceResult> {
  if (!targeting.productName?.trim()) {
    return { contactIds: [], contacts: [] };
  }

  const productName = targeting.productName.trim();
  const audienceType = targeting.audienceType || "all";
  const targetChannelId =
    targeting.channelId && targeting.channelId !== "all_facebook"
      ? targeting.channelId
      : null;

  // 1. Fetch Facebook channels for this workspace
  let channelQuery = supabase
    .from("channels")
    .select("id, platform, display_name, late_account_id, username")
    .eq("workspace_id", workspaceId)
    .eq("platform", "facebook")
    .eq("is_active", true);

  if (targetChannelId) {
    channelQuery = channelQuery.eq("id", targetChannelId);
  }

  const { data: channels } = await channelQuery;
  if (!channels || channels.length === 0) {
    return { contactIds: [], contacts: [] };
  }

  const channelMap = new Map(channels.map((ch) => [ch.id, ch]));
  const channelIds = channels.map((ch) => ch.id);

  // Map to store matched contacts: contactId -> MatchedContactDetail
  const matchedMap = new Map<string, MatchedContactDetail>();

  // Fetch workspace API key for Zernio search
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", workspaceId)
    .single();

  const apiKey = workspace?.late_api_key_encrypted;

  // 2. Fetch local conversations on these Facebook channels to map Zernio results
  const { data: localConversations } = await supabase
    .from("conversations")
    .select(
      "id, contact_id, channel_id, late_conversation_id, last_message_preview, last_message_at, contacts(id, display_name, avatar_url, is_subscribed)"
    )
    .in("channel_id", channelIds);

  type LocalConv = NonNullable<typeof localConversations>[number];
  const convByLateId = new Map<string, LocalConv>();
  const convByContactId = new Map<string, LocalConv>();

  for (const c of localConversations ?? []) {
    if (c.late_conversation_id) convByLateId.set(c.late_conversation_id, c);
    if (c.contact_id) convByContactId.set(c.contact_id, c);
  }

  // 3. Zernio Deep Search across Facebook channels
  if (apiKey) {
    try {
      const zernio = createZernioClient(apiKey);
      for (const channel of channels) {
        if (!channel.late_account_id) continue;

        try {
          const searchRes = await zernio.messages.searchInboxConversations({
            query: {
              accountId: channel.late_account_id,
              query: productName,
              limit: 50,
            },
          });

          const items = searchRes.data?.data ?? [];
          for (const item of items) {
            const conv = item.conversation;
            if (!conv?.id) continue;

            const local = convByLateId.get(conv.id);
            const contact = local?.contacts as {
              id: string;
              display_name: string | null;
              avatar_url: string | null;
              is_subscribed: boolean;
            } | null;

            if (!contact || contact.is_subscribed === false) continue;

            const matches: Array<{ text?: string | null; direction?: string }> =
              item.matches ?? [];
            const incomingMatches = matches.filter(
              (m: { direction?: string }) => m.direction === "incoming"
            );
            const incomingText = incomingMatches
              .map((m: { text?: string | null }) => m.text)
              .filter(Boolean)
              .join(" ");
            const lastMsg = conv.lastMessage || "";
            const allText =
              matches
                .map((m: { text?: string | null }) => m.text)
                .filter(Boolean)
                .join(" ") +
              " " +
              lastMsg;

            let isPurchased = false;
            let reason = "";

            // Evaluate purchase signals
            if (isPurchaseText(incomingText)) {
              isPurchased = true;
              reason = `Хэрэглэгч захиалга/хүргэлт хийсэн: "${incomingMatches[0]?.text?.slice(0, 90) || ""}"`;
            } else if (
              isPurchaseText(lastMsg) &&
              (lastMsg.includes("захиалга хүргэлтэнд") ||
                lastMsg.includes("бараагаа авсан") ||
                lastMsg.includes("Төлбөр баталгаажуулах данс") ||
                lastMsg.includes("хүргэлтээр"))
            ) {
              isPurchased = true;
              reason = `Захиалга/хүргэлт баталгаажсан: "${lastMsg.slice(0, 90)}"`;
            } else if (incomingMatches.length > 0) {
              reason = `Чат: "${incomingMatches[0]?.text?.slice(0, 90) || ""}"`;
            } else {
              reason = `Чат зөвлөгөө: "${(matches[0]?.text || lastMsg).slice(0, 90)}"`;
            }

            const category: "purchased" | "interested" = isPurchased
              ? "purchased"
              : "interested";

            if (audienceType === "purchased" && category !== "purchased") {
              continue;
            }
            if (audienceType === "interested" && category !== "interested") {
              continue;
            }

            matchedMap.set(contact.id, {
              contactId: contact.id,
              displayName: contact.display_name || conv.participantName || "Unknown",
              avatarUrl: contact.avatar_url || conv.participantPicture || null,
              channelId: channel.id,
              channelDisplayName: channel.display_name || channel.username || "Facebook Page",
              platform: "facebook",
              matchedCategory: category,
              matchedReason: reason,
              lastInteractionAt: conv.lastMessageAt || null,
            });
          }
        } catch (chanErr) {
          console.warn(
            `[product-audience] Zernio search failed for channel ${channel.id}:`,
            chanErr
          );
        }
      }
    } catch (zernioErr) {
      console.warn("[product-audience] Zernio search error:", zernioErr);
    }
  }

  // 4. Local Conversations Search (last_message_preview)
  for (const conv of localConversations ?? []) {
    if (!conv.contacts) continue;
    const contact = conv.contacts as {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      is_subscribed: boolean;
    };
    if (contact.is_subscribed === false) continue;
    if (matchedMap.has(contact.id)) continue;

    const preview = conv.last_message_preview;
    if (preview && matchesProductKeywords(preview, productName)) {
      const isPurchased = isPurchaseText(preview);
      const category: "purchased" | "interested" = isPurchased
        ? "purchased"
        : "interested";

      if (audienceType === "purchased" && category !== "purchased") continue;
      if (audienceType === "interested" && category !== "interested") continue;

      const ch = channelMap.get(conv.channel_id);
      matchedMap.set(contact.id, {
        contactId: contact.id,
        displayName: contact.display_name || "Unknown",
        avatarUrl: contact.avatar_url,
        channelId: conv.channel_id,
        channelDisplayName: ch?.display_name || ch?.username || "Facebook Page",
        platform: "facebook",
        matchedCategory: category,
        matchedReason: isPurchased
          ? `Худалдан авалт/захиалгын зурвас: "${preview.slice(0, 90)}"`
          : `Сүүлийн чат зурвас: "${preview.slice(0, 90)}"`,
        lastInteractionAt: conv.last_message_at,
      });
    }
  }

  // 5. Facebook Comments Search (comment_logs)
  const { data: comments } = await supabase
    .from("comment_logs")
    .select("comment_text, author_id, author_name, channel_id, created_at")
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false });

  if (comments && comments.length > 0) {
    const matchingComments = comments.filter((c) =>
      matchesProductKeywords(c.comment_text, productName)
    );

    if (matchingComments.length > 0) {
      const authorIds = matchingComments
        .map((c) => c.author_id)
        .filter(Boolean) as string[];

      if (authorIds.length > 0) {
        const { data: contactChannels } = await supabase
          .from("contact_channels")
          .select("contact_id, platform_sender_id, channel_id, contacts(id, display_name, avatar_url, is_subscribed)")
          .in("channel_id", channelIds)
          .in("platform_sender_id", authorIds);

        const senderToContact = new Map(
          (contactChannels ?? []).map((cc) => [cc.platform_sender_id, cc])
        );

        for (const comment of matchingComments) {
          if (!comment.author_id) continue;
          const cc = senderToContact.get(comment.author_id);
          if (!cc?.contacts) continue;

          const contact = cc.contacts as unknown as {
            id: string;
            display_name: string | null;
            avatar_url: string | null;
            is_subscribed: boolean;
          };

          if (contact.is_subscribed === false) continue;
          if (matchedMap.has(contact.id)) continue;

          const isPurchased = isPurchaseText(comment.comment_text);
          const category: "purchased" | "interested" = isPurchased
            ? "purchased"
            : "interested";

          if (audienceType === "purchased" && category !== "purchased") continue;
          if (audienceType === "interested" && category !== "interested") continue;

          const ch = channelMap.get(comment.channel_id);
          matchedMap.set(contact.id, {
            contactId: contact.id,
            displayName: contact.display_name || comment.author_name || "Unknown",
            avatarUrl: contact.avatar_url,
            channelId: comment.channel_id,
            channelDisplayName: ch?.display_name || ch?.username || "Facebook Page",
            platform: "facebook",
            matchedCategory: category,
            matchedReason: `Facebook сэтгэгдэл: "${comment.comment_text.slice(0, 90)}"`,
            lastInteractionAt: comment.created_at,
          });
        }
      }
    }
  }

  // 6. Tags Search (contact_tags + tags)
  const { data: tags } = await supabase
    .from("tags")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  const matchingTags = (tags ?? []).filter((t) =>
    matchesProductKeywords(t.name, productName)
  );

  if (matchingTags.length > 0) {
    const tagIds = matchingTags.map((t) => t.id);
    const { data: taggedContacts } = await supabase
      .from("contact_tags")
      .select("contact_id, tag_id, contacts(id, display_name, avatar_url, is_subscribed, last_interaction_at)")
      .in("tag_id", tagIds);

    const tagById = new Map(matchingTags.map((t) => [t.id, t]));

    for (const tc of taggedContacts ?? []) {
      if (!tc.contacts) continue;
      const contact = tc.contacts as unknown as {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        is_subscribed: boolean;
        last_interaction_at: string | null;
      };

      if (contact.is_subscribed === false) continue;
      if (matchedMap.has(contact.id)) continue;

      // Verify contact is linked to one of the requested Facebook channels
      const { data: hasChan } = await supabase
        .from("contact_channels")
        .select("channel_id")
        .eq("contact_id", contact.id)
        .in("channel_id", channelIds)
        .limit(1)
        .maybeSingle();

      if (!hasChan) continue;

      const tagObj = tagById.get(tc.tag_id);
      const tagName = tagObj?.name || "";
      const isPurchased = isPurchaseText(tagName);
      const category: "purchased" | "interested" = isPurchased
        ? "purchased"
        : "interested";

      if (audienceType === "purchased" && category !== "purchased") continue;
      if (audienceType === "interested" && category !== "interested") continue;

      const ch = channelMap.get(hasChan.channel_id);
      matchedMap.set(contact.id, {
        contactId: contact.id,
        displayName: contact.display_name || "Unknown",
        avatarUrl: contact.avatar_url,
        channelId: hasChan.channel_id,
        channelDisplayName: ch?.display_name || ch?.username || "Facebook Page",
        platform: "facebook",
        matchedCategory: category,
        matchedReason: `Шошго (Tag): "${tagName}"`,
        lastInteractionAt: contact.last_interaction_at,
      });
    }
  }

  // 7. Custom Fields Search
  const { data: customFields } = await supabase
    .from("contact_custom_fields")
    .select("contact_id, value, custom_field_definitions(name, slug), contacts(id, display_name, avatar_url, is_subscribed, last_interaction_at)")
    .ilike("value", `%${productName}%`);

  for (const cf of customFields ?? []) {
    if (!cf.contacts) continue;
    const contact = cf.contacts as unknown as {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      is_subscribed: boolean;
      last_interaction_at: string | null;
    };

    if (contact.is_subscribed === false) continue;
    if (matchedMap.has(contact.id)) continue;

    // Verify channel
    const { data: hasChan } = await supabase
      .from("contact_channels")
      .select("channel_id")
      .eq("contact_id", contact.id)
      .in("channel_id", channelIds)
      .limit(1)
      .maybeSingle();

    if (!hasChan) continue;

    const fieldDef = cf.custom_field_definitions as unknown as {
      name?: string;
      slug?: string;
    } | null;
    const fieldIdentifier = `${fieldDef?.name || ""} ${fieldDef?.slug || ""}`.toLowerCase();
    const isPurchased =
      isPurchaseText(fieldIdentifier) || isPurchaseText(cf.value);
    const category: "purchased" | "interested" = isPurchased
      ? "purchased"
      : "interested";

    if (audienceType === "purchased" && category !== "purchased") continue;
    if (audienceType === "interested" && category !== "interested") continue;

    const ch = channelMap.get(hasChan.channel_id);
    matchedMap.set(contact.id, {
      contactId: contact.id,
      displayName: contact.display_name || "Unknown",
      avatarUrl: contact.avatar_url,
      channelId: hasChan.channel_id,
      channelDisplayName: ch?.display_name || ch?.username || "Facebook Page",
      platform: "facebook",
      matchedCategory: category,
      matchedReason: `Талбар (${fieldDef?.name || "Field"}): "${cf.value}"`,
      lastInteractionAt: contact.last_interaction_at,
    });
  }

  const contacts = Array.from(matchedMap.values());
  const contactIds = contacts.map((c) => c.contactId);

  return {
    contactIds,
    contacts,
  };
}
