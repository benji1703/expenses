import WorkspacePage from "@/components/workspace-page";
export const dynamic = "force-dynamic";

export default function ExpensesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WorkspacePage {...props} section="expenses" />;
}
