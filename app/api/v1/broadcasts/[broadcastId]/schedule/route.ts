import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { scheduleBroadcastRun, cancelBroadcastSchedule } from "@/lib/scheduler";
import type { Json } from "@/lib/types/database";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ broadcastId: string }> }
) {
  const { broadcastId } = await params;
  const supabase = await createClient();

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
      { error: `Cannot schedule broadcast with status "${broadcast.status}"` },
      { status: 400 }
    );
  }

  const body = await request.json();
  const scheduledForStr = body.scheduledFor;
  if (!scheduledForStr) {
    return NextResponse.json(
      { error: "scheduledFor is required" },
      { status: 400 }
    );
  }

  const scheduledDate = new Date(scheduledForStr);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid date format for scheduledFor" },
      { status: 400 }
    );
  }

  if (scheduledDate.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Scheduled time must be in the future" },
      { status: 400 }
    );
  }

  // Update content or segment filter if provided
  const updatePayload: Record<string, unknown> = {};
  if (body.messageContent) {
    updatePayload.message_content = body.messageContent as unknown as Json;
  }
  if (body.segmentFilter !== undefined) {
    updatePayload.segment_filter = body.segmentFilter as unknown as Json;
  }

  if (Object.keys(updatePayload).length > 0) {
    await supabase
      .from("broadcasts")
      .update(updatePayload)
      .eq("id", broadcastId);
  }

  try {
    const serviceClient = await createServiceClient();
    const updated = await scheduleBroadcastRun(
      serviceClient,
      broadcastId,
      scheduledDate
    );

    return NextResponse.json({
      broadcastId,
      scheduledFor: scheduledDate.toISOString(),
      status: "scheduled",
      broadcast: updated,
    });
  } catch (err) {
    console.error("Failed to schedule broadcast:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to schedule broadcast" },
      { status: 500 }
    );
  }
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

  const { data: broadcast, error: broadcastErr } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .eq("workspace_id", membership.workspace_id)
    .single();

  if (broadcastErr || !broadcast) {
    return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  }

  try {
    const serviceClient = await createServiceClient();
    const updated = await cancelBroadcastSchedule(serviceClient, broadcastId);

    return NextResponse.json({
      broadcastId,
      status: "draft",
      broadcast: updated,
    });
  } catch (err) {
    console.error("Failed to cancel broadcast schedule:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to cancel schedule" },
      { status: 500 }
    );
  }
}
