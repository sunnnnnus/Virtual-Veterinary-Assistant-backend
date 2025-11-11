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
    'zh-TW-YunJheNeural',
    'zh-TW-HsiaoYuNeural',
    'zh-TW-HsiaoChenNeural',
  ];

  const selectedVoice = validVoices.includes(voiceName)
    ? voiceName
    : 'zh-TW-HsiaoChenNeural';

  console.log('後端使用語音:', selectedVoice);

  try {
    const subscriptionKey = process.env.AZURE_TTS_KEY;
    const region = process.env.AZURE_TTS_REGION;
    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const cleanText = typeof text === 'string' ? text : String(text);

    const ssml = `
      <speak version='1.0' xml:lang='zh-TW'>
        <voice name='${selectedVoice}'>
          <prosody rate='1.0'>${ cleanText }</prosody>
        </voice>
      </speak>
    `.trim();

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
    console.error('Azure TTS error:', err.response?.data || err.message || err);
    res.status(500).send('Azure TTS failed');
  }
});

export default router;
