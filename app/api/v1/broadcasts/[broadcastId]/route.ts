import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ broadcastId: string }> }
) {
  const { broadcastId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .single();

  if (error || !broadcast) {
    return NextResponse.json(
      { error: "Broadcast олдсонгүй" },
      { status: 404 }
    );
  }

  return NextResponse.json(broadcast);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ broadcastId: string }> }
) {
  const { broadcastId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }

  if (body.messageContent !== undefined) {
    updates.message_content = body.messageContent;
  }

  if (body.segmentFilter !== undefined) {
    updates.segment_filter = body.segmentFilter;
  }

  const { data: updated, error } = await supabase
    .from("broadcasts")
    .update(updates)
    .eq("id", broadcastId)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message || "Шинэчлэхэд алдаа гарлаа" },
      { status: 500 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ broadcastId: string }> }
) {
  const { broadcastId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  // 1. Clean up any pending scheduled trigger/send jobs for this broadcast
  try {
    await supabase
      .from("scheduled_jobs")
      .delete()
      .contains("payload", { broadcastId });
  } catch (err) {
    console.warn("Could not clean up scheduled_jobs for broadcast:", err);
  }

  // 2. Delete broadcast recipients (foreign key cascade also handles this)
  try {
    await supabase
      .from("broadcast_recipients")
      .delete()
      .eq("broadcast_id", broadcastId);
  } catch (err) {
    console.warn("Could not clean up broadcast_recipients:", err);
  }

  // 3. Delete the broadcast record
  const { error } = await supabase
    .from("broadcasts")
    .delete()
    .eq("id", broadcastId);

  if (error) {
    return NextResponse.json(
      { error: `Устгахад алдаа гарлаа: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    deletedId: broadcastId,
    message: "Broadcast амжилттай устгагдлаа",
  });
}
