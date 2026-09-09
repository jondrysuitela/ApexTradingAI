import { getSupabaseServerClient } from "./server";
import { env } from "@/server/env";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";

export const LOCAL_USER_EMAIL = "local@apex.local";

export async function getCurrentUser() {
  const client = await getSupabaseServerClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (user) {
    return user.id;
  }

  const localId = env.LOCAL_USER_ID;
  if (!localId) {
    return null;
  }

  await ensureLocalUser(localId);
  return localId;
}

async function ensureLocalUser(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    return;
  }

  await db.insert(users).values({ id, email: LOCAL_USER_EMAIL }).onConflictDoNothing();
}
