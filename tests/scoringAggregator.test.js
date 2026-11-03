const assert = require("assert");
const { aggregateEducationalScores } = require("../scoringAggregator");

function runTests() {
    console.log("Running scoringAggregator tests...");

    // Test 1: Empty report
    const emptyReport = aggregateEducationalScores([], []);
    assert.strictEqual(emptyReport.evidenceCoverage.confidenceLevel, "INSUFFICIENT_DATA");
    assert.strictEqual(emptyReport.overallEducationalQuality.score, null);

    // Test 2: Standard aggregation with weighted scoring
    const mockComments = [
        { id: "c_1", likes: 100, engagementWeight: 5.61, author: "DevPro" },
        { id: "c_2", likes: 0, engagementWeight: 1.0, author: "Beginner" },
        { id: "c_3", likes: 5, engagementWeight: 2.79, author: "Tester" },
        { id: "c_4", likes: 0, engagementWeight: 1.0, author: "Spammer" }
    ];

    const mockClassifications = [
        {
            commentId: "c_1",
            relevance: "RELEVANT",
            sentiment: "POSITIVE",
            aspects: [
                { category: "CLARITY", opinion: "PRAISE", confidence: 0.95, evidence: "Best explanation ever" },
                { category: "CONTENT_ACCURACY", opinion: "PRAISE", confidence: 0.90, evidence: "Code is 100% bug free" }
            ],
            praisedPoints: ["crystal clear explanation", "working modern code"],
            criticizedPoints: []
        },
        {
            commentId: "c_2",
            relevance: "RELEVANT",
            sentiment: "NEGATIVE",
            aspects: [
                { category: "AUDIO_VIDEO", opinion: "CRITICISM", confidence: 0.85, evidence: "Audio is faint" }
            ],
            praisedPoints: [],
            criticizedPoints: ["faint audio"]
        },
        {
            commentId: "c_3",
            relevance: "RELEVANT",
            sentiment: "MIXED",
            aspects: [
                { category: "CLARITY", opinion: "PRAISE", confidence: 0.80, evidence: "Clear concepts" },
                { category: "CONTENT_DEPTH", opinion: "CRITICISM", confidence: 0.85, evidence: "Rushed the advanced chapter" }
            ],
            praisedPoints: ["good introductory concepts"],
            criticizedPoints: ["rushed advanced chapter"]
        },
        {
            commentId: "c_4",
            relevance: "IRRELEVANT",
            sentiment: "NEUTRAL",
            aspects: [],
            praisedPoints: [],
            criticizedPoints: []
        }
    ];

    const report = aggregateEducationalScores(mockComments, mockClassifications, {
        totalCommentsFetched: 4
    });

    // Verify sample size & pipeline counts
    assert.strictEqual(report.pipelineCounts.totalFetched, 4);
    assert.strictEqual(report.pipelineCounts.validPreprocessed, 4);
    assert.strictEqual(report.pipelineCounts.successfullyAnalyzed, 4);
    assert.strictEqual(report.pipelineCounts.failedClassifications, 0);

    // Verify relevance & sentiment distribution sums to 100%
    const dist = report.sentiment.distribution;
    const sum = dist.POSITIVE + dist.NEGATIVE + dist.NEUTRAL + dist.MIXED + dist.UNCERTAIN;
    assert.strictEqual(Math.round(sum), 100, "Sentiment distribution percentages must sum to 100%");
    assert.strictEqual(dist.POSITIVE, 25.0);
    assert.strictEqual(dist.NEGATIVE, 25.0);
    assert.strictEqual(dist.MIXED, 25.0);
    assert.strictEqual(dist.NEUTRAL, 25.0);

    // Verify aspect scoring
    assert.strictEqual(report.aspectScores.CLARITY.score, 100, "All clarity mentions were praise");
    assert.strictEqual(report.aspectScores.CONTENT_ACCURACY.score, 100);
    assert.strictEqual(report.aspectScores.AUDIO_VIDEO.score, 0, "Only production mention was criticism");
    assert.strictEqual(report.aspectScores.CONTENT_DEPTH.score, 0);
    assert.strictEqual(report.aspectScores.UPDATEDNESS.score, null, "Unmentioned aspect must be null");

    // Dynamic redistribution
    assert.ok(report.overallEducationalQuality.score > 0);
    assert.strictEqual(report.overallEducationalQuality.tier, "Good Quality");

    // Top praised points
    assert.ok(report.topPraisedAspects.length > 0);
    assert.strictEqual(report.topPraisedAspects[0].point, "crystal clear explanation");
    assert.strictEqual(report.topPraisedAspects[0].maxLikes, 100);

    console.log(" All scoringAggregator tests passed successfully!");
}

runTests();
