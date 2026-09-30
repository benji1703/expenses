import { requireMember } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase } = await requireMember();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new NextResponse("Not found", { status: 404 });
  const { data } = await supabase
    .from("expenses")
    .select("receipt_path")
    .eq("id", id)
    .single();
  if (!data?.receipt_path)
    return new NextResponse("Not found", { status: 404 });
  const { data: link, error } = await supabase.storage
    .from("receipts")
    .createSignedUrl(data.receipt_path, 60);
  if (error || !link)
    return new NextResponse("Receipt unavailable", { status: 503 });
  return NextResponse.redirect(link.signedUrl, {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
