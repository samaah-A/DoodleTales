import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// ============================================================
// CONFIGURATION
// ============================================================

const ANALYSIS_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash'
];


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json({
  limit: '15mb'
}));

app.use(express.static('.'));


app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});


// ============================================================
// RETRY HELPER
// ============================================================

async function callWithRetry(fn, retries = 1) {

  let lastError;

  for (
    let attempt = 0;
    attempt <= retries;
    attempt++
  ) {

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
        error?.message || '';

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

      // Only retry temporary server errors.
      if (
        status !== 500 &&
        status !== 503
      ) {

        throw error;
      }

      if (attempt < retries) {

        await new Promise(
          resolve =>
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

    story: {
      type: 'string'
    },

    choices: {
      type: 'array',
      items: {
        type: 'string'
      }
    }

  },

  required: [
    'character',
    'type',
    'color',
    'mood',
    'scene',
    'action',
    'animation',
    'story',
    'choices'
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

    choices: {
      type: 'array',
      items: {
        type: 'string'
      }
    }

  },

  required: [
    'story',
    'scene',
    'animation',
    'choices'
  ]

};


// ============================================================
// CLEAN CHOICES
// ============================================================

function cleanChoices(choices) {

  if (!Array.isArray(choices)) {
    return [];
  }

  return choices
    .filter(
      choice =>
        typeof choice === 'string' &&
        choice.trim().length > 0
    )
    .slice(0, 2);

}


// ============================================================
// ANALYZE DRAWING
// ============================================================

async function analyzeDrawing(imageBase64, chapterNumber) {

  const prompt = `

You are Gemini, the creative story engine for a children's
interactive storybook called DoodleTales.

A child has just drawn a picture.

This is Chapter ${chapterNumber} of their story.

Carefully look at the drawing and identify what the child
created.

The drawing may be:
- rough
- simple
- abstract
- colorful
- unfinished
- child-like

Do NOT reject the drawing because it is imperfect.

Identify:

1. The main character or object
2. What kind of character/object it is
3. Its main color
4. Its mood
5. What it appears to be doing
6. A suitable story scene

Then write the next chapter of the story.

IMPORTANT:

This is an interactive children's story.

The story should:
- be 3-5 sentences
- be exciting and imaginative
- be appropriate for children
- directly use details from the drawing
- make the drawing feel important
- connect naturally to the previous chapter when one exists
- make the child feel like they created the story

For this scan, this is a NEW chapter.

Return exactly TWO possible choices for what happens next.

The choices should:
- be simple enough for a child
- be different from each other
- move the story forward
- describe an action

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

Return ONLY valid JSON.

`;


  let lastError = null;


  for (
    const model of ANALYSIS_MODELS
  ) {

    try {

      console.log(
        `🧠 Trying ${model}...`
      );


      const response =
        await callWithRetry(
          () =>
            ai.models.generateContent({

              model,

              contents: [

                {
                  text: prompt
                },

                {
                  inlineData: {

                    mimeType:
                      'image/jpeg',

                    data:
                      imageBase64

                  }

                }

              ],

              config: {

                responseMimeType:
                  'application/json',

                responseSchema:
                  storySchema

              }

            }),

          1
        );


      console.log(
        `✅ ${model} succeeded`
      );


      const result =
        JSON.parse(
          response.text
        );


      result.choices =
        cleanChoices(
          result.choices
        );


      // Guarantee two choices.
      if (
        result.choices.length < 2
      ) {

        result.choices = [

          'Explore what happens next',

          'Go somewhere new'

        ];

      }


      return result;


    } catch (error) {

      lastError =
        error;


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
// CONTINUE STORY
// ============================================================

async function continueStory(
  character,
  currentStory,
  choice,
  currentScene
) {

  const prompt = `

You are the story engine for DoodleTales,
a children's interactive storybook.

The child is creating an ongoing story.

Main character:
${character}

Current scene:
${currentScene || 'playground'}

Story so far:
${currentStory}

The child chose:

"${choice}"

Now write the NEXT CHAPTER of the story.

IMPORTANT:

This must feel like a completely new chapter that
continues directly from the previous story.

The child's choice MUST affect what happens.

Rules:

- Write 3-5 sentences.
- Keep the same main character.
- Continue naturally from the story so far.
- Do NOT restart the story.
- Do NOT repeat the previous chapter.
- Make the child's choice clearly affect the events.
- Introduce a new event, action, discovery, or problem.
- Keep the story playful and imaginative.
- Keep it appropriate for children.
- Do not mention AI.
- Do not mention that this is a generated story.
- Do not introduce a completely unrelated character.
- Make the chapter feel like the next page of the same adventure.

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

Return ONLY valid JSON.

`;


  let lastError = null;


  for (
    const model of ANALYSIS_MODELS
  ) {

    try {

      console.log(
        `🧠 Continuing with ${model}...`
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

                responseMimeType:
                  'application/json',

                responseSchema:
                  continuationSchema

              }

            }),

          1
        );


      console.log(
        `✅ ${model} continued story`
      );


      const result =
        JSON.parse(
          response.text
        );


      result.choices =
        cleanChoices(
          result.choices
        );


      if (
        result.choices.length < 2
      ) {

        result.choices = [

          'Keep exploring',

          'Try something surprising'

        ];

      }


      return result;


    } catch (error) {

      lastError =
        error;


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

        continue;

      }


      throw error;

    }

  }


  throw lastError;

}


// ============================================================
// SCAN DRAWING API
// ============================================================

app.post(
  '/api/scan-drawing',
  async (req, res) => {

    try {

      const {
        imageBase64,
        chapterNumber
      } = req.body;


      if (!imageBase64) {

        return res.status(400).json({

          error:
            'Drawing image is required.'

        });

      }


      const cleanBase64 =
        imageBase64
          .replace(
            /^data:image\/\w+;base64,/,
            ''
          );


      const chapter =
        Number(chapterNumber) || 1;


      console.log('');
      console.log(
        '=============================='
      );
      console.log(
        `🎨 SCANNING DRAWING - CHAPTER ${chapter}`
      );
      console.log(
        '=============================='
      );


      const result =
        await analyzeDrawing(
          cleanBase64,
          chapter
        );


      console.log(
        'Character:',
        result.character
      );

      console.log(
        'Story:',
        result.story
      );


      res.json({

        character:
          result.character,

        type:
          result.type,

        color:
          result.color,

        mood:
          result.mood,

        scene:
          result.scene,

        action:
          result.action,

        animation:
          result.animation,

        story:
          result.story,

        choices:
          result.choices,

        chapterNumber:
          chapter

      });


    } catch (error) {

      console.error(
        '❌ DRAWING PROCESSING ERROR:',
        error
      );


      res.status(500).json({

        error:
          error?.message ||
          'Could not analyze the drawing.'

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

    try {

      const {
        character,
        currentStory,
        choice,
        currentScene
      } = req.body;


      if (!character) {

        return res.status(400).json({

          error:
            'Character is required.'

        });

      }


      if (!currentStory) {

        return res.status(400).json({

          error:
            'Current story is required.'

        });

      }


      if (!choice) {

        return res.status(400).json({

          error:
            'Choice is required.'

        });

      }


      console.log('');
      console.log(
        '=============================='
      );
      console.log(
        '📖 CONTINUING STORY'
      );
      console.log(
        '=============================='
      );


      console.log(
        'Character:',
        character
      );

      console.log(
        'Choice:',
        choice
      );


      const result =
        await continueStory(
          character,
          currentStory,
          choice,
          currentScene
        );


      res.json({

        story:
          result.story,

        scene:
          result.scene,

        animation:
          result.animation,

        choices:
          result.choices

      });


    } catch (error) {

      console.error(
        '❌ STORY CONTINUATION ERROR:',
        error
      );


      res.status(500).json({

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

      status:
        'ok',

      models:
        ANALYSIS_MODELS

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
      '🎨 DoodleTales is running!'
    );

    console.log(
      `🌐 http://localhost:${PORT}`
    );

    console.log(
      '======================================'
    );

    console.log(
      '🧠 Analysis models:',
      ANALYSIS_MODELS.join(', ')
    );

    console.log('');

  }
);