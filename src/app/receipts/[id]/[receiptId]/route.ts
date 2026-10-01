import { requireMember } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> },
) {
  const { supabase } = await requireMember();
  const { id, receiptId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(receiptId).success)
    return new NextResponse("Not found", { status: 404 });
  const { data: receipt } = await supabase
    .from("expense_receipts")
    .select("path")
    .eq("expense_id", id)
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt) return new NextResponse("Not found", { status: 404 });
  const { data: link, error } = await supabase.storage.from("receipts").createSignedUrl(receipt.path, 60);
  if (error || !link) return new NextResponse("Receipt unavailable", { status: 503 });
  return NextResponse.redirect(link.signedUrl, {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
