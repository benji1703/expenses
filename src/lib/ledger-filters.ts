import { z } from "zod";

/** Shared online/offline filter contract; repeated or malformed values never reach queries. */
export function ledgerFilters(params: Record<string, unknown> | URLSearchParams, routeCategory = "") {
  const value = (key: string) => {
    if (params instanceof URLSearchParams) {
      const values = params.getAll(key);
      return values.length === 1 ? values[0] : "";
    }
    return typeof params[key] === "string" ? params[key] as string : "";
  };
  const requestedMonth = value("month");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
    && Number(requestedMonth.slice(0, 4)) >= 2000 && Number(requestedMonth.slice(0, 4)) <= 2100 ? requestedMonth : "";
  const requestedCategory = routeCategory || value("category");
  return {
    month,
    categoryId: z.uuid().safeParse(requestedCategory).success ? requestedCategory : "",
    search: value("q").trim().slice(0, 100),
    page: Math.max(1, Math.min(10000, Math.floor(Number(value("page"))) || 1)),
  };
}
