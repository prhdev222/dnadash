import {
  baseUrl,
  getSession,
  json,
  sha256,
  tursoExecute,
  ensurePortalTables,
} from "../../_lib/server.js";

export async function onRequestGet(context) {
  const session = await getSession(context, "admin");
  if (!session) return json({ error: "Unauthorized." }, { status: 401 });

  const ensured = await ensurePortalTables(context);
  if (!ensured.ok) return json({ error: ensured.error }, { status: ensured.status || 500 });

  const result = await tursoExecute(
    context,
    `SELECT p.participant_no,
            CASE WHEN pa.participant_no IS NULL THEN 0 ELSE 1 END AS has_access,
            COALESCE(pa.enabled, 0) AS enabled,
            COALESCE(pa.password_plain, '') AS password_plain,
            pa.updated_at
     FROM patients p
     LEFT JOIN patient_portal_access pa ON pa.participant_no = p.participant_no
     ORDER BY p.participant_no`,
  );

  if (!result.ok) return json({ error: result.error }, { status: result.status || 500 });

  const root = baseUrl(context.request);
  return json({
    rows: result.rows.map((row) => ({
      ...row,
      portal_url: `${root}/patient/?participant=${row.participant_no}`,
    })),
  });
}

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

  const participantNo = Number(payload?.participantNo);
  const password = String(payload?.password || "");
  const enabled = payload?.enabled === false ? 0 : 1;

  if (!Number.isInteger(participantNo) || participantNo <= 0) {
    return json({ error: "Participant number is required." }, { status: 400 });
  }

  if (password.length < 6) {
    return json({ error: "Patient password must be at least 6 characters." }, { status: 400 });
  }

  const exists = await tursoExecute(
    context,
    "SELECT participant_no FROM patients WHERE participant_no = ?",
    [{ type: "integer", value: participantNo }],
  );

  if (!exists.ok) return json({ error: exists.error }, { status: exists.status || 500 });
  if (exists.rows.length === 0) {
    return json({ error: "Participant not found." }, { status: 404 });
  }

  const passwordHash = await sha256(password);
  const existingAccess = await tursoExecute(
    context,
    "SELECT participant_no FROM patient_portal_access WHERE participant_no = ?",
    [{ type: "integer", value: participantNo }],
  );

  if (!existingAccess.ok) {
    return json({ error: existingAccess.error }, { status: existingAccess.status || 500 });
  }

  const sql = existingAccess.rows.length
    ? `UPDATE patient_portal_access
       SET password_hash = ?, password_plain = ?, enabled = ?, updated_at = datetime('now')
       WHERE participant_no = ?`
    : `INSERT INTO patient_portal_access (password_hash, password_plain, enabled, updated_at, participant_no)
       VALUES (?, ?, ?, datetime('now'), ?)`;

  const result = await tursoExecute(context, sql, [
    { type: "text", value: passwordHash },
    { type: "text", value: password },
    { type: "integer", value: enabled },
    { type: "integer", value: participantNo },
  ]);

  if (!result.ok) return json({ error: result.error }, { status: result.status || 500 });

  return json({
    ok: true,
    participantNo,
    portalUrl: `${baseUrl(context.request)}/patient/?participant=${participantNo}`,
  });
}
