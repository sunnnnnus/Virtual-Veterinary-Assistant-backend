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
  // ✅ 可選語音白名單（避免前端傳錯）
  const validVoices = [
    'cmn-TW-Wavenet-A',
    'cmn-TW-Wavenet-B',
    'cmn-TW-Wavenet-C'
  ];

  const selectedVoice = validVoices.includes(voiceName)
    ? voiceName
    : 'cmn-TW-Wavenet-A';

  console.log('後端使用語音:', selectedVoice);

  try {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

    const requestBody = {
      input: { text },
      voice: {
        languageCode: 'cmn-TW',
        name: selectedVoice
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.3, // 稍快一點
        pitch: 2.7        // 稍高一點
      }
    };

    const response = await axios.post(url, requestBody);
    const audioContent = response.data.audioContent;

    if (!audioContent) {
      throw new Error('No audio content returned from TTS API');
    }

    const audioBuffer = Buffer.from(audioContent, 'base64');

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length
    });
    res.send(audioBuffer);
  } catch (err) {
    console.error('TTS error:', err.response?.data || err.message || err);
    res.status(500).send('TTS failed');
  }
});

export default router;