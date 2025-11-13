import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

router.post('/', async (req, res) => {
  const { text, voiceName } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).send('Missing or invalid text');
  }
  // 語音白名單
  const validVoices = [
    'zh-TW-HsiaoChenNeural',
    'zh-TW-YunJheNeural',
    'zh-TW-HsiaoYuNeural',
    'zh-CN-YunyangNeural'
  ];

  const roleName = req.body.roleName || '溫柔喵喵';
  const selectedVoice = validVoices.includes(voiceName)
    ? voiceName
    : 'zh-TW-HsiaoChenNeural';

  console.log('後端使用語音:', selectedVoice);

  try {
    const subscriptionKey = process.env.AZURE_TTS_KEY;
    const region = process.env.AZURE_TTS_REGION;
    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const cleanText = typeof text === 'string' ? text : String(text);

    let prosodyConfig = {
      rate: 'default',     // 正常語速
      pitch: 'default', // 預設音高
      volume: 'default' // 預設音量
    };

    if (roleName === '活力小汪') {
      prosodyConfig = {
        rate: 'fast',
        pitch: 'default',
        volume: 'default'
      };
    } else if (roleName === '溫柔喵喵') {
      prosodyConfig = {
        rate: 'medium',
        pitch: 'high',
        volume: 'default'
      };
    } else if (roleName === '專業邊牧') {
      prosodyConfig = {
        rate: 'medium',
        pitch: 'default',
        volume: 'default'
      };
    }

    const ssml = `<speak version='1.0' xml:lang='zh-TW'><voice name='${selectedVoice}'><prosody rate='${prosodyConfig.rate}' pitch='${prosodyConfig.pitch}' volume='${prosodyConfig.volume}'>${cleanText}</prosody></voice></speak>`;

    const response = await axios.post(endpoint, ssml, {
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3'
      },
      responseType: 'arraybuffer'
    });

    const audioBuffer = Buffer.from(response.data);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length
    });
    res.send(audioBuffer);
  } catch (err) {
      console.error('Azure TTS error:', {
        status: err.response?.status,
        headers: err.response?.headers,
        data: err.response?.data,
        message: err.message
      });
    res.status(500).send('Azure TTS failed');
  }
});

export default router;
