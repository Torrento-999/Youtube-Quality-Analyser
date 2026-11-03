const assert = require("assert");
const { buildSynthesisPrompt, synthesizeQualityReport } = require("../finalSynthesizer");

async function runTests() {
    console.log("Running finalSynthesizer tests...");

    const mockAggregatedReport = {
        pipelineCounts: { successfullyAnalyzed: 50 },
        relevance: { counts: { RELEVANT: 40 } },
        evidenceCoverage: { confidenceLevel: "HIGH", explanation: "Strong sample" },
        overallEducationalQuality: { score: 85, tier: "Exceptional Educational Quality" },
        aspectScores: {
            CLARITY: { label: "Explanation Clarity", score: 92, totalMentions: 25, praiseCount: 23, criticismCount: 2 },
            CONTENT_ACCURACY: { label: "Technical Accuracy", score: 88, totalMentions: 15, praiseCount: 14, criticismCount: 1 }
        },
        topPraisedAspects: [{ point: "Crystal clear analogies", maxLikes: 250 }],
        topCriticisms: [{ point: "Code font size is too small", maxLikes: 40 }]
    };

    const mockMeta = {
        title: "Mastering Node.js Streams",
        channel: "NodeMasters"
    };

    // Test 1: buildSynthesisPrompt contains expected key elements
    const prompt = buildSynthesisPrompt(mockAggregatedReport, mockMeta);
    assert.ok(prompt.includes("Mastering Node.js Streams"), "Should include video title");
    assert.ok(prompt.includes("Overall Score: 85/100"), "Should include deterministic score");
    assert.ok(prompt.includes("Crystal clear analogies"), "Should include top praises");
    assert.ok(prompt.includes("Code font size is too small"), "Should include criticisms");

    // Test 2: skipSynthesis option
    const skipped = await synthesizeQualityReport(mockAggregatedReport, mockMeta, { skipSynthesis: true });
    assert.strictEqual(skipped, null, "Should return null when skipSynthesis is true");

    // Test 3: Insufficient data handling
    const insufficient = await synthesizeQualityReport({ relevance: { counts: { RELEVANT: 0 } } }, mockMeta);
    assert.strictEqual(insufficient.learnerSuitability.recommendedLevel, "Not Recommended");
    assert.ok(insufficient.overallAudiencePerception.includes("Insufficient"));

    // Test 4: Successful synthesis with mock Groq provider
    const mockOutput = {
        overallAudiencePerception: "Highly recommended resource for understanding stream backpressure.",
        evidenceBasedSummary: "Viewers consistently praised clarity while noting slight font readability issues.",
        strengths: ["Clear analogies of piping mechanisms"],
        weaknesses: ["Small font size on code snippets"],
        improvementSuggestions: ["Increase terminal font size"],
        learnerSuitability: {
            recommendedLevel: "Intermediate",
            idealAudience: "Backend developers with JS basics",
            prerequisites: ["Basic Async JS"]
        }
    };

    const mockGroqClient = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{ message: { content: JSON.stringify(mockOutput) } }],
                    usage: { total_tokens: 350 }
                })
            }
        }
    };

    const result = await synthesizeQualityReport(mockAggregatedReport, mockMeta, {
        primaryLLM: "groq",
        groqClient: mockGroqClient
    });

    assert.strictEqual(result.learnerSuitability.recommendedLevel, "Intermediate");
    assert.strictEqual(result.strengths[0], "Clear analogies of piping mechanisms");

    console.log(" All finalSynthesizer tests passed successfully!");
}

runTests().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
