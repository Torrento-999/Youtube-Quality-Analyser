const assert = require("assert");
const {
    extractVideoId,
    fetchComments,
    analyzeVideo,
    searchAndFetchComments
} = require("../index");
const axios = require("axios");

async function runTests() {
    console.log("Running complete pipeline integration tests...");

    // Test 1: extractVideoId on various YouTube URL formats
    assert.strictEqual(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.strictEqual(extractVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.strictEqual(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.strictEqual(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.strictEqual(extractVideoId("invalid-url"), null);

    // Test 2: fetchComments pagination limit up to 500
    const originalGet = axios.get;
    let pageCount = 0;

    axios.get = async () => {
        pageCount++;
        return {
            data: {
                nextPageToken: pageCount < 6 ? `token_${pageCount}` : null,
                items: Array.from({ length: 100 }, (_, i) => ({
                    snippet: {
                        topLevelComment: {
                            snippet: {
                                authorDisplayName: `User_${pageCount}_${i}`,
                                textDisplay: `Comment ${pageCount} ${i}`,
                                likeCount: i,
                                publishedAt: "2026-01-01T00:00:00Z"
                            }
                        }
                    }
                }))
            }
        };
    };

    try {
        const comments = await fetchComments("test_vid_123", { maxComments: 250 });
        assert.strictEqual(comments.length, 250, "Should cap at maxComments limit");
        assert.strictEqual(comments[0].author, "User_1_0");
    } finally {
        axios.get = originalGet;
    }

    // Test 3: Full analyzeVideo pipeline with mock Groq provider
    const mockComments = [
        {
            author: "DevLearner",
            text: "This explanation of async/await is &quot;top tier&quot;! Best video ever.",
            likes: 120,
            publishedAt: "2026-01-01T00:00:00Z",
            type: "top-level"
        },
        {
            author: "SpamBot",
            text: "Invest with Mr Smith on WhatsApp +1234567890",
            likes: 0,
            publishedAt: "2026-01-01T00:00:00Z",
            type: "top-level"
        },
        {
            author: "AudioCritic",
            text: "The audio has an annoying hum in the background from 02:00 to 05:00.",
            likes: 15,
            publishedAt: "2026-01-01T00:00:00Z",
            type: "reply"
        },
        {
            author: "Coder99",
            text: "The code on line 42 works like a charm. Very clean example.",
            likes: 45,
            publishedAt: "2026-01-01T00:00:00Z",
            type: "top-level"
        }
    ];

    const mockGroqClient = {
        chat: {
            completions: {
                create: async (params) => {
                    const prompt = params.messages[params.messages.length - 1].content;
                    // Stage 1: ABSA Batch Classification
                    if (prompt.includes("Aspect-Based Sentiment Analysis")) {
                        return {
                            choices: [{
                                message: {
                                    content: JSON.stringify({
                                        evaluations: [
                                            {
                                                commentId: "c_1",
                                                relevance: "RELEVANT",
                                                sentiment: "POSITIVE",
                                                aspects: [
                                                    { category: "CLARITY", opinion: "PRAISE", confidence: 0.95, evidence: "explanation of async/await is top tier" }
                                                ],
                                                praisedPoints: ["top tier async/await explanation"],
                                                criticizedPoints: []
                                            },
                                            {
                                                commentId: "c_2",
                                                relevance: "RELEVANT",
                                                sentiment: "NEGATIVE",
                                                aspects: [
                                                    { category: "AUDIO_VIDEO", opinion: "CRITICISM", confidence: 0.88, evidence: "annoying hum in background" }
                                                ],
                                                praisedPoints: [],
                                                criticizedPoints: ["background audio hum"]
                                            },
                                            {
                                                commentId: "c_3",
                                                relevance: "RELEVANT",
                                                sentiment: "POSITIVE",
                                                aspects: [
                                                    { category: "CONTENT_ACCURACY", opinion: "PRAISE", confidence: 0.92, evidence: "code on line 42 works like a charm" },
                                                    { category: "PRACTICAL_EXAMPLES", opinion: "PRAISE", confidence: 0.90, evidence: "very clean example" }
                                                ],
                                                praisedPoints: ["clean working code example"],
                                                criticizedPoints: []
                                            }
                                        ]
                                    })
                                }
                            }],
                            usage: { total_tokens: 380 }
                        };
                    }

                    // Stage 3: Final Synthesis
                    if (prompt.includes("pedagogical advisor")) {
                        return {
                            choices: [{
                                message: {
                                    content: JSON.stringify({
                                        overallAudiencePerception: "Highly effective async/await tutorial.",
                                        evidenceBasedSummary: "Learners appreciated clarity and practical accuracy.",
                                        strengths: ["Clear analogies", "Working code"],
                                        weaknesses: ["Audio humming"],
                                        improvementSuggestions: ["Clean audio track"],
                                        learnerSuitability: {
                                            recommendedLevel: "Beginner",
                                            idealAudience: "New JS programmers",
                                            prerequisites: ["Basic syntax"]
                                        }
                                    })
                                }
                            }],
                            usage: { total_tokens: 250 }
                        };
                    }

                    throw new Error("Unexpected prompt in test mock");
                }
            }
        }
    };

    const videoInput = {
        videoId: "vid_test_1",
        title: "Async Await in 10 Minutes",
        channel: "TechTutors",
        url: "https://www.youtube.com/watch?v=vid_test_1"
    };

    const result = await analyzeVideo(videoInput, {
        mockComments: mockComments,
        primaryLLM: "groq",
        groqClient: mockGroqClient,
        batchSize: 10,
        enableSynthesis: true
    });

    assert.ok(result, "Result should not be null");
    assert.strictEqual(result.videoId, "vid_test_1");
    assert.strictEqual(result.pipelineCounts.totalFetched, 4);
    assert.strictEqual(result.pipelineCounts.validPreprocessed, 3, "Spam comment must be filtered out");
    assert.strictEqual(result.pipelineCounts.successfullyAnalyzed, 3);

    // Check scoring
    assert.ok(result.overallEducationalQuality.score > 0, "Score should be calculated");
    assert.strictEqual(result.aspectScores.CLARITY.score, 100);
    assert.strictEqual(result.aspectScores.CONTENT_ACCURACY.score, 100);
    assert.strictEqual(result.aspectScores.AUDIO_VIDEO.score, 0);

    // Check synthesis
    assert.ok(result.synthesis);
    assert.strictEqual(result.synthesis.learnerSuitability.recommendedLevel, "Beginner");

    // Check .txt report output
    const fs = require("fs");
    assert.ok(result.reportFilePath, "reportFilePath should be set");
    assert.ok(fs.existsSync(result.reportFilePath), "Report .txt file must exist on disk");
    const txtContent = fs.readFileSync(result.reportFilePath, "utf-8");
    assert.ok(txtContent.startsWith("YOUTUBE EDUCATIONAL QUALITY REPORT"), "Report must start with header");
    assert.ok(txtContent.includes("OVERALL SCORE:"), "Report must include overall score");
    assert.ok(txtContent.includes("ASPECT SCORES"), "Report must include aspect scores");
    fs.unlinkSync(result.reportFilePath); // clean up test file

    console.log(" All pipeline integration tests passed successfully!");
}

runTests().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
