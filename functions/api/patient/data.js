import { getSession, json, tursoExecute } from "../../_lib/server.js";
import { ensurePortalTables } from "../../_lib/server.js";

export async function onRequestGet(context) {
  const session = await getSession(context, "patient");
  if (!session) return json({ error: "Unauthorized." }, { status: 401 });
  const ensured = await ensurePortalTables(context);
  if (!ensured.ok) return json({ error: ensured.error }, { status: ensured.status || 500 });

  const participantNo = Number(session.participant_no);
  const queries = {
    patient: "SELECT * FROM patients WHERE participant_no = ?",
    patientProfile: "SELECT * FROM patient_portal_profile WHERE participant_no = ?",
    risks: "SELECT * FROM health_risks WHERE participant_no = ? ORDER BY rank_order",
    pgx: "SELECT * FROM pgx_drugs WHERE participant_no = ? ORDER BY risk_type, drug_name",
    cancer: "SELECT * FROM wgs_cancer WHERE participant_no = ? ORDER BY cancer_type",
    nutrition: "SELECT * FROM nutrition_needs WHERE participant_no = ? ORDER BY nutrient",
    food: "SELECT * FROM food_exposure WHERE participant_no = ? ORDER BY item_type, item_name",
    pgxCatalog: "SELECT * FROM pgx_drug_catalog ORDER BY drug_name",
    pgxNameMap: "SELECT * FROM pgx_drug_name_map ORDER BY drug_name",
  };

  const args = [{ type: "integer", value: participantNo }];
  const results = {};

  for (const [key, sql] of Object.entries(queries)) {
    const result = await tursoExecute(
      context,
      sql,
      key === "pgxCatalog" || key === "pgxNameMap" ? [] : args,
    );
    if (!result.ok) return json({ error: result.error }, { status: result.status || 500 });
    results[key] = result.rows;
  }

  if (results.patient.length === 0) {
    return json({ error: "Participant not found." }, { status: 404 });
  }

  const pgxDescriptions = Object.fromEntries(
    (results.pgxCatalog || []).map((row) => [row.drug_name, row.short_description || ""]),
  );
  const pgxNames = Object.fromEntries(
    (results.pgxNameMap || []).map((row) => [row.drug_name, row.display_name || ""]),
  );
  const profile = results.patientProfile?.[0] || {};
  const patient = {
    ...results.patient[0],
    display_name: profile.display_name || "",
    portal_note: profile.portal_note || "",
  };

  return json({
    participantNo,
    patient,
    risks: results.risks,
    pgx: results.pgx.map((row) => ({
      ...row,
      display_name: pgxNames[row.drug_name] || row.drug_name,
      short_description: pgxDescriptions[row.drug_name] || "",
    })),
    cancer: results.cancer,
    nutrition: results.nutrition,
    food: results.food,
  });
}
