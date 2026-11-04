// Invitation and recovery links from Supabase Auth (token hash flow).
import { NextResponse, type NextRequest } from "next/server";
import { createUserServerClient } from "@/lib/supabase/server";

const TYPES = new Set(["invite", "recovery", "email", "magiclink"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "";
  const target = url.clone();
  target.search = "";
  if (tokenHash && TYPES.has(type)) {
    const client = await createUserServerClient();
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "recovery" | "email" | "magiclink",
    });
    if (!error) {
      target.pathname = type === "invite" || type === "recovery" ? "/account/password" : "/";
      return NextResponse.redirect(target);
    }
  }
  target.pathname = "/login";
  return NextResponse.redirect(target);
}
