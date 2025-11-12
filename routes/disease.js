import express from "express";
import { matchDiseasesByAliases } from "../utils/diseaseMatcher.js";

const router = express.Router();

router.post("/match", async (req, res) => {
  const { symptoms, userMessage } = req.body;

  let keywords = Array.isArray(symptoms) && symptoms.length > 0 ? symptoms : [];
  if (keywords.length === 0 && typeof userMessage === "string" && userMessage.trim()) {
    keywords = [userMessage.trim()];
  }

  if (keywords.length === 0) {
    return res.status(400).json({ error: "缺少 symptoms 或 userMessage" });
  }

  try {
    const rows = await matchDiseasesByAliases(keywords);

    res.json({ diseases: rows, message: "找到相符疾病或 AI fallback" });
  } catch (error) {
    console.error("disease match 失敗:", error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

export default router;