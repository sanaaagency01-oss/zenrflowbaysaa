import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  resolveProductAudience,
  type ProductTargeting,
} from "@/lib/product-audience";
import type { Database } from "@/lib/types/database";

export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json();
    const productTargeting = body.productTargeting as ProductTargeting | undefined;

    if (!productTargeting || !productTargeting.productName?.trim()) {
      return NextResponse.json({
        totalRecipients: 0,
        contacts: [],
      });
    }

    const serviceClient = await createServiceClient();
    const result = await resolveProductAudience(
      serviceClient,
      membership.workspace_id,
      productTargeting
    );

    return NextResponse.json({
      totalRecipients: result.contactIds.length,
      contacts: result.contacts,
    });
  } catch (err) {
    console.error("Audience preview error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve audience" },
      { status: 500 }
    );
  }
}
