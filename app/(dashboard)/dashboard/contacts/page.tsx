import { getWorkspace } from "@/lib/workspace";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const { workspace, supabase } = await getWorkspace();

  const [contactsRes, tagsRes, countRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, contact_tags(tag_id, tags(*))")
      .eq("workspace_id", workspace.id)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase
      .from("tags")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
  ]);

  return (
    <ContactsView
      contacts={contactsRes.data ?? []}
      totalCount={countRes.count ?? contactsRes.data?.length ?? 0}
      tags={tagsRes.data ?? []}
      workspaceId={workspace.id}
    />
  );
}
