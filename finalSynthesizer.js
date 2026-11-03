const config = require("./config");
const { executeLLMWithFailover } = require("./llmProvider");

const FINAL_SYNTHESIS_SCHEMA = {
    type: "OBJECT",
    properties: {
        overallAudiencePerception: {
            type: "STRING",
            description: "High-level summary of viewer reception regarding teaching quality and clarity."
        },
        evidenceBasedSummary: {
            type: "STRING",
            description: "Detailed summary grounded strictly in the provided viewer evidence."
        },
        strengths: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Top educational strengths supported by viewer feedback."
        },
        weaknesses: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Identified educational weaknesses or issues."
        },
        improvementSuggestions: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Prioritized recommendations for the creator to improve the video."
        },
        learnerSuitability: {
            type: "OBJECT",
            properties: {
                recommendedLevel: {
                    type: "STRING",
                    enum: ["Beginner", "Intermediate", "Advanced", "All Levels", "Not Recommended"]
                },
                idealAudience: { type: "STRING" },
                prerequisites: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["recommendedLevel", "idealAudience"]
        }
    },
    required: [
        "overallAudiencePerception",
        "evidenceBasedSummary",
        "strengths",
        "weaknesses",
        "improvementSuggestions",
        "learnerSuitability"
    ]
};

function buildSynthesisPrompt(aggregatedReport, videoMeta = {}) {
    const title = videoMeta.title || "Untitled Video";
    const channel = videoMeta.channel || "Unknown Channel";

    const aspectSummary = Object.entries(aggregatedReport.aspectScores || {})
        .filter(([_, data]) => data.score !== null)
        .map(([_, data]) => `- ${data.label}: ${data.score}/100 (${data.totalMentions} mentions | ${data.praiseCount} praise, ${data.criticismCount} criticism)`)
        .join("\n") || "No specific aspect data recorded";

    const topPraises = (aggregatedReport.topPraisedAspects || [])
        .map((p) => `- "${p.point}" (Up to ${p.maxLikes} likes)`)
        .join("\n") || "None recorded";

    const topCriticisms = (aggregatedReport.topCriticisms || [])
        .map((c) => `- "${c.point}" (Up to ${c.maxLikes} likes)`)
        .join("\n") || "None recorded";

    return `
You are an expert educational reviewer and pedagogical advisor.
Review the following deterministic analytics aggregated from student viewer comments for a YouTube educational video.

VIDEO METADATA:
- Title: ${title}
- Channel: ${channel}

DETERMINISTIC QUALITY METRICS:
- Overall Score: ${aggregatedReport.overallEducationalQuality?.score}/100 (${aggregatedReport.overallEducationalQuality?.tier})
- Evidence Coverage: ${aggregatedReport.evidenceCoverage?.confidenceLevel} (${aggregatedReport.evidenceCoverage?.explanation})
- Total Comments Evaluated: ${aggregatedReport.pipelineCounts?.successfullyAnalyzed} (${aggregatedReport.relevance?.counts?.RELEVANT} relevant feedback comments)

ASPECT PERFORMANCE SCORES:
${aspectSummary}

TOP PRAISED POINTS FROM VIEWERS:
${topPraises}

TOP CRITICISMS & REPORTED BUGS:
${topCriticisms}

TASK:
Provide an objective, evidence-based qualitative synthesis.
Format your response as a valid JSON object matching:
{
  "overallAudiencePerception": "string",
  "evidenceBasedSummary": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "improvementSuggestions": ["string"],
  "learnerSuitability": {
    "recommendedLevel": "Beginner / Intermediate / Advanced / All Levels / Not Recommended",
    "idealAudience": "string",
    "prerequisites": ["string"]
  }
}
`.trim();
}

/**
 * Generates an executive pedagogical synthesis from deterministic report data.
 */
async function synthesizeQualityReport(aggregatedReport, videoMeta = {}, options = {}) {
    const shouldSkip = options.skipSynthesis ?? (!config.enableSynthesis);
    if (shouldSkip) {
        return null;
    }

    if (!aggregatedReport || (aggregatedReport.relevance?.counts?.RELEVANT || 0) === 0) {
        return {
            overallAudiencePerception: "Insufficient relevant viewer feedback to generate a qualitative synthesis.",
            evidenceBasedSummary: "No relevant comments evaluating video quality were found.",
            strengths: [],
            weaknesses: [],
            improvementSuggestions: ["Gather more viewer feedback to analyze pedagogical quality."],
            learnerSuitability: {
                recommendedLevel: "Not Recommended",
                idealAudience: "N/A",
                prerequisites: []
            }
        };
    }

    const prompt = buildSynthesisPrompt(aggregatedReport, videoMeta);
    const payload = {
        prompt,
        geminiSchema: FINAL_SYNTHESIS_SCHEMA,
        systemInstruction: "You are a pedagogical video quality reviewer. Output valid JSON only."
    };

    const response = await executeLLMWithFailover(payload, options);
    return response.data;
}

module.exports = {
    FINAL_SYNTHESIS_SCHEMA,
    buildSynthesisPrompt,
    synthesizeQualityReport
};
