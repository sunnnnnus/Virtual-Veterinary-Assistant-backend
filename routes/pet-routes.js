import express from 'express';
import db from '../dbConnection.js'; 

const router = express.Router();

/**
 * GET /api/pet/:pId/opening-context
 * 取得寵物的問診開場背景資料（基本資料＋上次診斷＋品種風險）
 */
router.get('/:pId/opening-context', async (req, res) => {
  const { pId } = req.params;

  if (isNaN(parseInt(pId))) {
    return res.status(400).json({ message: '無效的寵物 ID 格式' });
  }

  try {
    // 查詢寵物基本資料
    const [petRows] = await db.query(
      `SELECT pId, pName, species, age, weight, sex
       FROM Pet
       WHERE pId = ?`,
      [pId]
    );
    if (petRows.length === 0) {
      return res.status(404).json({ message: '找不到該寵物資料' });
    }
    const pet = petRows[0];

    // 查詢最近一次診斷紀錄（Conversation + Disease）
    const [diagRows] = await db.query(
      `SELECT d.name AS diseaseName, d.severity, d.advice, c.createdAt
       FROM Conversation c
       JOIN Disease d ON c.diseaseId = d.diseaseId
       WHERE c.petId = ?
       ORDER BY c.createdAt DESC
       LIMIT 1`,
      [pId]
    );
    const lastDiagnosis = diagRows.length > 0 ? diagRows[0] : null;

    // 回傳組合資料
    res.status(200).json({
      petId: pet.pId,
      petName: pet.pName,
      species: pet.species,
      age: pet.age,
      weight: pet.weight,
      sex: pet.sex,
      lastDiagnosis
    });
  } catch (error) {
    console.error('取得開場問診資料失敗:', error);
    res.status(500).json({ message: '伺服器錯誤，無法取得問診背景資料' });
  }
});

/**
 * GET /api/pet/user/:userId
 * 取得特定用戶 ID 的所有寵物列表 (簡要資訊)
 */
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;

    // 檢查 userId 是否為有效數字 (基礎驗證)
    if (isNaN(parseInt(userId))) {
        return res.status(400).json({ message: '無效的用戶 ID 格式' });
    }

    try {
        const [rows] = await db.query(
            'SELECT pId, pName, species, age, sex , weight FROM Pet WHERE userId = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(200).json([]); // 沒有寵物，返回空陣列
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error('取得寵物列表失敗:', error);
        res.status(500).json({ message: '伺服器錯誤，無法取得寵物資料' });
    }
});

/**
 * GET /api/pet/:pId
 * 取得單一寵物的詳細資料 (AI 諮詢需要所有上下文)
 */
router.get('/:pId', async (req, res) => {
    const { pId } = req.params;

    // 檢查 pId 是否為有效數字
    if (isNaN(parseInt(pId))) {
        return res.status(400).json({ message: '無效的寵物 ID 格式' });
    }

    try {
        // 選擇所有欄位，提供完整的寵物資訊給 AI 判斷
        const [rows] = await db.query(
            'SELECT * FROM Pet WHERE pId = ?',
            [pId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: '找不到該寵物資料' });
        }

        // rows 是一個陣列，我們只需要第一筆資料
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('取得單一寵物資料失敗:', error);
        res.status(500).json({ message: '伺服器錯誤，無法取得寵物詳細資料' });
    }
});

export default router; 