import { ensurePortalTables, getSession, json, tursoExecute } from "../_lib/server.js";

export async function onRequestPost(context) {
  const session = await getSession(context, "admin");
  if (!session) return json({ error: "Unauthorized." }, { status: 401 });
  const ensured = await ensurePortalTables(context);
  if (!ensured.ok) return json({ error: ensured.error }, { status: ensured.status || 500 });

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sql = payload?.sql;
  const args = Array.isArray(payload?.args) ? payload.args : [];

  if (!sql || typeof sql !== "string") {
    return json({ error: "The request must include a SQL string." }, { status: 400 });
  }

  const result = await tursoExecute(context, sql, args);
  if (!result.ok) {
    return json({ error: result.error }, { status: result.status || 500 });
  }

  return json({
    rows: result.rows || [],
  });
}
