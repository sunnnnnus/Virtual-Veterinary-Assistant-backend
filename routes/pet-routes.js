import express from 'express';
import db from '../dbConnection.js'; 

const router = express.Router();


/**
 * GET /api/pet/user/:userId
 * 取得特定用戶 ID 的所有寵物列表 (簡要資訊)
 * 假設：用戶 ID 是從前端傳來的
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


// 2. 取得單一寵物詳細資料 (供 AI 諮詢使用)

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