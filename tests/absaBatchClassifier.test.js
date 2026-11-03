const assert = require("assert");
const {
    buildBatchPrompt,
    classifyCommentBatch,
    classifyAllBatches
} = require("../absaBatchClassifier");

async function runTests() {
    console.log("Running absaBatchClassifier tests...");

    // Test 1: buildBatchPrompt formatting
    const sampleBatch = [
        { id: "c_1", likes: 45, text: "Great video on promises, super clear!" },
        { id: "c_2", likes: 2, text: "Audio too low at 03:00" }
    ];
    const prompt = buildBatchPrompt(sampleBatch, { title: "Async JS Tutorial", channel: "DevGuru" });

    assert.ok(prompt.includes("Async JS Tutorial"), "Prompt should include video title");
    assert.ok(prompt.includes("[ID: c_1 | Likes: 45]"), "Prompt should include comment ID and likes");
    assert.ok(prompt.includes("CLARITY"), "Prompt should instruct on educational aspects");

    // Test 2: classifyCommentBatch with mock client
    const mockEvaluations = [
        {
            commentId: "c_1",
            relevance: "RELEVANT",
            sentiment: "POSITIVE",
            aspects: [
                { category: "CLARITY", opinion: "PRAISE", confidence: 0.95, evidence: "super clear" }
            ],
            praisedPoints: ["clear explanation"],
            criticizedPoints: []
        },
        {
            commentId: "c_2",
            relevance: "RELEVANT",
            sentiment: "NEGATIVE",
            aspects: [
                { category: "AUDIO_VIDEO", opinion: "CRITICISM", confidence: 0.85, evidence: "audio too low" }
            ],
            praisedPoints: [],
            criticizedPoints: ["low audio"]
        }
    ];

    const mockGroqClient = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{ message: { content: JSON.stringify({ evaluations: mockEvaluations }) } }],
                    usage: { total_tokens: 300 }
                })
            }
        }
    };

    const classified = await classifyCommentBatch(sampleBatch, {}, {
        primaryLLM: "groq",
        groqClient: mockGroqClient
    });

    assert.strictEqual(classified.evaluations.length, 2);
    assert.strictEqual(classified.evaluations[0].commentId, "c_1");
    assert.strictEqual(classified.evaluations[0].aspects[0].category, "CLARITY");
    assert.strictEqual(classified.evaluations[1].aspects[0].category, "AUDIO_VIDEO");
    assert.strictEqual(classified.provider, "groq");

    // Test 3: classifyAllBatches
    const batches = [
        [{ id: "c_1", likes: 10, text: "test 1" }],
        [{ id: "c_2", likes: 5, text: "test 2" }]
    ];
    const all = await classifyAllBatches(batches, "test_vid_abc", {}, {
        primaryLLM: "groq",
        groqClient: mockGroqClient,
        concurrency: 2
    });
    assert.strictEqual(all.length, 4, "Should merge evaluations from all batches");

    console.log(" All absaBatchClassifier tests passed successfully!");
}

runTests().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
