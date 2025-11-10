import 'dotenv/config'; 
import express from 'express';
import db from './dbConnection.js'; 
import cors from 'cors'; 

import { GoogleGenAI } from '@google/genai';

import authRoutes from './routes/authRoutes.js'; 
import petRoutes from './routes/pet-routes.js'; 
import chatRoutes from './routes/chat.js';
import symptomRoutes from "./routes/disease.js";
import historyRoutes from "./routes/history-routes.js";
import ttsRoutes from "./routes/tts-routes.js";

const app = express();
const PORT = 4000; 

app.use(cors()); 

// Middleware
app.use(express.json());

// 路由設定
app.use('/api/pet', petRoutes,); 
app.use('/api/auth', authRoutes); 
app.use('/api/ai', chatRoutes);
app.use("/api/symptom", symptomRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/tts',ttsRoutes);


// 啟動伺服器
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export const ai = new GoogleGenAI({}); 
// 這裡將 db 導出，如果你需要在其他地方使用它
export const dbPool = db; 

