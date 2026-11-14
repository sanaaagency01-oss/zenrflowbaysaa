import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { messagePreview } from "@/lib/message-preview";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * GET /api/v1/messages?conversationId=...
 *
 * Fetches messages from local DB for direct Telegram, or from Zernio API for Zernio channels.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // Look up conversation with channel info
  const { data: conversation } = await supabase
    .from("conversations")
    .select("late_conversation_id, workspace_id, channels(late_account_id, platform, webhook_secret)")
    .eq("id", conversationId)
    .single();

  if (!conversation?.late_conversation_id) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const channel = conversation.channels as { late_account_id: string; platform?: string; webhook_secret?: string } | null;

  // Direct Telegram conversation: read directly from local messages table
  if (conversation.late_conversation_id.startsWith("telegram:") || channel?.platform === "telegram") {
    const { data: localMessages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    return NextResponse.json(localMessages || []);
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  if (!channel?.late_account_id) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Fetch messages from Zernio API
  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const res = await zernio.messages.getInboxConversationMessages({
      path: { conversationId: conversation.late_conversation_id },
      query: { accountId: channel.late_account_id },
    });

    const zernioMessages =
      (res.data as { messages?: unknown[] })?.messages ??
      (res.data as { data?: unknown[] })?.data ??
      [];

    const messages = zernioMessages.map((m: any) => ({
      id: m.id,
      conversation_id: conversationId,
      direction: m.direction === "outbound" ? "outbound" : "inbound",
      text: m.text ?? m.message ?? null,
      attachments: m.attachments?.length ? m.attachments : null,
      quick_reply_payload: null,
      postback_payload: null,
      callback_data: null,
      platform_message_id: m.platformMessageId ?? null,
      sent_by_flow_id: null,
      sent_by_node_id: null,
      sent_by_user_id: null,
      status: "sent",
      created_at: m.sentAt ?? m.createdAt ?? new Date().toISOString(),
    }));

    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to fetch messages from Zernio API:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/messages
 *
 * Sends a message via direct Telegram Bot API or Zernio API.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { conversationId, text } = body;

  if (!conversationId || !text) {
    return NextResponse.json(
      { error: "conversationId and text required" },
      { status: 400 }
    );
  }

  // Get conversation with channel info
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, channels(*)")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const channel = conversation.channels as { late_account_id: string; platform?: string; webhook_secret?: string } | null;

  // ── Direct Telegram send ──────────────────────────────────────────────────
  if (conversation.late_conversation_id?.startsWith("telegram:") || channel?.platform === "telegram") {
    try {
      const chatId = conversation.late_conversation_id?.replace("telegram:", "") || "";
      if (!chatId) {
        return NextResponse.json({ error: "No Telegram chat ID found" }, { status: 400 });
      }
      const botToken = channel?.webhook_secret;

      if (!botToken) {
        return NextResponse.json({ error: "Telegram bot token not found" }, { status: 400 });
      }

      const tgRes = await sendTelegramMessage(botToken, chatId, text);

      // Store message locally
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: "outbound",
        text,
        sent_by_user_id: user.id,
        platform_message_id: String(tgRes.messageId),
        status: "sent",
      });

      // Update conversation
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: messagePreview(text),
        })
        .eq("id", conversationId);

      return NextResponse.json(
        {
          id: `sent-${tgRes.messageId}`,
          conversation_id: conversationId,
          direction: "outbound",
          text,
          attachments: null,
          quick_reply_payload: null,
          postback_payload: null,
          callback_data: null,
          platform_message_id: String(tgRes.messageId),
          sent_by_flow_id: null,
          sent_by_node_id: null,
          sent_by_user_id: user.id,
          status: "sent",
          created_at: new Date().toISOString(),
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("[direct telegram send] error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to send Telegram message" },
        { status: 500 }
      );
    }
  }

  // ── Zernio send ───────────────────────────────────────────────────────────
  if (!conversation.late_conversation_id) {
    return NextResponse.json(
      { error: "No Zernio conversation ID linked to this conversation" },
      { status: 400 }
    );
  }

  if (!channel?.late_account_id) {
    return NextResponse.json({ error: "Channel not found or missing Zernio account ID" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const res = await zernio.messages.sendInboxMessage({
      path: { conversationId: conversation.late_conversation_id },
      body: { accountId: channel.late_account_id, message: text },
    });

    const messageId = (res.data as any)?.data?.messageId ?? null;

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messagePreview(text),
      })
      .eq("id", conversationId);

    return NextResponse.json(
      {
        id: messageId ?? `sent-${Date.now()}`,
        conversation_id: conversationId,
        direction: "outbound",
        text,
        attachments: null,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: messageId,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: user.id,
        status: "sent",
        created_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to send message via Zernio API:", error);
    return NextResponse.json(
      { error: `Failed to send message: ${error}` },
      { status: 500 }
    );
  }
}
