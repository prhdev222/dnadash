import { getSession, json } from "../../_lib/server.js";

export async function onRequestGet(context) {
  const session = await getSession(context, "admin");
  if (!session) {
    return json({ authenticated: false }, { status: 401 });
  }

  return json({
    authenticated: true,
    username: session.admin_username,
  });
}
