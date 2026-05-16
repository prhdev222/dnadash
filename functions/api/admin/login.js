import { createSession, json, requireAdminEnv } from "../../_lib/server.js";

export async function onRequestPost(context) {
  const config = requireAdminEnv(context);
  if (!config.ok) {
    return json({ error: config.error }, { status: config.status });
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = String(payload?.username || "").trim();
  const password = String(payload?.password || "");

  if (username !== config.username || password !== config.password) {
    return json({ error: "Invalid username or password." }, { status: 401 });
  }

  const session = await createSession(context, {
    sessionType: "admin",
    adminUsername: username,
  });

  if (!session.ok) {
    return json({ error: session.error || "Failed to create session." }, { status: session.status || 500 });
  }

  return json(
    { ok: true, username },
    {
      headers: session.headers,
    },
  );
}
