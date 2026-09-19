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

// Secure endpoint to handle drawings and interactive choices
app.post('/api/scan-drawing', async (req, res) => {
  try {
    const { imageBase64, userChoice, currentCharacter } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    let prompt = "";

    // Check if this request is a continuation choice or a new drawing scan
    if (userChoice && currentCharacter) {
      prompt = `The character is "${currentCharacter}". The child selected this choice: "${userChoice}".
Continue the adventure in 2 fun sentences.
Output strictly JSON in this exact structure without markdown backticks:
{
  "character_name": "${currentCharacter}",
  "sound_type": "magic",
  "story": "The 2-sentence story continuation",
  "choice_1": "Next adventure option A",
  "choice_2": "Next adventure option B"
}`;
    } else {
      prompt = `You are a creative early childhood storyteller and computer vision engine.
Analyze this hand-drawn picture from a child.
1. Identify the main drawn character/object.
2. Locate the main drawing and return 2D bounding box normalized coordinates scale 0 to 1000: [ymin, xmin, ymax, xmax].
3. Categorize the sound effect associated with this drawing as strictly one of: "magic", "robot", or "creature".
4. Write a 2-sentence engaging story introducing the character.
5. Provide two short interactive branching choices for what happens next in the story.

Output strictly JSON in this exact structure without markdown backticks:
{
  "character_name": "Name of drawn character (e.g. Glowing Space Bot)",
  "sound_type": "robot",
  "box_2d": [ymin, xmin, ymax, xmax],
  "story": "A playful 2-sentence story introducing the character.",
  "choice_1": "Explore the secret cave",
  "choice_2": "Fly straight to the moon"
}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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