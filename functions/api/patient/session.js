import { getSession, json } from "../../_lib/server.js";

export async function onRequestGet(context) {
  const session = await getSession(context, "patient");
  if (!session) {
    return json({ authenticated: false }, { status: 401 });
  }

  return json({
    authenticated: true,
    participantNo: session.participant_no,
  });
}
