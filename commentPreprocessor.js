/**
 * Preprocesses raw YouTube comments for Aspect-Based Sentiment Analysis (ABSA).
 * 
 * Cleans text, decodes HTML entities, filters noise/spam, preserves metadata
 * (likes, author, date, type), and chunks comments into uniform batches.
 */

// Basic HTML entity decoder
function decodeHtmlEntities(str) {
    if (!str) return "";
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<br\s*[\/]?>/gi, " ")
        .replace(/<[^>]+>/g, ""); // strip remaining html tags
}

/**
 * Heuristic check for low-value noise or spam comments.
 * Keeps short comments if they contain key educational sentiment (e.g., "Clear!", "Wrong at 3:12").
 */
function isSpamOrNoise(text) {
    if (!text) return true;
    const clean = text.trim();
    if (clean.length < 3) return true;

    // Filter common bot/promo patterns
    const spamPatterns = [
        /whatsapp\s+(me|\+?\d)/i,
        /telegram\s*:\s*@/i,
        /check\s+(out\s+)?my\s+channel/i,
        /subscribe\s+to\s+my/i,
        /crypto\s+investment/i,
        /invest\s+with\s+(mr|mrs|dr)/i
    ];

    return spamPatterns.some((pattern) => pattern.test(clean));
}

/**
 * Preprocess a single raw comment object.
 * 
 * @param {Object} rawComment - { author, text, likes, publishedAt, type }
 * @param {number} index - Index for unique ID generation
 * @param {Object} options - Formatting and filtering options
 * @returns {Object|null} Sanitized comment object or null if filtered
 */
function preprocessComment(rawComment, index, options = {}) {
    const { maxTextLength = 600 } = options;

    if (!rawComment || typeof rawComment.text !== "string") {
        return null;
    }

    const cleanedText = decodeHtmlEntities(rawComment.text).replace(/\s+/g, " ").trim();

    if (isSpamOrNoise(cleanedText)) {
        return null;
    }

    // Truncate overly long comments to keep prompt token size predictable
    const truncatedText = cleanedText.length > maxTextLength
        ? cleanedText.slice(0, maxTextLength) + "..."
        : cleanedText;

    const likes = typeof rawComment.likes === "number" && rawComment.likes >= 0
        ? rawComment.likes
        : 0;

    return {
        id: `c_${index + 1}`,
        text: truncatedText,
        likes: likes,
        author: rawComment.author || "Anonymous",
        publishedAt: rawComment.publishedAt || null,
        type: rawComment.type || "top-level",
        // Engagement weight: log scale to prevent single viral comments from skewing analysis
        engagementWeight: Number((1 + Math.log(1 + likes)).toFixed(4))
    };
}

/**
 * Preprocesses an array of raw YouTube comments.
 * 
 * @param {Array<Object>} comments - Array of raw comments
 * @param {Object} [options={}] - Processing options
 * @returns {Array<Object>} Sanitized comments
 */
function preprocessComments(comments, options = {}) {
    if (!Array.isArray(comments)) {
        return [];
    }

    const preprocessed = [];
    for (let i = 0; i < comments.length; i++) {
        const item = preprocessComment(comments[i], preprocessed.length, options);
        if (item) {
            preprocessed.push(item);
        }
    }

    return preprocessed;
}

/**
 * Splits preprocessed comments into batches for LLM evaluation.
 * 
 * @param {Array<Object>} comments - Array of preprocessed comments
 * @param {number} [batchSize=30] - Number of comments per batch
 * @returns {Array<Array<Object>>} Array of comment batches
 */
function chunkCommentsIntoBatches(comments, batchSize = 30) {
    if (!Array.isArray(comments) || batchSize <= 0) {
        return [];
    }

    const batches = [];
    for (let i = 0; i < comments.length; i += batchSize) {
        batches.push(comments.slice(i, i + batchSize));
    }

    return batches;
}

module.exports = {
    decodeHtmlEntities,
    isSpamOrNoise,
    preprocessComment,
    preprocessComments,
    chunkCommentsIntoBatches
};
