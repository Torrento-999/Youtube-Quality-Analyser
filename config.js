require("dotenv").config();

const ASPECT_CATEGORIES = [
    "CLARITY",
    "PACING",
    "CONTENT_ACCURACY",
    "CONTENT_DEPTH",
    "PRACTICAL_EXAMPLES",
    "ORGANIZATION",
    "ENGAGEMENT",
    "AUDIO_VIDEO",
    "UPDATEDNESS",
    "GENERAL_QUALITY",
    "OTHER"
];

const DEFAULT_ASPECT_WEIGHTS = {
    CONTENT_ACCURACY: 0.20,
    CLARITY: 0.20,
    PRACTICAL_EXAMPLES: 0.15,
    CONTENT_DEPTH: 0.10,
    PACING: 0.08,
    ORGANIZATION: 0.08,
    AUDIO_VIDEO: 0.07,
    UPDATEDNESS: 0.05,
    ENGAGEMENT: 0.05,
    GENERAL_QUALITY: 0.02,
    OTHER: 0.00
};

const ASPECT_LABELS = {
    CLARITY: "Explanation Clarity & Simplicity",
    PACING: "Pacing & Delivery Speed",
    CONTENT_ACCURACY: "Technical Accuracy & Bug-Free Content",
    CONTENT_DEPTH: "Content Depth & Thoroughness",
    PRACTICAL_EXAMPLES: "Practical & Real-World Examples",
    ORGANIZATION: "Logical Structure & Organization",
    ENGAGEMENT: "Viewer Engagement & Motivation",
    AUDIO_VIDEO: "Audio, Video & Screen Production",
    UPDATEDNESS: "Modern & Up-to-Date Versions",
    GENERAL_QUALITY: "Overall Video Quality & Value",
    OTHER: "Other Feedback"
};

const config = {
    // LLM Provider options
    primaryLLM: (process.env.PRIMARY_LLM || "groq").toLowerCase(),
    secondaryLLM: (process.env.SECONDARY_LLM || "gemini").toLowerCase(),
    enableFailover: process.env.ENABLE_FAILOVER !== "false",
    enableSynthesis: process.env.ENABLE_SYNTHESIS !== "false",

    // Model configurations
    groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",

    // API Keys
    groqApiKey: process.env.GROQ_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    youtubeApiKey: process.env.YOUTUBE_API_KEY || "",

    // Processing & Performance Tuning
    batchSize: parseInt(process.env.BATCH_SIZE, 10) || 50,
    concurrency: parseInt(process.env.CONCURRENCY, 10) || 3,
    maxComments: parseInt(process.env.MAX_COMMENTS, 10) || 500,

    // Retry settings
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
    retryBaseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS, 10) || 1000,
    retryMaxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS, 10) || 15000,

    // Persistence
    checkpointDir: process.env.CHECKPOINT_DIR || "./.checkpoints",

    // Aspect settings
    aspectCategories: ASPECT_CATEGORIES,
    aspectWeights: DEFAULT_ASPECT_WEIGHTS,
    aspectLabels: ASPECT_LABELS
};

module.exports = config;
