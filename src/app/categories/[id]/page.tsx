import WorkspacePage from "@/components/workspace-page";
export const dynamic = "force-dynamic";

export default async function CategoryPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  return <WorkspacePage searchParams={props.searchParams} section="category" category={id} />;
}
