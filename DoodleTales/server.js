import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse base64 image data
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.')); // Serves static files (index.html) from root

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: GEMINI_API_KEY is missing in your .env file!");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// Secure endpoint to handle drawings
app.post('/api/scan-drawing', async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const prompt = `You are a creative early childhood storyteller and speech therapy assistant. 
Analyze this hand-drawn picture from a child. Identify the drawn character/object, its primary colors, and its mood.
Output strictly JSON in this exact structure:
{
  "character_name": "Name based on drawing (e.g. Happy Green Dragon)",
  "story": "A playful 2 to 3 sentence story introducing the character directly to the child. Make it lively and educational."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64
          }
        }
      ]
    });

    const rawText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(rawText);

    res.json(data);
  } catch (err) {
    console.error("Backend Gemini Error:", err);
    res.status(500).json({ error: "Failed to process drawing with Gemini." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 DoodleTales server running at http://localhost:${PORT}`);
});