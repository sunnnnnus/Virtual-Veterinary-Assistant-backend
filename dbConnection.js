// services/dbService.js
import mysql from 'mysql2/promise';

// 從 .env 讀取資料庫設定
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 建立資料庫連線池 (Connection Pool)
// 這是 Node.js 處理多個並發請求的最佳方式
const pool = mysql.createPool(dbConfig);

// 測試連線是否成功
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Pool connected successfully to DB:', process.env.DB_NAME);
        connection.release(); // 釋放連線
    })
    .catch(err => {
        console.error('❌ MySQL Connection Error:', err.message);
        // 如果連線失敗，讓應用程式退出，以便排查問題
        process.exit(1); 
    });

// 導出連線池，供其他模組使用
export default pool;