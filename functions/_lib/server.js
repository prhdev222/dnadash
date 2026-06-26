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

  const normalizedArgs = args.map((arg) => {
    if (!arg || typeof arg !== "object" || !("type" in arg)) return arg;
    if (arg.type === "integer" || arg.type === "float") {
      return { ...arg, value: String(arg.value) };
    }
    return arg;
  });

  const response = await fetch(`${dbUrl}/v3/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql, args: normalizedArgs } }],
    }),
  });

  const data = await response.json();
  const result = data?.results?.[0];
  const fallbackError =
    data?.error?.message ||
    data?.message ||
    result?.error?.message ||
    JSON.stringify(data).slice(0, 500) ||
    "Database request failed.";

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: fallbackError,
    };
  }

  if (!result) return { ok: true, rows: [] };
  if (result.type === "error") {
    return {
      ok: false,
      status: 400,
      error: result.error?.message || fallbackError,
    };
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
    `CREATE TABLE IF NOT EXISTS patient_portal_access (
      participant_no INTEGER PRIMARY KEY,
      password_hash TEXT NOT NULL,
      password_plain TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS patient_portal_profile (
      participant_no INTEGER PRIMARY KEY,
      display_name TEXT,
      portal_note TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS pgx_drug_catalog (
      drug_name TEXT PRIMARY KEY,
      short_description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS pgx_drug_name_map (
      drug_name TEXT PRIMARY KEY,
      display_name TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of statements) {
    const result = await tursoExecute(context, sql);
    if (!result.ok) return result;
  }

  const passwordPlainColumn = await tursoExecute(
    context,
    "ALTER TABLE patient_portal_access ADD COLUMN password_plain TEXT",
  );
  if (
    !passwordPlainColumn.ok &&
    !/duplicate column name|already exists/i.test(passwordPlainColumn.error || "")
  ) {
    return passwordPlainColumn;
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

function getSessionSecret(context) {
  return (
    context.env.SESSION_SECRET ||
    context.env.ADMIN_PASSWORD ||
    context.env.TURSO_AUTH_TOKEN
  );
}

function toBase64Url(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(normalized + padding);
}

async function signValue(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function encodeSession(context, payload) {
  const secret = getSessionSecret(context);
  if (!secret) return null;
  const body = toBase64Url(JSON.stringify(payload));
  const signature = await signValue(secret, body);
  return `${body}.${signature}`;
}

async function decodeSession(context, encoded) {
  const secret = getSessionSecret(context);
  if (!secret || !encoded || !encoded.includes(".")) return null;
  const [body, signature] = encoded.split(".");
  const expected = await signValue(secret, body);
  if (signature !== expected) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(body));
    if (!parsed?.sessionType || !parsed?.expiresAt) return null;
    if (Date.now() > Number(parsed.expiresAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createSession(context, payload) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const encoded = await encodeSession(context, {
    sessionType: payload.sessionType,
    adminUsername: payload.adminUsername || null,
    participantNo: payload.participantNo || null,
    expiresAt,
  });
  if (!encoded) {
    return { ok: false, status: 500, error: "Missing session signing secret." };
  }

  return {
    ok: true,
    headers: { "Set-Cookie": makeCookie(context.request, payload.sessionType, encoded) },
    session: {
      sessionType: payload.sessionType,
      adminUsername: payload.adminUsername || null,
      participantNo: payload.participantNo || null,
      expiresAt,
    },
  };
}

export async function getSession(context, expectedType) {
  const cookies = parseCookies(context.request);
  const encoded = cookies[sessionCookieName(expectedType)];
  if (!encoded) return null;
  const session = await decodeSession(context, encoded);
  if (!session) return null;
  if (expectedType && session.sessionType !== expectedType) return null;
  return {
    session_type: session.sessionType,
    admin_username: session.adminUsername || null,
    participant_no: session.participantNo || null,
    expires_at: new Date(Number(session.expiresAt)).toISOString(),
  };
}

export async function deleteCurrentSession(context, sessionType) {
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
