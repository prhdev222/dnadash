import { getSession, json, tursoExecute } from "../../_lib/server.js";

export async function onRequestGet(context) {
  const session = await getSession(context, "patient");
  if (!session) return json({ error: "Unauthorized." }, { status: 401 });

  const participantNo = Number(session.participant_no);
  const queries = {
    patient: "SELECT * FROM patients WHERE participant_no = ?",
    risks: "SELECT * FROM health_risks WHERE participant_no = ? ORDER BY rank_order",
    pgx: "SELECT * FROM pgx_drugs WHERE participant_no = ? ORDER BY risk_type, drug_name",
    cancer: "SELECT * FROM wgs_cancer WHERE participant_no = ? ORDER BY cancer_type",
    nutrition: "SELECT * FROM nutrition_needs WHERE participant_no = ? ORDER BY nutrient",
    food: "SELECT * FROM food_exposure WHERE participant_no = ? ORDER BY item_type, item_name",
  };

  const args = [{ type: "integer", value: participantNo }];
  const results = {};

  for (const [key, sql] of Object.entries(queries)) {
    const result = await tursoExecute(context, sql, args);
    if (!result.ok) return json({ error: result.error }, { status: result.status || 500 });
    results[key] = result.rows;
  }

  if (results.patient.length === 0) {
    return json({ error: "Participant not found." }, { status: 404 });
  }

  return json({
    participantNo,
    patient: results.patient[0],
    risks: results.risks,
    pgx: results.pgx,
    cancer: results.cancer,
    nutrition: results.nutrition,
    food: results.food,
  });
}
