import { withRequestTimeout } from "./request-timeout.ts";

export async function requestExpenseExport(params: URLSearchParams, fetcher: typeof fetch = fetch) {
  const from = params.get("from"), to = params.get("to");
  if (from && to && from > to) throw new Error("תאריך ההתחלה חייב להיות לפני תאריך הסיום.");
  return withRequestTimeout(async (signal) => {
    let response: Response;
    try {
      response = await fetcher(`/api/exports/expenses?${params}`, { cache: "no-store", signal });
    } catch {
      throw new Error("הורדת הקובץ נכשלה. בדקו את החיבור ונסו שוב.");
    }
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error ?? "לא ניתן להוריד את הקובץ. נסו שוב.");
    }
    // An expired session may redirect the request to login with a successful status.
    if (response.headers.get("Content-Type")?.includes("text/html")) {
      throw new Error("יש להיכנס מחדש לפני הורדת הוצאות.");
    }
    let filename = `meshek-48-expenses.${params.get("format") ?? "xlsx"}`;
    const encodedName = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encodedName) {
      try {
        const decoded = decodeURIComponent(encodedName);
        if (/^[a-zA-Z0-9_.-]+$/.test(decoded)) filename = decoded;
      } catch { /* Use the local filename if the header is malformed. */ }
    }
    try {
      return { blob: await response.blob(), filename };
    } catch {
      throw new Error("הורדת הקובץ לא הושלמה. בדקו את החיבור ונסו שוב.");
    }
  }, 90_000);
}
