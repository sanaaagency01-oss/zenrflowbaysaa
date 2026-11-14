import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { scheduleBroadcastDelivery } from "@/lib/scheduler";
import {
  resolveProductAudience,
  type ProductTargeting,
} from "@/lib/product-audience";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Platform } from "@/lib/types/database";

export interface SegmentRule {
  field: string;
  operator: string;
  value: string;
}

export interface SegmentGroup {
  combinator: "and" | "or";
  rules: SegmentRule[];
}

export interface SegmentFilter {
  combinator: "and" | "or";
  groups: SegmentGroup[];
  productTargeting?: ProductTargeting;
}

/**
 * POST /api/v1/broadcasts/:broadcastId/send
 *
 * Resolves the broadcast's segment filter and product targeting into contacts,
 * creates broadcast_recipients, and schedules delivery jobs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ broadcastId: string }> }
) {
  const { broadcastId } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  // Fetch the broadcast
  const { data: broadcast, error: broadcastErr } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .eq("workspace_id", membership.workspace_id)
    .single();

  if (broadcastErr || !broadcast) {
    return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  }

  if (broadcast.status !== "draft" && broadcast.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot send broadcast with status "${broadcast.status}"` },
      { status: 400 }
    );
  }

  // Allow overriding message content from the request body
  let messageContent = broadcast.message_content as { text?: string };
  try {
    const body = await request.json();
    if (body.messageContent) {
      messageContent = body.messageContent;
      await supabase
        .from("broadcasts")
        .update({ message_content: messageContent as unknown as Json })
        .eq("id", broadcastId);
    }
  } catch {
    // No body or invalid JSON, use existing message_content
  }

  if (!messageContent?.text?.trim()) {
    return NextResponse.json(
      { error: "Message content is required. Set message_content.text on the broadcast." },
      { status: 400 }
    );
  }

  // Service client for privileged jobs and recipients
  const serviceClient = await createServiceClient();

  // If this broadcast had a pending scheduled trigger job, remove it
  await serviceClient
    .from("scheduled_jobs")
    .delete()
    .eq("type", "trigger_scheduled_broadcast")
    .contains("payload", { broadcastId });

  // Resolve contacts from segment filter and product targeting
  const filter = broadcast.segment_filter as unknown as SegmentFilter | null;
  const contactIds = await resolveContacts(
    serviceClient,
    membership.workspace_id,
    filter
  );

  if (contactIds.length === 0) {
    return NextResponse.json(
      { error: "No contacts match the targeting criteria" },
      { status: 400 }
    );
  }

  // If product targeting specified a channel, prioritize or filter to that channel
  const targetChannelId =
    filter?.productTargeting?.channelId &&
    filter.productTargeting.channelId !== "all_facebook"
      ? filter.productTargeting.channelId
      : null;

  let ccQuery = serviceClient
    .from("contact_channels")
    .select("contact_id, channel_id")
    .in("contact_id", contactIds);

  if (targetChannelId) {
    ccQuery = ccQuery.eq("channel_id", targetChannelId);
  }

  const { data: contactChannels } = await ccQuery;

  if (!contactChannels?.length) {
    return NextResponse.json(
      { error: "No matching contacts have active channel connections for this target" },
      { status: 400 }
    );
  }

  // Deduplicate: one recipient per contact
  const seen = new Set<string>();
  const recipientPairs: { contactId: string; channelId: string }[] = [];
  for (const cc of contactChannels) {
    if (!seen.has(cc.contact_id)) {
      seen.add(cc.contact_id);
      recipientPairs.push({
        contactId: cc.contact_id,
        channelId: cc.channel_id,
      });
    }
  }

  // Create broadcast_recipients
  const recipientRows = recipientPairs.map((r) => ({
    broadcast_id: broadcastId,
    contact_id: r.contactId,
    channel_id: r.channelId,
    status: "pending",
  }));

  // Insert in batches of 500
  const recipientIds: string[] = [];
  for (let i = 0; i < recipientRows.length; i += 500) {
    const batch = recipientRows.slice(i, i + 500);
    const { data: inserted, error: insertErr } = await serviceClient
      .from("broadcast_recipients")
      .insert(batch)
      .select("id");

    if (insertErr) {
      console.error("Failed to insert broadcast recipients:", insertErr);
      return NextResponse.json(
        { error: `Failed to create recipients: ${insertErr.message}` },
        { status: 500 }
      );
    }

    if (inserted) {
      recipientIds.push(...inserted.map((r) => r.id));
    }
  }

  if (recipientIds.length === 0) {
    return NextResponse.json(
      { error: "Failed to create broadcast recipients" },
      { status: 500 }
    );
  }

  // Schedule delivery
  await scheduleBroadcastDelivery(serviceClient, broadcastId, recipientIds);

  return NextResponse.json({
    broadcastId,
    totalRecipients: recipientIds.length,
    status: "sending",
  });
}

/**
 * Resolve segment filter and product targeting into contact IDs.
 * If no filter and no product targeting, returns all subscribed contacts in the workspace.
 */
export async function resolveContacts(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  filter: SegmentFilter | null
): Promise<string[]> {
  // Check if product targeting is enabled
  let productContactIds: Set<string> | null = null;
  if (
    filter?.productTargeting?.enabled &&
    filter.productTargeting.productName?.trim()
  ) {
    const res = await resolveProductAudience(
      supabase,
      workspaceId,
      filter.productTargeting
    );
    productContactIds = new Set(res.contactIds);
  }

  // No filter and no product targeting = all subscribed contacts
  if (!filter?.groups?.length && !productContactIds) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_subscribed", true)
      .limit(10000);
    return (data ?? []).map((c) => c.id);
  }

  // Start with all subscribed contacts
  const { data: allContacts } = await supabase
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_subscribed", true)
    .limit(10000);

  if (!allContacts?.length) return [];

  let baseIds = new Set(allContacts.map((c) => c.id));

  // Intersect with product targeting if active
  if (productContactIds !== null) {
    baseIds = intersectSets([baseIds, productContactIds]);
    if (baseIds.size === 0) return [];
  }

  // If no additional rule groups, return the product targeting matches
  if (!filter?.groups?.length) {
    return Array.from(baseIds);
  }

  // Evaluate each group against baseIds
  const groupResults: Set<string>[] = [];

  for (const group of filter.groups) {
    const ruleResults: Set<string>[] = [];

    for (const rule of group.rules) {
      const ids = await evaluateRule(supabase, workspaceId, rule, baseIds);
      ruleResults.push(ids);
    }

    // Combine rules within group
    let groupIds: Set<string>;
    if (group.combinator === "and") {
      groupIds = intersectSets(ruleResults);
    } else {
      groupIds = unionSets(ruleResults);
    }
    groupResults.push(groupIds);
  }

  // Combine groups
  let finalIds: Set<string>;
  if (filter.combinator === "and") {
    finalIds = intersectSets(groupResults);
  } else {
    finalIds = unionSets(groupResults);
  }

  return Array.from(finalIds);
}

async function evaluateRule(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  rule: SegmentRule,
  allContactIds: Set<string>
): Promise<Set<string>> {
  const contactIds = Array.from(allContactIds);
  if (contactIds.length === 0) return new Set();

  switch (rule.field) {
    case "has_tag": {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rule.value
        );

      let tagQuery = supabase
        .from("tags")
        .select("id")
        .eq("workspace_id", workspaceId);

      if (isUuid) {
        tagQuery = tagQuery.or(`id.eq.${rule.value},name.eq.${rule.value}`);
      } else {
        tagQuery = tagQuery.eq("name", rule.value);
      }

      const { data: tag } = await tagQuery.maybeSingle();
      if (!tag) return new Set();

      const { data: tagged } = await supabase
        .from("contact_tags")
        .select("contact_id")
        .eq("tag_id", tag.id)
        .in("contact_id", contactIds);

      return new Set((tagged ?? []).map((t) => t.contact_id));
    }

    case "missing_tag": {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rule.value
        );

      let tagQuery = supabase
        .from("tags")
        .select("id")
        .eq("workspace_id", workspaceId);

      if (isUuid) {
        tagQuery = tagQuery.or(`id.eq.${rule.value},name.eq.${rule.value}`);
      } else {
        tagQuery = tagQuery.eq("name", rule.value);
      }

      const { data: tag } = await tagQuery.maybeSingle();
      if (!tag) return new Set(contactIds);

      const { data: tagged } = await supabase
        .from("contact_tags")
        .select("contact_id")
        .eq("tag_id", tag.id)
        .in("contact_id", contactIds);

      const taggedSet = new Set((tagged ?? []).map((t) => t.contact_id));
      return new Set(contactIds.filter((id) => !taggedSet.has(id)));
    }

    case "facebook_page": {
      let chanQuery = supabase
        .from("channels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("platform", "facebook")
        .eq("is_active", true);

      if (rule.value && rule.value !== "all") {
        chanQuery = chanQuery.eq("id", rule.value);
      }

      const { data: channels } = await chanQuery;
      if (!channels?.length) {
        return rule.operator === "not_equals"
          ? new Set(contactIds)
          : new Set();
      }

      const channelIds = channels.map((c) => c.id);
      const { data: links } = await supabase
        .from("contact_channels")
        .select("contact_id")
        .in("channel_id", channelIds)
        .in("contact_id", contactIds);

      const linkedSet = new Set((links ?? []).map((l) => l.contact_id));
      if (rule.operator === "not_equals") {
        return new Set(contactIds.filter((id) => !linkedSet.has(id)));
      }
      return linkedSet;
    }

    case "product_interest": {
      const res = await resolveProductAudience(supabase, workspaceId, {
        enabled: true,
        productName: rule.value,
        audienceType: "interested",
      });
      const idSet = new Set(res.contactIds);
      return new Set(contactIds.filter((id) => idSet.has(id)));
    }

    case "product_purchased": {
      const res = await resolveProductAudience(supabase, workspaceId, {
        enabled: true,
        productName: rule.value,
        audienceType: "purchased",
      });
      const idSet = new Set(res.contactIds);
      return new Set(contactIds.filter((id) => idSet.has(id)));
    }

    case "message_contains": {
      const kw = rule.value.toLowerCase().trim();
      if (!kw) return new Set(contactIds);

      const { data: convs } = await supabase
        .from("conversations")
        .select("contact_id, last_message_preview")
        .eq("workspace_id", workspaceId)
        .in("contact_id", contactIds)
        .ilike("last_message_preview", `%${kw}%`);

      const matched = new Set((convs ?? []).map((c) => c.contact_id));

      const { data: comments } = await supabase
        .from("comment_logs")
        .select("author_id, comment_text")
        .eq("workspace_id", workspaceId)
        .ilike("comment_text", `%${kw}%`);

      if (comments?.length) {
        const authorIds = comments
          .map((c) => c.author_id)
          .filter(Boolean) as string[];
        if (authorIds.length > 0) {
          const { data: links } = await supabase
            .from("contact_channels")
            .select("contact_id")
            .in("platform_sender_id", authorIds)
            .in("contact_id", contactIds);
          for (const l of links ?? []) matched.add(l.contact_id);
        }
      }

      return matched;
    }

    case "platform": {
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("platform", rule.value as Platform);

      if (!channels?.length) {
        return rule.operator === "not_equals"
          ? new Set(contactIds)
          : new Set();
      }

      const channelIds = channels.map((c) => c.id);
      const { data: links } = await supabase
        .from("contact_channels")
        .select("contact_id")
        .in("channel_id", channelIds)
        .in("contact_id", contactIds);

      const linkedSet = new Set((links ?? []).map((l) => l.contact_id));
      if (rule.operator === "not_equals") {
        return new Set(contactIds.filter((id) => !linkedSet.has(id)));
      }
      return linkedSet;
    }

    case "is_subscribed": {
      if (rule.value === "false") {
        return new Set();
      }
      return new Set(contactIds);
    }

    case "last_interaction": {
      const date = new Date(rule.value).toISOString();
      let query = supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("id", contactIds);

      if (rule.operator === "before") {
        query = query.lt("last_interaction_at", date);
      } else {
        query = query.gt("last_interaction_at", date);
      }

      const { data } = await query;
      return new Set((data ?? []).map((c) => c.id));
    }

    case "custom_field": {
      let slug = "";
      let fieldValue = "";

      if (rule.value.includes("::")) {
        const parts = rule.value.split("::");
        slug = parts[0] || "";
        fieldValue = parts.slice(1).join("::");
      } else {
        const parts = rule.value.split(":");
        slug = parts[0] || "";
        fieldValue = parts.slice(1).join(":");
      }

      const { data: fieldDef } = await supabase
        .from("custom_field_definitions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("slug", slug)
        .single();

      if (!fieldDef) return new Set();

      let cfQuery = supabase
        .from("contact_custom_fields")
        .select("contact_id")
        .eq("field_id", fieldDef.id)
        .in("contact_id", contactIds);

      switch (rule.operator) {
        case "equals":
          cfQuery = cfQuery.eq("value", fieldValue);
          break;
        case "not_equals":
          cfQuery = cfQuery.neq("value", fieldValue);
          break;
        case "contains":
          cfQuery = cfQuery.ilike("value", `%${fieldValue}%`);
          break;
        case "gt":
          cfQuery = cfQuery.gt("value", fieldValue);
          break;
        case "lt":
          cfQuery = cfQuery.lt("value", fieldValue);
          break;
      }

      const { data } = await cfQuery;
      return new Set((data ?? []).map((c) => c.contact_id));
    }

    default:
      return new Set(contactIds);
  }
}

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  const result = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    for (const item of result) {
      if (!sets[i].has(item)) result.delete(item);
    }
  }
  return result;
}

function unionSets(sets: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const s of sets) {
    for (const item of s) {
      result.add(item);
    }
  }
  return result;
}
