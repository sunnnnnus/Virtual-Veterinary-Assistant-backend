import express from 'express';
import db from '../dbConnection.js'; 

const router = express.Router();

/**
 * POST /api/auth/register
 * 處理使用者和首隻寵物同時註冊
 */
router.post('/register', async (req, res) => {
    // 1. 取得所有輸入資料
    const { 
        phone, password, 
        pName, species, age, sex, weight // 寵物資料
    } = req.body;

    // 2. 驗證必填 User 資料和必填 Pet 資料
    if (!phone || !password || !pName || !species || !sex) {
        return res.status(400).json({ message: '手機、密碼、寵物名字、品種和性別為必填項。' });
    }

    let connection; 
    try {
        // 使用連線事務 (Transaction) 確保兩次寫入要嘛都成功，要嘛都失敗
        connection = await db.getConnection(); 
        await connection.beginTransaction(); 

        // A. 檢查手機號碼是否已被註冊
        const [existingUsers] = await connection.query('SELECT phone FROM User WHERE phone = ?', [phone]);
        if (existingUsers.length > 0) {
            await connection.rollback(); // 發生錯誤，回滾
            return res.status(409).json({ message: '該手機號碼已被註冊。' });
        }
        
        // B. 第一次 INSERT：寫入 User 資料
        const [userResult] = await connection.query(
            'INSERT INTO User (phone, password, createdAt) VALUES (?, ?, CURDATE())',
            [phone, password]
        );
        const userId = userResult.insertId; // 取得新生成的 userId

        // C. 第二次 INSERT：寫入 Pet 資料，使用上一步的 userId
        await connection.query(
            `INSERT INTO Pet 
            (userId, pName, species, age, sex, weight) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, pName, species, age || null, sex, weight || null]
        );

        await connection.commit(); // 兩次 INSERT 都成功，提交變更

        // 4. 成功回應
        res.status(201).json({
            message: '註冊與寵物資料新增成功',
            userId: userId,
        });

    } catch (error) {
        if (connection) {
            await connection.rollback(); // 任何錯誤都回滾資料庫操作
        }
        console.error('註冊和寵物新增失敗:', error);
        res.status(500).json({ message: '伺服器錯誤，註冊失敗。' });
    } finally {
        if (connection) {
            connection.release(); // 釋放連線
        }
    }
});

/**
 * POST /api/auth/login
 * 處理使用者登入
 */
router.post('/login', async (req, res) => {
    // 1. 從請求體中獲取帳號和密碼
    const { phone, password } = req.body; 

    // 2. 執行數據庫查詢和密碼比對邏輯
    try {
        // 1. 根據手機號碼查找用戶
        const [users] = await db.query('SELECT userId, password FROM User WHERE phone = ?', [phone]);
        
        // 檢查用戶是否存在
        if (users.length === 0) {
            // 401 Unauthorized 或 404 Not Found (這裡用 401 較常見)
            return res.status(401).json({ message: '帳號不存在或密碼錯誤' });
        }

        const user = users[0];

        //測試密碼
        console.log('輸入的密碼:', password); 
        console.log('DB中的加密密碼:', user.password); 

        // 2. 驗證密碼
        //const isMatch = await bcrypt.compare(password, user.password);
        const isMatch = (password === user.password); 

        //測試比對結果
        console.log('密碼比對結果:', isMatch); // 看這裡是否為 false

        if (!isMatch) {
            // 密碼不匹配
            return res.status(401).json({ message: '帳號不存在或密碼錯誤' });
        }

        const [pets] = await db.query(
            'SELECT pId FROM Pet WHERE userId = ? ORDER BY pId ASC LIMIT 1', // 根據 ID 升序，取第一個
            [user.userId]
        );

        const defaultPetId = pets.length > 0 ? pets[0].pId : null;

        // 3. 登入成功，回傳 userId
        return res.status(200).json({
            message: 'Login successful',
            userId: user.userId, 
            token: 'fake-jwt-token',
            defaultPetId: defaultPetId // 新增寵物 ID
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
    
});


export default router; 