import db from "../dbConnection.js";

export async function matchDiseasesByAliases(keywords = []) {
  if (!Array.isArray(keywords) || keywords.length === 0) return [];

  // 以 Disease 為主表，避免 alias 缺失導致查不到
  const placeholders = keywords.map(() => `(d.name LIKE ? OR a.alias LIKE ?)`).join(" OR ");
  const query = `
    SELECT DISTINCT d.diseaseId, d.name, d.severity, d.advice
    FROM Disease d
    LEFT JOIN DiseaseAlias a ON a.diseaseId = d.diseaseId
    WHERE ${placeholders}
  `;
  const values = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

  const [rows] = await db.query(query, values);

  console.log("🧪 matchDiseasesByAliases keywords:", keywords);
  console.log("🧪 SQL:", query, values);
  console.log("🧪 查到的 rows:", rows);

  // fallback：如果查不到，就用 AI 疾病名稱生成一個建議
  if (!rows || rows.length === 0) {
    return keywords.map(k => ({
      diseaseId: null,
      name: k,
      severity: "低",
      advice: "建議觀察情況，若惡化請就醫。"
    }));
  }

  return rows;
}