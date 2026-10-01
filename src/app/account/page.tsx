import Home from "@/app/page";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Home searchParams={searchParams} section="account" />;
}
