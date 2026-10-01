import Home from "@/app/page";
export const dynamic = "force-dynamic";

export default function ExpensesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Home {...props} section="expenses" />;
}
