import { deleteCurrentSession, json } from "../../_lib/server.js";

export async function onRequestPost(context) {
  const result = await deleteCurrentSession(context, "admin");
  if (!result.ok) {
    return json({ error: result.error || "Failed to log out." }, { status: result.status || 500 });
  }

  return json({ ok: true }, { headers: result.headers });
}
