const fs = require("fs");
const path = require("path");

const FRIENDLY_ASPECT_NAMES = {
    CLARITY: "Clarity",
    PACING: "Pacing",
    CONTENT_ACCURACY: "Content Accuracy",
    CONTENT_DEPTH: "Content Depth",
    PRACTICAL_EXAMPLES: "Practical Examples",
    ORGANIZATION: "Organization",
    ENGAGEMENT: "Engagement",
    AUDIO_VIDEO: "Audio/Video",
    UPDATEDNESS: "Updatedness",
    GENERAL_QUALITY: "General Quality",
    OTHER: "Other"
};

/**
 * Simplifies verbose tier strings into clean ratings (e.g., "Exceptional", "Good").
 */
function formatRatingTier(tier) {
    if (!tier || typeof tier !== "string") return "N/A";
    const lower = tier.toLowerCase();
    if (lower.includes("exceptional")) return "Exceptional";
    if (lower.includes("good")) return "Good";
    if (lower.includes("average") || lower.includes("mixed")) return "Average / Mixed";
    if (lower.includes("low") || lower.includes("problematic") || lower.includes("poor")) return "Low Quality";
    if (lower.includes("insufficient")) return "Insufficient Evidence";
    return tier.replace(/\s*(Educational\s*)?Quality\s*/gi, "").trim() || tier;
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Formats a clean, concise, human-readable text report for a video evaluation.
 *
 * @param {Object} result - Final video analysis result object.
 * @returns {string} Formatted plain text report.
 */
function formatEducationalReport(result) {
    if (!result) return "";

    const title = result.videoMeta?.title || "Untitled Video";
    const url = result.videoURL || (result.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : "N/A");

    // 1. Overall Score & Rating
    const overallScore = result.overallEducationalQuality?.score;
    const tier = result.overallEducationalQuality?.tier;
    const scoreStr = overallScore !== null && overallScore !== undefined
        ? `${overallScore}/100 — ${formatRatingTier(tier)}`
        : "Insufficient Evidence";

    // 2. Metrics
    const sentiment = result.overallEducationalQuality?.generalSentiment || "Neutral";
    const confidenceLevel = capitalize(result.evidenceCoverage?.confidenceLevel || "Low");
    const confidenceScore = result.evidenceCoverage?.confidenceScore ?? 0;
    const coveragePercent = result.evidenceCoverage?.aspectCoveragePercent ?? 0;

    // 3. Aspect Scores
    const aspectLines = [];
    const aspectScores = result.aspectScores || {};

    // Group aspects into those with mentions vs those without
    const activeAspects = [];
    const emptyAspects = [];

    for (const [key, data] of Object.entries(aspectScores)) {
        const name = FRIENDLY_ASPECT_NAMES[key] || data.label || key;
        const mentions = data.totalMentions || 0;
        const score = data.score;

        if (mentions > 0) {
            activeAspects.push({ name, mentions, score });
        } else {
            emptyAspects.push({ name, mentions: 0, score: null });
        }
    }

    // Sort active aspects: scored aspects first (by score descending), then insufficient evidence
    activeAspects.sort((a, b) => {
        if (a.score !== null && b.score !== null) return b.score - a.score;
        if (a.score !== null) return -1;
        if (b.score !== null) return 1;
        return b.mentions - a.mentions;
    });

    if (activeAspects.length > 0) {
        for (const item of activeAspects) {
            const mentionLabel = `${item.mentions} mention${item.mentions === 1 ? "" : "s"}`;
            if (item.score !== null && item.mentions >= 2) {
                aspectLines.push(`• ${item.name}: ${item.score}/100 (${mentionLabel})`);
            } else {
                aspectLines.push(`• ${item.name}: Insufficient evidence (${mentionLabel})`);
            }
        }
    } else {
        aspectLines.push("• Insufficient evidence across evaluated aspects");
    }

    // 4. Key Strengths
    const strengthsLines = [];
    const rawStrengths = result.synthesis?.strengths || [];
    if (Array.isArray(rawStrengths) && rawStrengths.length > 0) {
        for (const s of rawStrengths.slice(0, 5)) {
            if (s && typeof s === "string" && s.trim()) {
                strengthsLines.push(`• ${s.trim()}`);
            }
        }
    } else if (Array.isArray(result.topPraisedAspects) && result.topPraisedAspects.length > 0) {
        for (const p of result.topPraisedAspects.slice(0, 4)) {
            if (p?.point) strengthsLines.push(`• ${capitalize(p.point)}`);
        }
    }
    if (strengthsLines.length === 0) {
        strengthsLines.push("• None identified from viewer comments");
    }

    // 5. Key Weaknesses
    const weaknessesLines = [];
    const rawWeaknesses = result.synthesis?.weaknesses || [];
    if (Array.isArray(rawWeaknesses) && rawWeaknesses.length > 0) {
        for (const w of rawWeaknesses.slice(0, 5)) {
            if (w && typeof w === "string" && w.trim()) {
                weaknessesLines.push(`• ${w.trim()}`);
            }
        }
    } else if (Array.isArray(result.topCriticisms) && result.topCriticisms.length > 0) {
        for (const c of result.topCriticisms.slice(0, 4)) {
            if (c?.point) weaknessesLines.push(`• ${capitalize(c.point)}`);
        }
    }
    if (weaknessesLines.length === 0) {
        weaknessesLines.push("• None identified from viewer comments");
    }

    // 6. Actionable Suggestions
    const suggestionsLines = [];
    const rawSuggestions = result.synthesis?.improvementSuggestions || [];
    if (Array.isArray(rawSuggestions) && rawSuggestions.length > 0) {
        for (const s of rawSuggestions.slice(0, 5)) {
            if (s && typeof s === "string" && s.trim()) {
                suggestionsLines.push(`• ${s.trim()}`);
            }
        }
    }
    if (suggestionsLines.length === 0) {
        suggestionsLines.push("• Maintain current educational quality and monitor future feedback");
    }

    // Assemble text report
    return [
        "YOUTUBE EDUCATIONAL QUALITY REPORT",
        "",
        `Video: ${title}`,
        `URL: ${url}`,
        "",
        `OVERALL SCORE: ${scoreStr}`,
        "",
        `Sentiment: ${sentiment}`,
        `Confidence: ${confidenceLevel} (${confidenceScore}%)`,
        `Evidence Coverage: ${coveragePercent}%`,
        "",
        "ASPECT SCORES",
        aspectLines.join("\n"),
        "",
        "KEY STRENGTHS",
        strengthsLines.join("\n"),
        "",
        "KEY WEAKNESSES",
        weaknessesLines.join("\n"),
        "",
        "SUGGESTIONS",
        suggestionsLines.join("\n")
    ].join("\n");
}

/**
 * Saves a formatted report to a .txt file.
 *
 * @param {Object} result - Final video analysis result.
 * @param {string} [customPath] - Optional destination file path.
 * @returns {string} The path of the written file.
 */
function saveEducationalReport(result, customPath) {
    const formatted = formatEducationalReport(result);
    const fileName = customPath || `report_${result.videoId || "video"}.txt`;
    const resolvedPath = path.resolve(process.cwd(), fileName);

    fs.writeFileSync(resolvedPath, formatted, "utf-8");
    return resolvedPath;
}

/**
 * Formats multiple video reports into a consolidated .txt report.
 *
 * @param {Array<Object>} results - Array of video analysis results.
 * @returns {string} Consolidated plain text report.
 */
function formatMultiVideoReport(results) {
    if (!Array.isArray(results) || results.length === 0) {
        return "YOUTUBE EDUCATIONAL QUALITY REPORT\n\nNo video results to report.";
    }

    return results
        .map((r) => formatEducationalReport(r))
        .join("\n\n------------------------------------------------------------\n\n");
}

module.exports = {
    FRIENDLY_ASPECT_NAMES,
    formatRatingTier,
    formatEducationalReport,
    saveEducationalReport,
    formatMultiVideoReport
};
