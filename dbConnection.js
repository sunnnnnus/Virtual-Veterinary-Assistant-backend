import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config(); 

// 從 .env 讀取資料庫設定
/*const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};*/

const isProd = process.env.NODE_ENV === 'production';
const currentEnv = isProd ? 'Production' : 'Local';

const dbConfig = {
  host: isProd ? process.env.PROD_DB_HOST : process.env.LOCAL_DB_HOST,
  user: isProd ? process.env.PROD_DB_USER : process.env.LOCAL_DB_USER,
  password: isProd ? process.env.PROD_DB_PASSWORD : process.env.LOCAL_DB_PASSWORD,
  database: isProd ? process.env.PROD_DB_NAME : process.env.LOCAL_DB_NAME,
  port: isProd ? process.env.PROD_DB_PORT : process.env.LOCAL_DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 建立資料庫連線池 (Connection Pool)
const pool = mysql.createPool(dbConfig);

// 測試連線是否成功
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Pool connected successfully to DB:', currentEnv);
        connection.release(); // 釋放連線
    })
    .catch(err => {
        console.error('❌ MySQL Connection Error:', err.message);
        // 如果連線失敗，讓應用程式退出，以便排查問題
        process.exit(1); 
    });

export default pool;