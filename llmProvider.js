const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");
const config = require("./config");

// Initialize clients lazily or with configured keys
let groqClient = null;
let geminiClient = null;

function getGroqClient(customKey) {
    const key = customKey || config.groqApiKey;
    if (!key) throw new Error("GROQ_API_KEY is not defined in environment variables.");
    if (!groqClient || customKey) {
        groqClient = new Groq({ apiKey: key });
    }
    return groqClient;
}

function getGeminiClient(customKey) {
    const key = customKey || config.geminiApiKey;
    if (!key) throw new Error("GEMINI_API_KEY is not defined in environment variables.");
    if (!geminiClient || customKey) {
        geminiClient = new GoogleGenAI({ apiKey: key });
    }
    return geminiClient;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks if an error status code or message represents a temporary, retryable condition.
 */
function isRetryableError(error) {
    if (!error) return false;

    const status = error.status || error.statusCode || error.response?.status || error.code;
    const retryableStatuses = [429, 500, 502, 503, 504];

    if (retryableStatuses.includes(status)) {
        return true;
    }

    const msg = (error.message || "").toLowerCase();
    return (
        msg.includes("503") ||
        msg.includes("429") ||
        msg.includes("service unavailable") ||
        msg.includes("rate limit") ||
        msg.includes("overloaded") ||
        msg.includes("econnreset") ||
        msg.includes("etimedout")
    );
}

/**
 * Calculates exponential backoff with random jitter and respects Retry-After hints.
 */
function calculateBackoffDelay(attempt, error, baseMs = config.retryBaseDelayMs, maxMs = config.retryMaxDelayMs) {
    const msg = error?.message || "";
    const retryMatch = msg.match(/retry in ([\d.]+)s/i);
    if (retryMatch) {
        return Math.min(maxMs, Math.ceil(parseFloat(retryMatch[1]) * 1000));
    }

    // Exponential delay + random jitter (10% - 30%)
    const exponential = baseMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * (baseMs * 0.5));
    return Math.min(maxMs, exponential + jitter);
}

/**
 * Executes a call using the official Groq SDK.
 */
async function callGroq(payload, options = {}) {
    const client = options.groqClient || getGroqClient(options.groqApiKey);
    const model = options.model || config.groqModel;

    const startTime = Date.now();
    const messages = [];

    if (payload.systemInstruction) {
        messages.push({ role: "system", content: payload.systemInstruction });
    }

    messages.push({ role: "user", content: payload.prompt });

    const completion = await client.chat.completions.create({
        model: model,
        messages: messages,
        response_format: { type: "json_object" },
        temperature: options.temperature || 0.1
    });

    const durationMs = Date.now() - startTime;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("Groq returned empty response content.");
    }

    let parsed = JSON.parse(content);
    // If wrapped in a top-level property like "evaluations", unwrap or return
    if (!Array.isArray(parsed) && Array.isArray(parsed.evaluations)) {
        parsed = parsed.evaluations;
    }

    const totalTokens = completion.usage?.total_tokens || null;

    return {
        data: parsed,
        tokens: totalTokens,
        durationMs,
        provider: "groq",
        model: model
    };
}

/**
 * Executes a call using the official Google GenAI SDK.
 */
async function callGemini(payload, options = {}) {
    const client = options.geminiClient || getGeminiClient(options.geminiApiKey);
    const model = options.model || config.geminiModel;

    const startTime = Date.now();

    const requestConfig = {
        model: model,
        contents: payload.prompt,
        config: {
            responseMimeType: "application/json",
            temperature: options.temperature || 0.1
        }
    };

    if (payload.geminiSchema) {
        requestConfig.config.responseSchema = payload.geminiSchema;
    }
    if (payload.systemInstruction) {
        requestConfig.config.systemInstruction = payload.systemInstruction;
    }

    const response = await client.models.generateContent(requestConfig);
    const durationMs = Date.now() - startTime;

    const rawText = response.text;
    if (!rawText) {
        throw new Error("Gemini returned empty response text.");
    }

    let parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed) && Array.isArray(parsed.evaluations)) {
        parsed = parsed.evaluations;
    }

    const totalTokens = response.usageMetadata?.totalTokenCount || null;

    return {
        data: parsed,
        tokens: totalTokens,
        durationMs,
        provider: "gemini",
        model: model
    };
}

/**
 * Executes an LLM request with retry backoff for a given provider.
 */
async function executeProviderWithRetry(providerName, payload, options = {}) {
    const maxRetries = options.maxRetries ?? config.maxRetries;
    const caller = providerName === "groq" ? callGroq : callGemini;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await caller(payload, options);
        } catch (error) {
            const isRetryable = isRetryableError(error);
            const status = error.status || error.statusCode || error.response?.status || "ERR";

            if (isRetryable && attempt < maxRetries) {
                const delayMs = calculateBackoffDelay(attempt, error);
                console.warn(
                    `[${providerName.toUpperCase()}] Batch failed (${status}). Retrying ${attempt + 1}/${maxRetries} in ${Math.ceil(delayMs / 1000)}s...`
                );
                await sleep(delayMs);
            } else {
                error.provider = providerName;
                error.attempts = attempt + 1;
                throw error;
            }
        }
    }
}

/**
 * Primary LLM execution entry point with automatic provider failover.
 * 
 * Tries the primary provider with retries. If the primary provider fails completely
 * and failover is enabled, switches to the secondary provider for that specific batch.
 */
async function executeLLMWithFailover(payload, options = {}) {
    const primary = options.primaryLLM || config.primaryLLM;
    const secondary = options.secondaryLLM || config.secondaryLLM;
    const enableFailover = options.enableFailover ?? config.enableFailover;

    try {
        return await executeProviderWithRetry(primary, payload, options);
    } catch (primaryError) {
        if (!enableFailover || primary === secondary) {
            throw primaryError;
        }

        console.warn(
            `\n⚠️ [FAILOVER] Primary provider (${primary.toUpperCase()}) exhausted retries (${primaryError.message}). Switching to secondary provider (${secondary.toUpperCase()})...\n`
        );

        try {
            const secondaryOptions = { ...options, model: secondary === "gemini" ? config.geminiModel : config.groqModel };
            return await executeProviderWithRetry(secondary, payload, secondaryOptions);
        } catch (secondaryError) {
            throw new Error(
                `Both primary (${primary}: ${primaryError.message}) and secondary (${secondary}: ${secondaryError.message}) providers failed.`
            );
        }
    }
}

module.exports = {
    isRetryableError,
    calculateBackoffDelay,
    callGroq,
    callGemini,
    executeProviderWithRetry,
    executeLLMWithFailover
};
