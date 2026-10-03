import WorkspacePage from "@/components/workspace-page";
export const dynamic = "force-dynamic";

export default function GuidePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WorkspacePage {...props} section="guide" />;
}
