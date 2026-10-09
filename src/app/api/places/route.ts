import { NextRequest, NextResponse } from "next/server";
import { placeSearch } from "@/lib/geo/api";

// Autocomplete for the commute cities on the preferences page. The place data
// never changes between builds, so answers can be cached for a day.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await placeSearch(params.get("q") ?? "", params.get("exact") === "1");
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
