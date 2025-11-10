import db from "../dbConnection.js";

export async function matchDiseasesByAliases(keywords = []) {
  if (!Array.isArray(keywords) || keywords.length === 0) return [];

  const placeholders = keywords.map(() => `(a.alias LIKE ? OR d.name LIKE ?)`).join(" OR ");
  const query = `
    SELECT DISTINCT d.diseaseId, d.name, d.severity, d.advice
    FROM DiseaseAlias a
    JOIN Disease d ON a.diseaseId = d.diseaseId
    WHERE ${placeholders}
  `;
  const values = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);
  const [rows] = await db.query(query, values);
}

