import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTelegramToken, setTelegramWebhook } from "@/lib/telegram";
import crypto from "crypto";

async function getWorkspace(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(*)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.workspaces) return null;
  return membership.workspaces;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const workspace = await getWorkspace(supabase);
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token } = await request.json();
    const cleanToken = String(token || "").trim();

    if (!cleanToken) {
      return NextResponse.json({ error: "Telegram Bot Token is required" }, { status: 400 });
    }

    // 1. Verify token with Telegram API
    const botInfo = await verifyTelegramToken(cleanToken);

    // 2. Generate a webhook secret token
    const webhookSecret = crypto.randomBytes(16).toString("hex");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://zenrflowbaysaa-4j8o.vercel.app";
    const webhookUrl = `${appUrl}/api/webhooks/telegram?secret=${webhookSecret}`;

    // 3. Set webhook on Telegram
    await setTelegramWebhook(cleanToken, webhookUrl, webhookSecret);

    // 4. Save channel into database
    const lateAccountId = `telegram:${botInfo.id}`;
    const { data: channel, error: dbError } = await supabase
      .from("channels")
      .upsert(
        {
          workspace_id: workspace.id,
          platform: "telegram",
          late_account_id: lateAccountId,
          username: botInfo.username,
          display_name: botInfo.first_name,
          webhook_secret: cleanToken,
          webhook_id: webhookSecret,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,late_account_id" }
      )
      .select()
      .single();

    if (dbError) {
      console.error("[telegram connect] DB error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, channel });
  } catch (err) {
    console.error("[telegram connect] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to connect Telegram Bot" },
      { status: 400 }
    );
  }
}
