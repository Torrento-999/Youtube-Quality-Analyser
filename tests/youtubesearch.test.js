const assert = require("assert");
const axios = require("axios");
const searchYouTube = require("../youtubesearch");

async function runTests() {
    console.log("Running youtubesearch tests...");

    // Test 1: Verify mocked response returns rich objects without global leak
    const originalGet = axios.get;
    let callCount = 0;

    axios.get = async () => {
        callCount++;
        return {
            data: {
                items: [
                    {
                        id: { videoId: `vid_${callCount}_1` },
                        snippet: {
                            title: `Tutorial ${callCount}`,
                            channelTitle: "Code Academy",
                            description: "Learn JS",
                            publishedAt: "2026-01-01T00:00:00Z"
                        }
                    }
                ]
            }
        };
    };

    try {
        const result1 = await searchYouTube("javascript", 5);
        assert.strictEqual(result1.length, 1, "First call should return exactly 1 video");
        assert.strictEqual(result1[0].videoId, "vid_1_1");
        assert.strictEqual(result1[0].title, "Tutorial 1");
        assert.strictEqual(result1[0].channel, "Code Academy");
        assert.strictEqual(result1[0].url, "https://www.youtube.com/watch?v=vid_1_1");

        const result2 = await searchYouTube("javascript", 5);
        assert.strictEqual(result2.length, 1, "Second call must NOT accumulate previous results (no global state leak)");
        assert.strictEqual(result2[0].videoId, "vid_2_1");

        const resultUrlsOnly = await searchYouTube("javascript", 5, { urlsOnly: true });
        assert.strictEqual(resultUrlsOnly.length, 1);
        assert.strictEqual(typeof resultUrlsOnly[0], "string");
        assert.strictEqual(resultUrlsOnly[0], "https://www.youtube.com/watch?v=vid_3_1");

        // Test error handling
        axios.get = async () => {
            const err = new Error("Network error");
            err.response = { data: { error: { message: "Quota exceeded" } } };
            throw err;
        };

        const resultError = await searchYouTube("fail");
        assert.deepStrictEqual(resultError, [], "Should return empty array on API error");

        console.log(" All youtubesearch tests passed successfully!");
    } finally {
        axios.get = originalGet;
    }
}

runTests().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
