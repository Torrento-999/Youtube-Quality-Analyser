require("dotenv").config();
const OpenAI = require("openai");

// Read XAI_API_KEY from environment, with fallback to grok_* key if previously stored in GROQ_API_KEY
const apiKey = process.env.XAI_API_KEY || (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.startsWith("grok_") ? process.env.GROQ_API_KEY : null);

if (!apiKey) {
    console.error("Error: XAI_API_KEY is not set in .env. Please add XAI_API_KEY=<your-key> to your .env file.");
    process.exit(1);
}

// Official xAI endpoint using OpenAI-compatible SDK
const client = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.x.ai/v1"
});

async function testXAI() {
    // Current official xAI model (configurable via XAI_MODEL, default: grok-4.7)
    const model = process.env.XAI_MODEL || "grok-4.7";

    try {
        const completion = await client.chat.completions.create({
            model: model,
            messages: [
                {
                    role: "user",
                    content: "Explain sentiment analysis in two sentences."
                }
            ]
        });

        const reply = completion.choices?.[0]?.message?.content;
        if (!reply) {
            throw new Error("Received empty response from xAI API.");
        }

        // Print only the model response
        console.log(reply.trim());
    } catch (error) {
        // Redact any occurrences of the API key from error output
        let cleanError = error.message || String(error);
        if (apiKey) {
            cleanError = cleanError.split(apiKey).join("[REDACTED_API_KEY]");
        }

        const statusCode = error.status || error.statusCode;
        if (statusCode) {
            console.error(`xAI API Error (${statusCode}): ${cleanError}`);
        } else {
            console.error(`xAI Request Error: ${cleanError}`);
        }
        process.exit(1);
    }
}

testXAI();
