import express from 'express';
import db from '../dbConnection.js'; 

const router = express.Router();

// 查詢某隻寵物的歷史問診紀錄
router.get('/:petId', async (req, res) => {
  const petId = parseInt(req.params.petId, 10);
  if (!petId || isNaN(petId)) {
    return res.status(400).json({ error: '無效的 petId' });
  }

  try {
    const [rows] = await db.query(
      `SELECT 
         c.cId AS id,
         c.title,
         c.severity,
         c.finalAdvice,
         c.createdAt,
         d.name AS diseaseName
       FROM Conversation c
       LEFT JOIN Disease d ON c.diseaseId = d.diseaseId
       WHERE c.petId = ?
       ORDER BY c.createdAt DESC`,
      [petId]
    );

    res.json(rows || []);
  } catch (err) {
    console.error('查詢問診紀錄失敗:', err);
    res.status(500).json({ error: '伺服器錯誤，無法取得問診紀錄' });
  }
});

router.post('/', async (req, res) => {
  const { petId, title, severity, finalAdvice, diseaseId, messages } = req.body;

  if (!petId || !title || !severity || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '缺少必要欄位或格式錯誤' });
  }

  const safeTitle = title?.trim() || '問診紀錄';
  
  const safeDiseaseId = Number.isInteger(Number(diseaseId)) && Number(diseaseId) > 0
    ? Number(diseaseId)
    : 9999;

  try {
    const [convResult] = await db.query(
      `INSERT INTO Conversation (petId, title, severity, finalAdvice, diseaseId)
      VALUES (?, ?, ?, ?, ?)`,
      [petId, safeTitle, severity, finalAdvice, safeDiseaseId]
    );
    const conversationId = convResult.insertId;

    for (const msg of messages) {
      await db.query(
        `INSERT INTO Message (conversationId, senderType, senderName, content)
        VALUES (?, ?, ?, ?)`,
        [
          conversationId,
          msg.sender === 'ai' ? 'AI' : 'User',
          msg.sender === 'ai' ? 'AI 助理' : '飼主',
          msg.text
        ]
      );
    }

    res.json({ success: true, conversationId });
  } catch (err) {
    console.error('儲存問診紀錄失敗:', err);
    res.status(500).json({ error: '伺服器錯誤，無法儲存問診紀錄' });
  }

});

export default router;