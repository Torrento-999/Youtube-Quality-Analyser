const config = require("./config");
const { executeLLMWithFailover } = require("./llmProvider");
const asyncPool = require("./asyncPool");
const checkpointManager = require("./checkpointManager");

/**
 * Gemini response schema for strict validation.
 */
const ABSA_GEMINI_SCHEMA = {
    type: "OBJECT",
    properties: {
        evaluations: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    commentId: { type: "STRING" },
                    relevance: {
                        type: "STRING",
                        enum: ["RELEVANT", "IRRELEVANT", "UNCERTAIN"]
                    },
                    sentiment: {
                        type: "STRING",
                        enum: ["POSITIVE", "NEGATIVE", "MIXED", "NEUTRAL", "UNCERTAIN"]
                    },
                    aspects: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                category: {
                                    type: "STRING",
                                    enum: config.aspectCategories
                                },
                                opinion: {
                                    type: "STRING",
                                    enum: ["PRAISE", "CRITICISM", "MIXED", "NEUTRAL"]
                                },
                                confidence: { type: "NUMBER" },
                                evidence: { type: "STRING" }
                            },
                            required: ["category", "opinion", "confidence", "evidence"]
                        }
                    },
                    praisedPoints: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                    },
                    criticizedPoints: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                    }
                },
                required: ["commentId", "relevance", "sentiment", "aspects"]
            }
        }
    },
    required: ["evaluations"]
};

function buildBatchPrompt(batch, videoContext = {}) {
    const formatted = batch.map((c) => `[ID: ${c.id} | Likes: ${c.likes}]\n${c.text}`).join("\n\n");

    const contextLine = videoContext.title
        ? `VIDEO CONTEXT: Title: "${videoContext.title}" | Channel: "${videoContext.channel || 'Unknown'}"\n\n`
        : "";

    return `
You are an expert pedagogical evaluator and Aspect-Based Sentiment Analysis (ABSA) system for YouTube educational videos.
${contextLine}Analyze each student/viewer comment independently and determine what it reveals about the educational quality of the video.

CRITICAL GUIDELINES:
1. RELEVANCE:
   - "RELEVANT": Comment provides meaningful feedback about the video, explanations, teaching, accuracy, production, or structure.
   - "IRRELEVANT": Spam, channel promotions, greetings ("first!"), comments purely about the topic rather than the video, or personal anecdotes with no feedback.
   - "UNCERTAIN": Ambiguous, cryptic, or impossible to determine if it refers to the video.

2. OVERALL SENTIMENT:
   - "POSITIVE", "NEGATIVE", "MIXED", "NEUTRAL", or "UNCERTAIN". Do not force ambiguous comments into positive or negative.

3. ASPECT CATEGORIES (Include only aspects explicitly or implicitly addressed in the comment):
   - CLARITY: Explanation clarity, ease of following, simplicity of breakdown.
   - PACING: Speed of explanation (too fast, too slow, just right).
   - CONTENT_ACCURACY: Technical correctness, syntax errors, bugs in demonstrated code.
   - CONTENT_DEPTH: Thoroughness, prerequisite handling, deep dive vs superficial overview.
   - PRACTICAL_EXAMPLES: Real-world usefulness, working demos, practical utility.
   - ORGANIZATION: Logical flow, timestamps, modular structure.
   - ENGAGEMENT: Presenter charisma, ability to keep attention, enthusiasm.
   - AUDIO_VIDEO: Audio levels, background music, video resolution, code font readability.
   - UPDATEDNESS: Modern syntax vs deprecated APIs/versions.
   - GENERAL_QUALITY: Overall recommendation, general appreciation or disappointment.
   - OTHER: Specific feedback that fits none of the above.

4. ASPECT OPINION:
   - "PRAISE", "CRITICISM", "MIXED", or "NEUTRAL".

5. PRESERVE EVERY COMMENT ID:
   - You MUST output an evaluation object for EVERY comment in the batch using its exact ID. Do NOT omit or hallucinate comment IDs.

Output format must be a valid JSON object matching:
{
  "evaluations": [
    {
      "commentId": "c_1",
      "relevance": "RELEVANT / IRRELEVANT / UNCERTAIN",
      "sentiment": "POSITIVE / NEGATIVE / MIXED / NEUTRAL / UNCERTAIN",
      "aspects": [
        {
          "category": "CLARITY / PACING / ...",
          "opinion": "PRAISE / CRITICISM / MIXED / NEUTRAL",
          "confidence": 0.0 to 1.0,
          "evidence": "quote or specific phrase"
        }
      ],
      "praisedPoints": ["short summary of praise"],
      "criticizedPoints": ["short summary of criticism"]
    }
  ]
}

COMMENTS TO EVALUATE:
${formatted}
`.trim();
}

/**
 * Classifies a single batch of comments with provider failover.
 */
async function classifyCommentBatch(batch, videoContext = {}, options = {}) {
    if (!batch || batch.length === 0) {
        return { evaluations: [], provider: "none", durationMs: 0, tokens: null };
    }

    const prompt = buildBatchPrompt(batch, videoContext);
    const payload = {
        prompt,
        geminiSchema: ABSA_GEMINI_SCHEMA,
        systemInstruction: "You are a precise, objective Aspect-Based Sentiment Analysis evaluator. Output valid JSON only."
    };

    const response = await executeLLMWithFailover(payload, options);

    let evaluations = [];
    if (Array.isArray(response.data)) {
        evaluations = response.data;
    } else if (response.data && Array.isArray(response.data.evaluations)) {
        evaluations = response.data.evaluations;
    }

    return {
        evaluations,
        provider: response.provider,
        durationMs: response.durationMs,
        tokens: response.tokens
    };
}

/**
 * Classifies all batches concurrently with checkpoint resumption and failover.
 */
async function classifyAllBatches(batches, videoId = "default_video", videoContext = {}, options = {}) {
    const concurrency = options.concurrency || config.concurrency;
    const allEvaluations = [];

    console.log(`\nClassification: ${batches.length} batches`);
    console.log(`Concurrency: ${concurrency} (Primary: ${(options.primaryLLM || config.primaryLLM).toUpperCase()})`);

    const batchTasks = batches.map((batch, batchIndex) => async () => {
        // 1. Check if batch already completed in local checkpoint
        const cached = checkpointManager.getCompletedBatch(videoId, batchIndex);
        if (cached && Array.isArray(cached.classifications) && cached.classifications.length > 0) {
            console.log(`Batch ${batchIndex + 1}/${batches.length}: Resumed from checkpoint (${cached.provider})`);
            return {
                batchIndex,
                evaluations: cached.classifications,
                fromCheckpoint: true,
                provider: cached.provider
            };
        }

        // 2. Execute with failover
        try {
            const result = await classifyCommentBatch(batch, videoContext, options);
            const tokenInfo = result.tokens ? `, ${result.tokens} tokens` : "";
            console.log(
                `Batch ${batchIndex + 1}/${batches.length}: Success (${result.provider.toUpperCase()}) [${result.durationMs}ms${tokenInfo}]`
            );

            // 3. Save completed batch result to checkpoint
            checkpointManager.saveBatch(videoId, batchIndex, {
                commentIds: batch.map((c) => c.id),
                classifications: result.evaluations,
                provider: result.provider,
                durationMs: result.durationMs,
                tokens: result.tokens
            });

            return {
                batchIndex,
                evaluations: result.evaluations,
                provider: result.provider,
                fromCheckpoint: false
            };
        } catch (error) {
            console.error(`Batch ${batchIndex + 1}/${batches.length}: Failed completely - ${error.message}`);
            // Return empty evaluations so rest of video processing continues
            return {
                batchIndex,
                evaluations: [],
                error: error.message
            };
        }
    });

    // Run batches through controlled concurrency async pool
    const completedBatchResults = await asyncPool(batchTasks, concurrency, (task) => task());

    for (const b of completedBatchResults) {
        if (b && Array.isArray(b.evaluations)) {
            allEvaluations.push(...b.evaluations);
        }
    }

    return allEvaluations;
}

module.exports = {
    ABSA_GEMINI_SCHEMA,
    buildBatchPrompt,
    classifyCommentBatch,
    classifyAllBatches
};
