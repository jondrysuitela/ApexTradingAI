import { getSupabaseServerClient } from "./server";

export async function getCurrentUser() {
  const client = await getSupabaseServerClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getUser();
  return data.user ?? null;
}
