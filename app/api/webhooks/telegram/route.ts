import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { executeFlow } from "@/lib/flow-engine/engine";
import { matchTrigger } from "@/lib/flow-engine/trigger-matcher";
import { messagePreview } from "@/lib/message-preview";

export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get("secret");
    const supabase = await createServiceClient();

    // Verify channel with secret
    const query = supabase
      .from("channels")
      .select("id, workspace_id, platform, webhook_secret")
      .eq("platform", "telegram")
      .eq("is_active", true);

    if (secret) {
      query.eq("webhook_id", secret);
    }

    const { data: channels, error: channelError } = await query;
    if (channelError || !channels || channels.length === 0) {
      console.error("[telegram webhook] Channel not found for secret:", secret);
      return NextResponse.json({ ok: false, error: "Channel not found" }, { status: 404 });
    }

    const channel = channels[0];
    const update = await request.json();

    const message = update.message || update.edited_message;
    const callbackQuery = update.callback_query;

    if (!message && !callbackQuery) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const fromUser = message?.from || callbackQuery?.from;
    const chat = message?.chat || callbackQuery?.message?.chat;

    if (!fromUser || !chat) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const senderId = String(fromUser.id);
    const chatId = String(chat.id);
    const text = message?.text || callbackQuery?.data || "";
    const callbackData = callbackQuery?.data;

    const displayName = [fromUser.first_name, fromUser.last_name]
      .filter(Boolean)
      .join(" ") || fromUser.username || `Telegram User ${senderId}`;

    // 1. Find or create contact
    let contactId: string | null = null;
    const { data: existingChannelLink } = await supabase
      .from("contact_channels")
      .select("contact_id")
      .eq("channel_id", channel.id)
      .eq("platform_sender_id", senderId)
      .maybeSingle();

    if (existingChannelLink?.contact_id) {
      contactId = existingChannelLink.contact_id;
      // Update contact metadata
      await supabase
        .from("contacts")
        .update({
          display_name: displayName,
          last_interaction_at: new Date().toISOString(),
        })
        .eq("id", contactId);
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          workspace_id: channel.workspace_id,
          display_name: displayName,
          last_interaction_at: new Date().toISOString(),
          metadata: { telegram_username: fromUser.username || null },
        })
        .select("id")
        .single();

      if (contactError || !newContact) {
        console.error("[telegram webhook] Failed to create contact:", contactError);
        return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
      }

      contactId = newContact.id;

      // Link contact to channel
      await supabase.from("contact_channels").insert({
        contact_id: contactId,
        channel_id: channel.id,
        platform_sender_id: senderId,
      });
    }

    // 2. Find or create conversation
    const preview = messagePreview(text);
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .upsert(
        {
          workspace_id: channel.workspace_id,
          channel_id: channel.id,
          contact_id: contactId,
          platform: "telegram",
          late_conversation_id: `telegram:${chatId}`,
          status: "open",
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          unread_count: 1,
        },
        { onConflict: "channel_id,contact_id" }
      )
      .select("id, is_automation_paused")
      .single();

    if (convError || !conversation) {
      console.error("[telegram webhook] Failed to upsert conversation:", convError);
      return NextResponse.json({ error: "Failed to upsert conversation" }, { status: 500 });
    }

    // 3. Save incoming message locally
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      text,
      platform_message_id: message?.message_id ? String(message.message_id) : undefined,
      callback_data: callbackData || null,
      status: "delivered",
      created_at: new Date().toISOString(),
    });

    // 4. Flow engine execution
    if (!conversation.is_automation_paused) {
      const incomingMessage = {
        text: text || undefined,
        callbackData: callbackData || undefined,
        quickReplyPayload: callbackData || undefined,
        postbackPayload: callbackData || undefined,
        sender: {
          id: senderId,
          name: displayName,
          username: fromUser.username || undefined,
        },
      };

      const trigger = await matchTrigger(supabase, {
        channelId: channel.id,
        workspaceId: channel.workspace_id,
        conversationId: conversation.id,
        message: incomingMessage,
        isFirstMessage: !existingChannelLink,
      });

      if (trigger) {
        await executeFlow(supabase, {
          triggerId: trigger.id,
          flowId: trigger.flow_id,
          channelId: channel.id,
          contactId,
          conversationId: conversation.id,
          workspaceId: channel.workspace_id,
          incomingMessage,
          lateConversationId: `telegram:${chatId}`,
          lateAccountId: `telegram:${channel.id}`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram webhook] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
