const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sessionCookieName(sessionType) {
  return sessionType === "patient" ? "dna_dash_patient_session" : "dna_dash_admin_session";
}

export function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

export function getTursoHttpUrl(url) {
  if (!url) return null;
  if (url.startsWith("libsql://")) return url.replace("libsql://", "https://");
  if (url.startsWith("https://")) return url;
  return null;
}

export async function tursoExecute(context, sql, args = []) {
  const dbUrl = getTursoHttpUrl(context.env.TURSO_DATABASE_URL);
  const authToken = context.env.TURSO_AUTH_TOKEN;

  if (!dbUrl || !authToken) {
    return {
      ok: false,
      status: 500,
      error:
        "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in the server environment.",
    };
  }

  const response = await fetch(`${dbUrl}/v3/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql, args } }],
    }),
  });

  const data = await response.json();
  const result = data?.results?.[0];

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: result?.error?.message || "Database request failed.",
    };
  }

  if (!result) return { ok: true, rows: [] };
  if (result.type === "error") {
    return { ok: false, status: 400, error: result.error.message };
  }

  const cols = result.response?.result?.cols?.map((col) => col.name) || [];
  const rows = result.response?.result?.rows || [];

  return {
    ok: true,
    rows: rows.map((row) =>
      Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? row[i]])),
    ),
  };
}

export async function ensurePortalTables(context) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS portal_sessions (
      session_id TEXT PRIMARY KEY,
      session_type TEXT NOT NULL,
      admin_username TEXT,
      participant_no INTEGER,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS patient_portal_access (
      participant_no INTEGER PRIMARY KEY,
      password_hash TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
    )`,
  ];

  for (const sql of statements) {
    const result = await tursoExecute(context, sql);
    if (!result.ok) return result;
  }

  return { ok: true };
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseCookies(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) return [item, ""];
        return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      }),
  );
}

function makeCookie(request, sessionType, value, maxAge = SESSION_TTL_SECONDS) {
  const isHttps = new URL(request.url).protocol === "https:";
  return `${sessionCookieName(sessionType)}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${isHttps ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(request, sessionType) {
  const isHttps = new URL(request.url).protocol === "https:";
  return `${sessionCookieName(sessionType)}=; Path=/; HttpOnly; ${isHttps ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}

export async function createSession(context, payload) {
  const ensured = await ensurePortalTables(context);
  if (!ensured.ok) return ensured;
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const args = [
    { type: "text", value: sessionId },
    { type: "text", value: payload.sessionType },
    { type: "text", value: payload.adminUsername || "" },
    { type: "integer", value: payload.participantNo || 0 },
    { type: "text", value: expiresAt },
  ];

  const result = await tursoExecute(
    context,
    `INSERT INTO portal_sessions (session_id, session_type, admin_username, participant_no, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    args,
  );

  if (!result.ok) return result;

  return {
    ok: true,
    headers: { "Set-Cookie": makeCookie(context.request, payload.sessionType, sessionId) },
    session: {
      sessionId,
      sessionType: payload.sessionType,
      adminUsername: payload.adminUsername || null,
      participantNo: payload.participantNo || null,
      expiresAt,
    },
  };
}

export async function getSession(context, expectedType) {
  await ensurePortalTables(context);
  const cookies = parseCookies(context.request);
  const sessionId = cookies[sessionCookieName(expectedType)];
  if (!sessionId) return null;

  const result = await tursoExecute(
    context,
    `SELECT session_id, session_type, admin_username, participant_no, expires_at
     FROM portal_sessions
     WHERE session_id = ? AND datetime(expires_at) > datetime('now')`,
    [{ type: "text", value: sessionId }],
  );

  if (!result.ok || result.rows.length === 0) return null;
  const session = result.rows[0];
  if (expectedType && session.session_type !== expectedType) return null;
  return session;
}

export async function deleteCurrentSession(context, sessionType) {
  const cookies = parseCookies(context.request);
  const sessionId = cookies[sessionCookieName(sessionType)];
  if (!sessionId) return { ok: true, headers: { "Set-Cookie": clearSessionCookie(context.request, sessionType) } };

  const result = await tursoExecute(
    context,
    "DELETE FROM portal_sessions WHERE session_id = ?",
    [{ type: "text", value: sessionId }],
  );

  if (!result.ok) return result;
  return { ok: true, headers: { "Set-Cookie": clearSessionCookie(context.request, sessionType) } };
}

export function requireAdminEnv(context) {
  const username = context.env.ADMIN_USERNAME;
  const password = context.env.ADMIN_PASSWORD;
  if (!username || !password) {
    return {
      ok: false,
      status: 500,
      error: "Missing ADMIN_USERNAME or ADMIN_PASSWORD in the server environment.",
    };
  }

  return { ok: true, username, password };
}

export function baseUrl(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
