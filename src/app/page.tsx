import WorkspacePage from "@/components/workspace-page";

export const dynamic = "force-dynamic";
export default function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WorkspacePage searchParams={searchParams} />;
}
