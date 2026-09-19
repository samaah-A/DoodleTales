import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MODELS
// ============================================================

const ANALYSIS_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
];

const IMAGE_MODEL = 'gemini-2.5-flash-image';

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json({ limit: '15mb' }));
app.use(express.static('.'));

// ============================================================
// GEMINI
// ============================================================

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY is missing.');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey
});

// ============================================================
// RETRY
// ============================================================

async function callWithRetry(fn, retries = 1) {

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {

    try {
      return await fn();

    } catch (error) {

      lastError = error;

      const status =
        error?.status ||
        error?.statusCode ||
        error?.response?.status;

      console.log(
        `⚠️ Gemini request failed (${status}), attempt ${attempt + 1}/${retries + 1}`
      );

      const message =
        error?.message ||
        '';

      // Do not retry zero-quota errors.
      if (
        status === 429 &&
        (
          message.includes('limit: 0') ||
          message.includes('quota')
        )
      ) {
        throw error;
      }

      if (
        status !== 500 &&
        status !== 503
      ) {
        throw error;
      }

      if (attempt < retries) {
        await new Promise(resolve =>
          setTimeout(resolve, 1500)
        );
      }
    }
  }

  throw lastError;
}

// ============================================================
// STORY SCHEMA
// ============================================================

const storySchema = {
  type: 'object',

  properties: {

    title: {
      type: 'string'
    },

    character: {
      type: 'string'
    },

    type: {
      type: 'string'
    },

    color: {
      type: 'string'
    },

    mood: {
      type: 'string'
    },

    scene: {
      type: 'string',
      enum: [
        'forest',
        'castle',
        'space',
        'ocean',
        'city',
        'playground'
      ]
    },

    action: {
      type: 'string'
    },

    story: {
      type: 'string'
    },

    choices: {
      type: 'array',
      items: {
        type: 'string'
      }
    },

    animation: {
      type: 'string',
      enum: [
        'fly',
        'bounce',
        'walk',
        'jump',
        'shake',
        'float',
        'spin',
        'idle'
      ]
    }
  },

  required: [
    'title',
    'character',
    'type',
    'color',
    'mood',
    'scene',
    'action',
    'story',
    'choices',
    'animation'
  ]
};

// ============================================================
// CONTINUATION SCHEMA
// ============================================================

const continuationSchema = {
  type: 'object',

  properties: {

    story: {
      type: 'string'
    },

    animation: {
      type: 'string',
      enum: [
        'fly',
        'bounce',
        'walk',
        'jump',
        'shake',
        'float',
        'spin',
        'idle'
      ]
    },

    scene: {
      type: 'string',
      enum: [
        'forest',
        'castle',
        'space',
        'ocean',
        'city',
        'playground'
      ]
    },

    choices: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  },

  required: [
    'story',
    'animation',
    'scene',
    'choices'
  ]
};

// ============================================================
// CLEAN CHOICES
// ============================================================

function cleanChoices(choices) {

  if (!Array.isArray(choices)) {
    return [
      'Explore the world',
      'Try something exciting'
    ];
  }

  return choices
    .slice(0, 2)
    .map(choice => String(choice).trim())
    .filter(Boolean);
}

// ============================================================
// ANALYZE DRAWING
// ============================================================

async function analyzeDrawing(imageBase64) {

  const prompt = `
You are the AI story engine for DoodleTales.

A child has drawn something on paper.

Analyze the drawing carefully.

Identify:

- the main character
- character type
- primary color
- mood
- appropriate story scene
- what the character is doing

The drawing may be rough, simple, abstract, or child-like.
Do not reject it because it is imperfect.

Then create a short children's story.

The story must:

- be 2-3 sentences
- be playful and imaginative
- directly address the child
- introduce the drawn character
- match the drawing
- be appropriate for children

Then provide exactly TWO choices for what the child
can make the character do next.

Allowed animations:

fly
bounce
walk
jump
shake
float
spin
idle

Allowed scenes:

forest
castle
space
ocean
city
playground

Return only JSON.
`;

  let lastError = null;

  for (const model of ANALYSIS_MODELS) {

    try {

      console.log(`🧠 Trying ${model}...`);

      const response = await callWithRetry(
        () =>
          ai.models.generateContent({

            model,

            contents: [

              {
                text: prompt
              },

              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBase64
                }
              }

            ],

            config: {
              responseMimeType: 'application/json',
              responseSchema: storySchema
            }

          }),

        1
      );

      console.log(
        `✅ ${model} succeeded`
      );

      return JSON.parse(response.text);

    } catch (error) {

      lastError = error;

      const status =
        error?.status ||
        error?.statusCode ||
        error?.response?.status;

      console.log(
        `❌ ${model} failed with status ${status}`
      );

      if (
        status === 500 ||
        status === 503 ||
        status === 429
      ) {

        console.log(
          '➡️ Trying next analysis model...'
        );

        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// ============================================================
// IMAGE GENERATION
// ============================================================

async function generateStoryImage(
  imageBase64,
  storyData
) {

  console.log(
    `🎨 Generating polished storybook image with ${IMAGE_MODEL}...`
  );

  const imagePrompt = `
Create a polished children's storybook illustration
based directly on the child's original drawing.

Preserve the main character's recognizable shape,
identity, and primary color.

Character:
${storyData.character}

Type:
${storyData.type}

Color:
${storyData.color}

Mood:
${storyData.mood}

Scene:
${storyData.scene}

Action:
${storyData.action}

Story:
${storyData.story}

Make it colorful, friendly, playful, and suitable
for children.

Do not include text, words, captions, or speech bubbles.

Use a 16:9 storybook composition.
`;

  try {

    const interaction =
      await ai.interactions.create({

        model: IMAGE_MODEL,

        input: [

          {
            type: 'image',
            data: imageBase64,
            mime_type: 'image/jpeg'
          },

          {
            type: 'text',
            text: imagePrompt
          }

        ],

        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: '16:9',
          image_size: '1K'
        }

      });

    if (
      interaction &&
      Array.isArray(interaction.outputs)
    ) {

      for (
        const output of interaction.outputs
      ) {

        if (
          output?.type === 'image' &&
          output?.data
        ) {

          console.log(
            '✅ Storybook image generated!'
          );

          return output.data;
        }
      }
    }

    return null;

  } catch (error) {

    const status =
      error?.status ||
      error?.statusCode ||
      error?.response?.status;

    console.log(
      `⚠️ Image generation failed (${status}).`
    );

    console.log(
      error?.message || error
    );

    // Your current Free Tier has 0 image quota.
    if (status === 429) {

      console.log(
        'ℹ️ Image generation quota unavailable.'
      );

      return null;
    }

    return null;
  }
}

// ============================================================
// CONTINUE STORY
// ============================================================

async function continueStory(
  character,
  currentStory,
  choice,
  currentScene
) {

  const prompt = `
Continue this interactive children's story.

Character:
${character}

Current story:
${currentStory}

Current scene:
${currentScene}

The child chose:
${choice}

Continue the story based directly on the child's choice.

Requirements:

- 2-3 sentences
- Keep the same character
- Continue naturally
- Make the child feel like they control the story
- Be playful and imaginative
- Be appropriate for children
- Provide exactly TWO new choices
- Select an appropriate animation
- Select an appropriate scene

Allowed animations:

fly
bounce
walk
jump
shake
float
spin
idle

Allowed scenes:

forest
castle
space
ocean
city
playground

Return only JSON.
`;

  let lastError = null;

  for (const model of ANALYSIS_MODELS) {

    try {

      console.log(
        `🧠 Continuing story with ${model}...`
      );

      const response =
        await callWithRetry(

          () =>
            ai.models.generateContent({

              model,

              contents: [
                {
                  text: prompt
                }
              ],

              config: {
                responseMimeType: 'application/json',
                responseSchema:
                  continuationSchema
              }

            }),

          1

        );

      console.log(
        `✅ Story continuation generated`
      );

      return JSON.parse(
        response.text
      );

    } catch (error) {

      lastError = error;

      const status =
        error?.status ||
        error?.statusCode ||
        error?.response?.status;

      console.log(
        `❌ ${model} continuation failed with status ${status}`
      );

      if (
        status === 500 ||
        status === 503 ||
        status === 429
      ) {

        continue;

      }

      throw error;
    }
  }

  throw lastError;
}

// ============================================================
// SCAN DRAWING
// ============================================================

app.post(
  '/api/scan-drawing',
  async (req, res) => {

    console.log('');
    console.log('==============================');
    console.log('📷 DRAWING RECEIVED');
    console.log('==============================');

    try {

      const {
        imageBase64
      } = req.body;

      if (!imageBase64) {

        return res.status(400).json({
          error: 'No drawing image provided.'
        });

      }

      const cleanImageBase64 =
        imageBase64.replace(
          /^data:image\/\w+;base64,/,
          ''
        );

      const data =
        await analyzeDrawing(
          cleanImageBase64
        );

      console.log(
        `🎨 Character: ${data.character}`
      );

      console.log(
        `🎭 Type: ${data.type}`
      );

      console.log(
        `🌈 Color: ${data.color}`
      );

      console.log(
        `😊 Mood: ${data.mood}`
      );

      console.log(
        `🌎 Scene: ${data.scene}`
      );

      console.log(
        `🏃 Action: ${data.action}`
      );

      console.log('');
      console.log(
        `📖 Story: ${data.story}`
      );

      data.choices =
        cleanChoices(
          data.choices
        );

      // Image generation may return null
      // because your Free Tier currently has 0 quota.
      const generatedImage =
        await generateStoryImage(
          cleanImageBase64,
          data
        );

      console.log('');
      console.log(
        '📤 Sending story to frontend...'
      );

      return res.json({

        title:
          data.title,

        character:
          data.character,

        type:
          data.type,

        color:
          data.color,

        mood:
          data.mood,

        scene:
          data.scene,

        action:
          data.action,

        story:
          data.story,

        choices:
          data.choices,

        animation:
          data.animation,

        generated_image:
          generatedImage,

        generated_image_mime:
          generatedImage
            ? 'image/jpeg'
            : null

      });

    } catch (error) {

      console.error(
        '❌ DRAWING PROCESSING ERROR:',
        error
      );

      return res.status(500).json({

        error:
          error?.message ||
          'Failed to process drawing.'

      });
    }
  }
);

// ============================================================
// CONTINUE STORY API
// ============================================================

app.post(
  '/api/continue-story',
  async (req, res) => {

    console.log('');
    console.log('==============================');
    console.log('📖 CONTINUING STORY');
    console.log('==============================');

    try {

      const {
        character,
        currentStory,
        choice,
        currentScene
      } = req.body;

      console.log(
        'Character received:',
        character
      );

      console.log(
        'Choice received:',
        choice
      );

      if (!character) {

        return res.status(400).json({
          error: 'Character is required.'
        });

      }

      if (!currentStory) {

        return res.status(400).json({
          error: 'Current story is required.'
        });

      }

      if (!choice) {

        return res.status(400).json({
          error: 'Choice is required.'
        });

      }

      const continuation =
        await continueStory(

          character,

          currentStory,

          choice,

          currentScene ||
            'playground'

        );

      continuation.choices =
        cleanChoices(
          continuation.choices
        );

      console.log(
        `📖 ${continuation.story}`
      );

      console.log(
        `🎬 Animation: ${continuation.animation}`
      );

      console.log(
        `🌎 Scene: ${continuation.scene}`
      );

      // IMPORTANT:
      // We are NOT trying to generate another image here
      // because your current Free Tier has 0 image quota.

      return res.json({

        story:
          continuation.story,

        animation:
          continuation.animation,

        scene:
          continuation.scene,

        choices:
          continuation.choices,

        generated_image:
          null,

        generated_image_mime:
          null

      });

    } catch (error) {

      console.error(
        '❌ STORY CONTINUATION ERROR:',
        error
      );

      return res.status(500).json({

        error:
          error?.message ||
          'Could not continue the story.'

      });
    }
  }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
  '/api/health',
  (req, res) => {

    res.json({
      status: 'ok',
      analysis_models: ANALYSIS_MODELS,
      image_model: IMAGE_MODEL
    });

  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  () => {

    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      '🎨 DoodleTales AI Storybook'
    );

    console.log(
      '======================================'
    );

    console.log(
      `🚀 http://localhost:${PORT}`
    );

    console.log(
      `🧠 Analysis: ${ANALYSIS_MODELS.join(', ')}`
    );

    console.log(
      `🎨 Image: ${IMAGE_MODEL}`
    );

    console.log('');
    console.log(
      '📷 Ready to scan drawings!'
    );

  }
);