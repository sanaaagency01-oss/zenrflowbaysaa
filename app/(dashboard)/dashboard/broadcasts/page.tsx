import { getWorkspace } from "@/lib/workspace";
import { BroadcastsView } from "./broadcasts-view";

export default async function BroadcastsPage() {
  const { workspace, supabase } = await getWorkspace();

  const [broadcastsRes, channelsRes] = await Promise.all([
    supabase
      .from("broadcasts")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("channels")
      .select("*")
      .eq("workspace_id", workspace.id)
      .eq("platform", "facebook")
      .eq("is_active", true),
  ]);

  return (
    <BroadcastsView
      broadcasts={broadcastsRes.data ?? []}
      workspaceId={workspace.id}
      facebookChannels={channelsRes.data ?? []}
    />
  );
}
