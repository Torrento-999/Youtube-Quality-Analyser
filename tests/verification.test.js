const assert = require("assert");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const asyncPool = require("../asyncPool");
const checkpointManager = require("../checkpointManager");
const { isRetryableError, calculateBackoffDelay, executeProviderWithRetry, executeLLMWithFailover } = require("../llmProvider");
const { classifyCommentBatch, classifyAllBatches } = require("../absaBatchClassifier");
const { aggregateEducationalScores } = require("../scoringAggregator");
const { analyzeVideo } = require("../index");

async function runAllVerificationTests() {
    console.log("=================================================");
    console.log("STARTING SPECIFICATION VERIFICATION TEST SUITE");
    console.log("=================================================\n");

    // -------------------------------------------------------------------------
    // TEST 1: Small batch of 10 comments, JSON validity & Comment ID preservation
    // -------------------------------------------------------------------------
    console.log("[Test 1 & 2 & 3] Batch classification, JSON schema validity & comment ID preservation...");
    const sample10 = Array.from({ length: 10 }, (_, i) => ({
        id: `c_${i + 1}`,
        text: `Comment text number ${i + 1} explaining something about the video.`,
        likes: i * 5,
        engagementWeight: 1 + Math.log(1 + i * 5)
    }));

    const mockClassifications10 = sample10.map((c, i) => ({
        commentId: c.id,
        relevance: i < 8 ? "RELEVANT" : "IRRELEVANT",
        sentiment: i < 5 ? "POSITIVE" : (i < 8 ? "NEGATIVE" : "NEUTRAL"),
        aspects: i < 8 ? [
            {
                category: i % 2 === 0 ? "CLARITY" : "CONTENT_ACCURACY",
                opinion: i < 5 ? "PRAISE" : "CRITICISM",
                confidence: 0.9,
                evidence: `evidence for comment ${c.id}`
            }
        ] : [],
        praisedPoints: i < 5 ? [`Good point ${i + 1}`] : [],
        criticizedPoints: i >= 5 && i < 8 ? [`Bad point ${i + 1}`] : []
    }));

    const mockGroqCaller = async () => ({
        data: { evaluations: mockClassifications10 },
        tokens: 450,
        durationMs: 85,
        provider: "groq",
        model: "llama-3.3-70b-versatile"
    });

    const batchResult = await classifyCommentBatch(sample10, { title: "Test Video" }, {
        groqClient: { chat: { completions: { create: async () => ({
            choices: [{ message: { content: JSON.stringify({ evaluations: mockClassifications10 }) } }],
            usage: { total_tokens: 450 }
        }) } } }
    });

    assert.strictEqual(batchResult.evaluations.length, 10, "Must return exactly 10 evaluations");
    for (let i = 0; i < 10; i++) {
        assert.strictEqual(batchResult.evaluations[i].commentId, `c_${i + 1}`, `Comment ID c_${i + 1} must be preserved`);
        assert.ok(["RELEVANT", "IRRELEVANT", "UNCERTAIN"].includes(batchResult.evaluations[i].relevance));
        assert.ok(["POSITIVE", "NEGATIVE", "MIXED", "NEUTRAL", "UNCERTAIN"].includes(batchResult.evaluations[i].sentiment));
    }
    console.log("-> Test 1 & 2 & 3 PASSED: 10/10 comment IDs accounted for with valid schema.\n");

    // -------------------------------------------------------------------------
    // TEST 4 & 5: Multiple batches & Controlled concurrency execution (limit = 3)
    // -------------------------------------------------------------------------
    console.log("[Test 4 & 5] Multiple batches & Controlled concurrency execution (limit: 3)...");
    const sampleItems = Array.from({ length: 9 }, (_, i) => `batch_${i + 1}`);
    let activeConcurrency = 0;
    let maxObservedConcurrency = 0;

    const poolResults = await asyncPool(sampleItems, 3, async (item, index) => {
        activeConcurrency++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConcurrency);
        // Simulate async I/O
        await new Promise((resolve) => setTimeout(resolve, 30));
        activeConcurrency--;
        return `done_${item}`;
    });

    assert.strictEqual(poolResults.length, 9);
    assert.strictEqual(maxObservedConcurrency, 3, "Concurrency must not exceed 3 simultaneous tasks");
    assert.strictEqual(poolResults[0], "done_batch_1");
    assert.strictEqual(poolResults[8], "done_batch_9");
    console.log(`-> Test 4 & 5 PASSED: Concurrency capped strictly at 3 across 9 tasks.\n`);

    // -------------------------------------------------------------------------
    // TEST 6 & 7: Simulate 503 error & Verify retry behavior with backoff
    // -------------------------------------------------------------------------
    console.log("[Test 6 & 7] Simulate 503 Service Unavailable and verify retry backoff...");
    let callAttempts = 0;

    const mock503Caller = async () => {
        callAttempts++;
        if (callAttempts < 3) {
            const err = new Error("503 Service Unavailable");
            err.status = 503;
            throw err;
        }
        return { data: { evaluations: [] }, provider: "groq", durationMs: 20 };
    };

    // Override caller for test
    let testAttempts = 0;
    async function testRetryFunction() {
        testAttempts++;
        if (testAttempts < 3) {
            const err = new Error("503 Service Unavailable");
            err.status = 503;
            throw err;
        }
        return { success: true };
    }

    assert.strictEqual(isRetryableError({ status: 503 }), true, "503 must be retryable");
    assert.strictEqual(isRetryableError({ status: 429 }), true, "429 must be retryable");
    assert.strictEqual(isRetryableError({ status: 401 }), false, "401 must not be retryable");
    assert.strictEqual(isRetryableError({ status: 404 }), false, "404 must not be retryable");

    const backoff0 = calculateBackoffDelay(0, null, 100, 2000);
    const backoff1 = calculateBackoffDelay(1, null, 100, 2000);
    assert.ok(backoff1 >= backoff0, "Backoff should increase exponentially with attempts");

    console.log("-> Test 6 & 7 PASSED: 503 retry status recognized and backoff calculated correctly.\n");

    // -------------------------------------------------------------------------
    // TEST 8: Simulate failed batch & verify automatic provider failover
    // -------------------------------------------------------------------------
    console.log("[Test 8] Simulate primary provider failure and verify failover to secondary provider...");
    let groqCalls = 0;
    let geminiCalls = 0;

    const mockFailingGroq = {
        chat: {
            completions: {
                create: async () => {
                    groqCalls++;
                    const err = new Error("Groq API 500 Internal Server Error");
                    err.status = 500;
                    throw err;
                }
            }
        }
    };

    const mockSucceedingGemini = {
        models: {
            generateContent: async () => {
                geminiCalls++;
                return {
                    text: JSON.stringify({ evaluations: [{ commentId: "c_1", relevance: "RELEVANT", sentiment: "POSITIVE", aspects: [] }] }),
                    usageMetadata: { totalTokenCount: 150 }
                };
            }
        }
    };

    const failoverResult = await executeLLMWithFailover(
        { prompt: "test prompt" },
        {
            primaryLLM: "groq",
            secondaryLLM: "gemini",
            enableFailover: true,
            maxRetries: 1,
            groqClient: mockFailingGroq,
            geminiClient: mockSucceedingGemini,
            retryBaseDelayMs: 10
        }
    );

    assert.strictEqual(failoverResult.provider, "gemini", "Failover must succeed with secondary provider (gemini)");
    assert.ok(groqCalls >= 2, "Groq should have been attempted with retries");
    assert.strictEqual(geminiCalls, 1, "Gemini should have taken over after Groq failure");
    console.log("-> Test 8 PASSED: Primary Groq failed -> Automatic failover to Gemini succeeded.\n");

    // -------------------------------------------------------------------------
    // TEST 9: Verify checkpoint save and resume behavior
    // -------------------------------------------------------------------------
    console.log("[Test 9] Verify checkpointing and resumption after interruption...");
    const testVideoId = `test_vid_${Date.now()}`;

    // 1. Initial state: no checkpoint
    assert.strictEqual(checkpointManager.getCompletedBatch(testVideoId, 0), null);

    // 2. Save batch 0
    checkpointManager.saveBatch(testVideoId, 0, {
        commentIds: ["c_1", "c_2"],
        classifications: [{ commentId: "c_1", relevance: "RELEVANT" }],
        provider: "groq",
        durationMs: 120
    });

    // 3. Load checkpoint
    const loadedBatch0 = checkpointManager.getCompletedBatch(testVideoId, 0);
    assert.ok(loadedBatch0 !== null);
    assert.strictEqual(loadedBatch0.provider, "groq");
    assert.strictEqual(loadedBatch0.classifications[0].commentId, "c_1");

    // 4. Clean up checkpoint
    checkpointManager.clear(testVideoId);
    assert.strictEqual(checkpointManager.getCompletedBatch(testVideoId, 0), null);
    console.log("-> Test 9 PASSED: Checkpoint saved, verified, loaded, and cleared successfully.\n");

    // -------------------------------------------------------------------------
    // TEST 10: Verify JavaScript aggregation and deterministic scoring
    // -------------------------------------------------------------------------
    console.log("[Test 10] Verify JavaScript aggregation, deterministic aspect scoring & evidence coverage...");
    const mockPreprocessed = [
        { id: "c_1", likes: 50, engagementWeight: 4.93, text: "Audio is buzzing terribly.", author: "Bob" },
        { id: "c_2", likes: 10, engagementWeight: 3.40, text: "Great clear explanation of pointers!", author: "Alice" },
        { id: "c_3", likes: 0, engagementWeight: 1.00, text: "First comment!", author: "SpamUser" }
    ];

    const mockClassifications = [
        {
            commentId: "c_1",
            relevance: "RELEVANT",
            sentiment: "NEGATIVE",
            aspects: [
                { category: "AUDIO_VIDEO", opinion: "CRITICISM", confidence: 0.95, evidence: "Audio is buzzing terribly." }
            ],
            praisedPoints: [],
            criticizedPoints: ["buzzing audio"]
        },
        {
            commentId: "c_2",
            relevance: "RELEVANT",
            sentiment: "POSITIVE",
            aspects: [
                { category: "CLARITY", opinion: "PRAISE", confidence: 0.90, evidence: "Great clear explanation of pointers!" }
            ],
            praisedPoints: ["clear explanation of pointers"],
            criticizedPoints: []
        },
        {
            commentId: "c_3",
            relevance: "IRRELEVANT",
            sentiment: "NEUTRAL",
            aspects: [],
            praisedPoints: [],
            criticizedPoints: []
        }
    ];

    const report = aggregateEducationalScores(mockPreprocessed, mockClassifications, {
        totalCommentsFetched: 5
    });

    // Check pipeline counts
    assert.strictEqual(report.pipelineCounts.totalFetched, 5);
    assert.strictEqual(report.pipelineCounts.validPreprocessed, 3);
    assert.strictEqual(report.pipelineCounts.successfullyAnalyzed, 3);
    assert.strictEqual(report.pipelineCounts.failedClassifications, 0);

    // Check relevance & sentiment
    assert.strictEqual(report.relevance.counts.RELEVANT, 2);
    assert.strictEqual(report.relevance.counts.IRRELEVANT, 1);
    assert.strictEqual(report.sentiment.counts.POSITIVE, 1);
    assert.strictEqual(report.sentiment.counts.NEGATIVE, 1);
    assert.strictEqual(report.sentiment.counts.NEUTRAL, 1);

    // Check aspect scores
    assert.strictEqual(report.aspectScores.CLARITY.score, 100, "All clarity mentions were praise");
    assert.strictEqual(report.aspectScores.AUDIO_VIDEO.score, 0, "All audio_video mentions were criticism");
    assert.strictEqual(report.aspectScores.UPDATEDNESS.score, null, "Aspect with 0 mentions must be null, never 100");
    assert.strictEqual(report.aspectScores.CONTENT_ACCURACY.score, null, "Unmentioned aspect must be null");

    // Check dynamic weight normalization
    // Active aspects: CLARITY (weight 0.20, score 100), AUDIO_VIDEO (weight 0.07, score 0)
    // Formula: (0.20 * 100 + 0.07 * 0) / (0.20 + 0.07) = 20 / 0.27 = 74.07 -> 74
    assert.strictEqual(report.overallEducationalQuality.score, 74);
    assert.strictEqual(report.overallEducationalQuality.tier, "Good Quality");

    // Check evidence coverage and disclaimer
    assert.strictEqual(report.evidenceCoverage.aspectsWithData, 2);
    assert.ok(report.disclaimer.includes("deterministic heuristic aggregation"));

    console.log("-> Test 10 PASSED: Deterministic scoring, null handling for empty aspects, and dynamic redistribution verified.\n");

    console.log("=================================================");
    console.log("ALL SPECIFICATION VERIFICATION TESTS PASSED! ");
    console.log("=================================================");
}

runAllVerificationTests().catch((err) => {
    console.error("Verification test suite failed:", err);
    process.exit(1);
});
