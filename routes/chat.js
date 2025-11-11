import express from 'express';
import db from '../dbConnection.js';
import { GoogleGenAI } from '@google/genai';
import fetch, { Headers, Request, Response } from 'node-fetch';
import { matchDiseasesByAliases } from '../utils/diseaseMatcher.js';

if (!global.fetch) global.fetch = fetch;
if (!global.Headers) global.Headers = Headers;
if (!global.Request) global.Request = Request;
if (!global.Response) global.Response = Response;

const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
const router = express.Router();
const dbPool = db;
const symptomMemory = {}; // key: conversationId, value: array of messages
const symptomScore = {}; // key: conversationId, value: { lastKey, score }

// 取得寵物資訊
export async function getPetDetailFromDB(petId) {
  const sql = `
    SELECT pId, pName, species, age, sex, weight 
    FROM Pet 
    WHERE pId = ? 
    LIMIT 1
  `;
  const [rows] = await dbPool.execute(sql, [petId]);
  return rows.length === 0 ? null : rows[0];
}

// 判斷進入finalCheck
function shouldAutoFinalize({
  diseases,
  severity,
  followUp,
  userMessage,
  finalCheckType,
  stableScore
}) {
  const hasDiseases = diseases.length > 0;
  const hasFollowUp = followUp && followUp.trim() !== '';

  const userResponse = userMessage.toLowerCase();
  const userHasAnswered =
    /沒有|都正常|只有一次|不再|後來就|沒事|沒異常|都還好/.test(userResponse) ||
    userResponse.length > 20;

  if (!hasDiseases) return false;

  if (finalCheckType === 'stable') {
    return stableScore >= 2 || (userHasAnswered && !hasFollowUp);
  }

  if (finalCheckType === 'critical') {
    return stableScore >= 3 || !hasFollowUp;
  }

  return false;
}

function normalizeDiseaseName(name) {
  return name
    .replace(/輕微|急性|慢性|刺激|誤食|或|\/|\\|不當|不適|食入|食物|消化道/g, '')
    .replace(/（.*）/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}


// ===============================
// Chat Route
// ===============================
router.post('/chat', async (req, res) => {
  const { userId, petId, message, conversationId, finalCheck, stylePrompt, voiceName } = req.body;
  console.log('收到聊天請求:', { userId, petId, message, conversationId, finalCheck });
  let shouldFinalize = false;
  let finalCheckType = 'none';


  try {
    // 取得寵物資訊
    const petContext = await getPetDetailFromDB(petId);
    if (!petContext) {
      return res.status(400).json({
        responseText: '找不到寵物資料，請確認寵物 ID 是否正確。',
        isConversationEnd: true,
      });
    }
    const petName = petContext.pName;
    const cId = typeof conversationId === 'number' ? conversationId : Date.now();

    // AI 初步判斷疾病+追問
    let aiDiseases = [];
    let aiSeverity = '中';
    let nextQuestion = '請再次輸入剛剛的症狀';

    // 穩定分數提前判斷
    const lastSeverity = symptomScore[cId]?.lastSeverity || '';
    const lastScore = symptomScore[cId]?.score || 0;


    if (!finalCheck && lastSeverity === '低' && lastScore >= 2) {
      shouldFinalize = true;
      console.log('根據上一輪穩定分數與嚴重度，提前進入 finalCheck');
    }

    if (!finalCheck && !shouldFinalize) {
      try {
        if (!symptomMemory[cId]) {
          symptomMemory[cId] = [];
        }
        symptomMemory[cId].push(message);

        const allSymptoms = symptomMemory[cId].join('；');

        const combinedPrompt = `
        你現在扮演的角色是一位獸醫助理，請完全依照以下角色設定進行回覆：
        ${stylePrompt}?.trim() || '請用自然、親切的語氣回覆飼主，讓他感到安心與被照顧。請避免每次回覆都重複使用相同的開場安撫語，例如「親愛的飼主」、「辛苦您了」等，以免造成冗長。'}

        以下是使用者目前的症狀描述紀錄：
        ${allSymptoms}
        ${petName ? `寵物的名字是「${petName}」。` : ''}

        請執行以下任務：
        1. 判斷可能的疾病（最多 2 個），使用標準中文醫學名稱。
        2. 評估整體嚴重度（高、中、低）。
        3. 提出一個具體追問，幫助了解更精確症狀。

        請回傳以下格式的 JSON（僅回傳 JSON，不要有任何額外文字）：
        {
          "possibleDiseases": [ { "name": "疾病1" }, { "name": "疾病2" } ],
          "severity": "高" | "中" | "低",
          "followUpQuestion": "請問牠目前有咳嗽嗎？"
        }

        追問語氣請自然、符合角色風格，使用繁體中文。若合適，可在問題中自然地使用寵物名字。
        `.trim();

        const aiCombined = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL_EXTRACT || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }]
        });

        let rawText =
          aiCombined?.response?.candidates?.[0]?.content?.parts?.[0]?.text ??
          aiCombined?.candidates?.[0]?.content?.parts?.[0]?.text ??
          aiCombined?.response?.text?.() ??
          '';

        //console.log("AI 原始回傳:", rawText);

        rawText = rawText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(rawText);

        if (Array.isArray(parsed.possibleDiseases)) {
          aiDiseases = parsed.possibleDiseases
            .map(d => typeof d.name === 'string' ? d.name.trim() : '')
            .filter(Boolean);
        }

        if (['高', '中', '低'].includes(parsed.severity)) {
          aiSeverity = parsed.severity;
        }

        if (typeof parsed.followUpQuestion === 'string' && parsed.followUpQuestion.trim()) {
          nextQuestion = parsed.followUpQuestion.trim();
        }

        console.log('AI 疾病:', aiDiseases, '嚴重度:', aiSeverity, '追問:', nextQuestion);

      const normalizedDiseases = aiDiseases.map(normalizeDiseaseName);
      const prevDiseases = symptomScore[cId]?.lastDiseases || [];
      const overlap = normalizedDiseases.filter(d => prevDiseases.includes(d));
      const hasOverlap = overlap.length > 0;

      if (!symptomScore[cId]) {
        symptomScore[cId] = { score: 0, lastDiseases: [], lastSeverity: '' };
      }

      if (hasOverlap) {
        symptomScore[cId].score += 1;
      } else {
        symptomScore[cId].score = 1;
      }

      symptomScore[cId].lastDiseases = normalizedDiseases;
      symptomScore[cId].lastSeverity = aiSeverity;

      // 分級判斷
      /** @type {'none' | 'stable' | 'critical'} */
      const stableScore = symptomScore[cId].score;

      if (aiSeverity === '低' && stableScore >= 2) {
        finalCheckType = 'stable';
      } else if (aiSeverity === '中' && stableScore >= 3) {
        finalCheckType = 'stable';
      } else if (aiSeverity === '高') {
        finalCheckType = 'critical';
      }

      console.log('疾病交集:', overlap);
      console.log('穩定分數:', stableScore);
      console.log('嚴重度:', aiSeverity);
      console.log('結案類型:', finalCheckType);

      // 判斷是否可進入 finalCheck（傳入 finalCheckType）
      shouldFinalize = shouldAutoFinalize({
        diseases: aiDiseases,
        severity: aiSeverity,
        followUp: nextQuestion,
        userMessage: message,
        finalCheckType,
        stableScore
      });
      
      console.log('Rule-based 判斷是否可結案:', shouldFinalize);
    }catch (err) {
      console.warn('⚠️ AI 疾病+追問解析失敗:', err.message);
    }
 
      // 如果還沒到 finalCheck 階段 → 先回 AI 判斷，不查 DB
      if (!shouldFinalize) {
        return res.status(200).json({
          responseText: nextQuestion,
          isConversationEnd: false,
          currentStep: 'gather_symptoms',
          severity: aiSeverity,
          possibleDiseases: aiDiseases,
          conversationId: cId,
          shouldFinalize
        });
      }
    }  
  
    // finalCheck = true → 查 DB
    let dbDiseases = [];
    console.log('是否進入 finalCheck:', finalCheck || shouldFinalize);
    try {
      dbDiseases = await matchDiseasesByAliases(aiDiseases); 
    } catch (error) {
      console.error("疾病 alias 比對失敗:", error);
    }


    // 決定最終嚴重度與建議
    const dbDiseasesSafe = dbDiseases ?? [];

    const dbSeverity = dbDiseasesSafe.some(d => d.severity === '高') ? '高'
      : dbDiseasesSafe.some(d => d.severity === '中') ? '中'
      : '低';

    const finalSeverity = aiSeverity === '高' || dbSeverity === '高' ? '高'
      : aiSeverity === '中' || dbSeverity === '中' ? '中'
      : '低';

    const dbAdvice = dbDiseasesSafe.map(d => d.advice).join('；') || '建議觀察情況，若惡化請就醫。';
    const identified = dbDiseasesSafe.length > 0 ? dbDiseasesSafe.map(d => d.name) : aiDiseases;

    // 整合：生成 AI 回覆
    const finalPrompt = `
    你是一位獸醫助理，請根據以下語氣風格回覆飼主：
    ${stylePrompt?.trim() || '請用自然、親切的語氣回覆飼主，讓他感到安心與被照顧。請避免每次回覆都重複使用相同的開場安撫語，例如「親愛的飼主」、「辛苦您了」等，以免造成冗長。'}

    請根據以下資訊，給出具體且完整的建議，不要再提出任何追問或問題：

    寵物資訊：
    - 種類與名字：${petContext.species} ${petName}
    - 年齡與性別：${petContext.age} 歲，${petContext.sex}
    - 體重：${petContext.weight} kg

    AI 判斷的可能疾病：${identified.join('、')}
    整體嚴重度：${finalSeverity}
    建議摘要：${dbAdvice}

    請用繁體中文回覆，語氣符合角色風格，內容請具體、口語化，像是對飼主的口頭建議。請用 3～5 句話說明，視情況加入安撫語句並自然地提及 ${petName}。

    請勿提及「回診」、「撥打電話」、「聯絡我們」等語句。若需提醒就醫，請使用「儘速前往動物醫院」或「可再次使用本系統」等方式結尾。
    `.trim();

    let finalResponse = '';
    try {
      const aiFinal = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL_FINAL || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }]
      });
      let rawText =
        aiFinal?.response?.candidates?.[0]?.content?.parts?.[0]?.text ??
        aiFinal?.candidates?.[0]?.content?.parts?.[0]?.text ??
        aiFinal?.response?.text?.() ??
        '';
      finalResponse = rawText.trim();
    } catch (err) {
      console.warn('⚠️AI 生成最終回覆失敗:', err.message);
    }

    // care-suggestion-card
    const carePrompt = `
   你是一位獸醫助理，請根據以下語氣風格回覆飼主：
    ${stylePrompt?.trim()}
    請根據以下資訊，不用再和使用者打招呼直接給出三點具體照護建議，也請避免重複過往建議：

    寵物資訊：
    - 種類與名字：${petContext.species} ${petName}
    - 年齡與性別：${petContext.age} 歲，${petContext.sex}
    - 體重：${petContext.weight} kg

    可能疾病：${identified.join('、')}
    嚴重度：${finalSeverity}
    建議摘要：${dbAdvice}

    請回傳以下格式的 JSON（僅回傳 JSON，不要有任何額外文字）：
    {
      "suggestions": [
        "建議一",
        "建議二",
        "建議三"
      ]
    }
    `.trim();

    let careSuggestions = [];
    try {
      const aiCare = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL_FINAL || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: carePrompt }] }]
      });

      let rawCareText =
        aiCare?.response?.candidates?.[0]?.content?.parts?.[0]?.text ??
        aiCare?.candidates?.[0]?.content?.parts?.[0]?.text ??
        aiCare?.response?.text?.() ??
        '';

      rawCareText = rawCareText.replace(/```json|```/g, '').trim();
      const parsedCare = JSON.parse(rawCareText);

      if (Array.isArray(parsedCare.suggestions)) {
        careSuggestions = parsedCare.suggestions.filter(s => typeof s === 'string' && s.trim());
      }
    } catch (err) {
      console.warn('⚠️AI 生成照護建議失敗:', err.message);
    }

    // fallback：如果 AI 回傳空白，就用 prompt 裡的資訊手動組一段
    if (!finalResponse) {
      finalResponse = `
      可能的疾病為：${identified.join('、')}。
      整體嚴重度：${finalSeverity}。
      建議：我${dbAdvice}。
      `.trim();
    }

    const showMapButton = finalSeverity === '高';
    const confirmedDiseaseName = dbDiseases?.[0]?.name || aiDiseases?.[0] || '未命名疾病';
    const triggerMapSearch = finalCheckType === 'critical' && aiSeverity === '高';

    // 回傳前端
    res.status(200).json({
      responseText: finalResponse,
      isConversationEnd: false,
      currentStep: 'provide_advice',
      severity: finalSeverity,
      possibleDiseases: identified,   // AI 原始候選清單
      matchedDiseases: dbDiseases,    // DB 比對後的完整清單
      diseaseName: confirmedDiseaseName, // 確定疾病名稱
      finalAdvice: dbAdvice,
      showMapButton,
      conversationId: cId,
      shouldFinalize,
      triggerMapSearch, // 前端根據這個 flag 開啟 Google Maps
      careSuggestions
    });

  } catch (error) {
    console.error('/chat 處理錯誤：', error);
    res.status(500).json({
      responseText: 'AI 分析失敗，請稍後再試。',
      isConversationEnd: true,
      severity: null,
      possibleDiseases: [],
      showMapButton: false,
    });
  }
});

export default router;