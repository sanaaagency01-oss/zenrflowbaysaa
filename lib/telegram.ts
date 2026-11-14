/**
 * Direct Telegram Bot API integration (No Zernio needed).
 */

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

export async function verifyTelegramToken(token: string): Promise<TelegramBotInfo> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = await res.json();
  if (!res.ok || !data.ok || !data.result) {
    throw new Error(data.description || "Invalid Telegram Bot Token");
  }
  return data.result as TelegramBotInfo;
}

export async function setTelegramWebhook(
  token: string,
  webhookUrl: string,
  secretToken?: string
): Promise<boolean> {
  const url = new URL(`https://api.telegram.org/bot${token}/setWebhook`);
  url.searchParams.set("url", webhookUrl);
  if (secretToken) {
    url.searchParams.set("secret_token", secretToken);
  }
  url.searchParams.set("allowed_updates", JSON.stringify(["message", "callback_query"]));

  const res = await fetch(url.toString(), { method: "POST" });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || "Failed to set Telegram webhook");
  }
  return true;
}

export async function deleteTelegramWebhook(token: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: "POST",
  });
  const data = await res.json();
  return Boolean(data.ok);
}

export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string,
  options?: {
    replyMarkup?: {
      inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
      keyboard?: Array<Array<{ text: string }>>;
      resize_keyboard?: boolean;
      one_time_keyboard?: boolean;
    };
    parseMode?: "HTML" | "MarkdownV2" | "Markdown";
  }
): Promise<{ messageId: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (options?.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }
  if (options?.parseMode) {
    body.parse_mode = options.parseMode;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || "Failed to send Telegram message");
  }

  return { messageId: data.result.message_id };
}

export async function sendTelegramPhoto(
  token: string,
  chatId: string | number,
  photoUrl: string,
  caption?: string,
  options?: {
    replyMarkup?: {
      inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
    };
  }
): Promise<{ messageId: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo: photoUrl,
  };
  if (caption) body.caption = caption;
  if (options?.replyMarkup) body.reply_markup = options.replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || "Failed to send Telegram photo");
  }

  return { messageId: data.result.message_id };
}
