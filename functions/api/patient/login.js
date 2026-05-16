import {
  createSession,
  ensurePortalTables,
  json,
  sha256,
  tursoExecute,
} from "../../_lib/server.js";

export async function onRequestPost(context) {
  const ensured = await ensurePortalTables(context);
  if (!ensured.ok) return json({ error: ensured.error }, { status: ensured.status || 500 });

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const participantNo = Number(payload?.participantNo);
  const password = String(payload?.password || "");

  if (!Number.isInteger(participantNo) || participantNo <= 0 || !password) {
    return json({ error: "Participant number and password are required." }, { status: 400 });
  }

  const result = await tursoExecute(
    context,
    `SELECT participant_no, password_hash, enabled
     FROM patient_portal_access
     WHERE participant_no = ?`,
    [{ type: "integer", value: participantNo }],
  );

  if (!result.ok) return json({ error: result.error }, { status: result.status || 500 });
  if (result.rows.length === 0 || Number(result.rows[0].enabled) !== 1) {
    return json({ error: "Patient access is not configured." }, { status: 403 });
  }

  const passwordHash = await sha256(password);
  if (passwordHash !== result.rows[0].password_hash) {
    return json({ error: "Invalid participant number or password." }, { status: 401 });
  }

  const session = await createSession(context, {
    sessionType: "patient",
    participantNo,
  });

  if (!session.ok) {
    return json({ error: session.error || "Failed to create session." }, { status: session.status || 500 });
  }

  return json({ ok: true, participantNo }, { headers: session.headers });
}
