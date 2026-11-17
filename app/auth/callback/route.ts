import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (errorParam) {
    if (next === "/reset-password") {
      return NextResponse.redirect(
        `${origin}/reset-password?error=${encodeURIComponent(errorDesc || errorParam)}`
      );
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDesc || errorParam)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    } else {
      if (next === "/reset-password") {
        return NextResponse.redirect(
          `${origin}/reset-password?error=${encodeURIComponent(error.message)}`
        );
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
