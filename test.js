
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});


// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Gemini API retry handler
async function generateWithRetry(request, maxRetries = 5) {

    for (let attempt = 0; attempt < maxRetries; attempt++) {

        try {

            const response = await ai.models.generateContent(request);

            return response;

        } catch (error) {

            const status = error.status;

            // Retry temporary errors
            const retryableErrors = [429, 500, 502, 503, 504];

            if (retryableErrors.includes(status)) {

                if (attempt === maxRetries - 1) {

                    console.error("Gemini failed after multiple retries.");

                    throw error;
                }

                // Exponential backoff
                let delay = Math.min(
                    2000 * Math.pow(2, attempt),
                    60000
                );

                // Respect Gemini's suggested retry delay if available
                const errorMessage = error.message || "";

                const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);

                if (retryMatch) {

                    const suggestedDelay = Math.ceil(
                        parseFloat(retryMatch[1]) * 1000
                    );

                    delay = Math.max(delay, suggestedDelay);
                }

                console.log(
                    `Gemini error ${status}. ` +
                    `Retrying in ${Math.ceil(delay / 1000)} seconds...`
                );

                await sleep(delay);

            } else {

                // Non-retryable error
                console.error("Gemini API error:", error.message);

                throw error;
            }
        }
    }
}

// Main sentiment analysis function
async function main(text) {

    try {

        const prompt = `
You are an expert YouTube educational video quality evaluator
and sentiment analysis specialist.

You will receive a COMPLETE TEXT FILE containing comments
collected from a YouTube educational video.

Your task is to analyze the comments collectively to determine
what viewers think about the QUALITY OF THE VIDEO.

IMPORTANT INSTRUCTIONS:

1. Analyze the entire comment collection before making conclusions.
2. Evaluate sentiment specifically toward the video's quality,
   teaching effectiveness, clarity, usefulness, accuracy,
   depth, presentation, and engagement.
3. Do NOT classify sentiment based merely on positive or negative words.
4. Understand the meaning and context of the comment.
5. Distinguish opinions about the VIDEO from opinions about
   the SUBJECT or TOPIC being discussed.
6. Comments expressing personal experiences, unrelated jokes,
   greetings, or unrelated discussions should not influence
   video quality sentiment.
7. Identify sarcasm, indirect criticism, and mixed opinions.
8. Do not assume that high engagement means high video quality.
9. Do not assume that a comment praising the topic is praising
   the video itself.
10. Base your conclusions exclusively on the provided comments.
    Do not invent opinions or information.

CLASSIFICATION:

POSITIVE:
The viewer considers the video useful, informative, clear,
accurate, engaging, well-explained, or high-quality.

NEGATIVE:
The viewer considers the video confusing, inaccurate,
poorly explained, unhelpful, boring, misleading, or low-quality.

NEUTRAL:
The viewer expresses no clear positive or negative opinion
about the video's quality.

MIXED:
The viewer appreciates some aspects of the video but criticizes
other aspects, such as good content but poor explanation.

IRRELEVANT:
The comment does not provide meaningful information about
the video's quality.

ANALYSIS REQUIREMENTS:

- Determine the sentiment of each comment toward video quality.
- Calculate the percentage of positive, negative, neutral,
  mixed, and irrelevant comments.
- Identify the most frequently praised aspects.
- Identify the most frequently criticized aspects.
- Determine the overall viewer perception of video quality.
- Provide insights into how the creator could improve the video.

Return the results in valid JSON only, using this structure:

{
  "totalComments": 0,
  "sentimentDistribution": {
    "positive": 0,
    "negative": 0,
    "neutral": 0,
    "mixed": 0,
    "irrelevant": 0
  },
  "overallVideoQuality": "Positive / Negative / Mixed / Neutral",
  "qualityScore": 0,
  "mostPraisedAspects": [],
  "mostCriticizedAspects": [],
  "improvementSuggestions": [],
  "overallAnalysis": ""
}

IMPORTANT:
- Sentiment distribution values must be percentages.
- All percentages must sum to 100.
- qualityScore must be an integer from 0 to 100.
- qualityScore represents perceived video quality based on
  relevant viewer feedback, NOT the percentage of positive comments.
- If insufficient relevant comments exist, clearly indicate
  low confidence rather than making unsupported conclusions.

Now analyze the complete comment text provided below:

${text}
`;

        const response = await generateWithRetry({

            model: process.env.GEMINI_MODEL || "gemini-3.8-flash",

            contents: prompt,

            config: {
                responseMimeType: "application/json"
            }

        });

        // Correct response extraction
        const result = response.text;

        if (!result) {
            throw new Error("Gemini returned an empty response.");
        }

        // Convert JSON string into JavaScript object
        const parsedResult = JSON.parse(result);

        console.log("AI Analysis:", parsedResult);

        return parsedResult;

    } catch (error) {

        console.error("Sentiment analysis failed:", error.message);

        throw error;
    }
}

module.exports = main;
