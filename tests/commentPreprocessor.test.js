const assert = require("assert");
const {
    decodeHtmlEntities,
    isSpamOrNoise,
    preprocessComments,
    chunkCommentsIntoBatches
} = require("../commentPreprocessor");

function runTests() {
    console.log("Running commentPreprocessor tests...");

    // Test 1: decodeHtmlEntities
    const rawHtml = "This is a &quot;great&quot; video &amp; tutorial!<br>Loved it &#39;100%&#39;";
    const decoded = decodeHtmlEntities(rawHtml);
    assert.strictEqual(decoded, 'This is a "great" video & tutorial! Loved it \'100%\'');

    // Test 2: isSpamOrNoise
    assert.strictEqual(isSpamOrNoise(""), true, "Empty string should be spam/noise");
    assert.strictEqual(isSpamOrNoise("a"), true, "1 char should be noise");
    assert.strictEqual(isSpamOrNoise("WhatsApp me at +12345"), true, "WhatsApp spam detected");
    assert.strictEqual(isSpamOrNoise("Check out my channel for free robux"), true, "Promo spam detected");
    assert.strictEqual(isSpamOrNoise("Great explanation of closures, loved it!"), false, "Legit comment should pass");
    assert.strictEqual(isSpamOrNoise("Code at 4:20 is broken"), false, "Timestamp critique should pass");

    // Test 3: preprocessComments
    const rawComments = [
        { author: "Alice", text: "Great &amp; clear tutorial!", likes: 10, type: "top-level" },
        { author: "Bot", text: "invest with mr smith whatsapp +1234", likes: 0, type: "top-level" },
        { author: "Bob", text: "Audio at 05:10 has a terrible buzz.", likes: 0, type: "reply" },
        { author: "Charlie", text: "a".repeat(1000), likes: 5, type: "top-level" }
    ];

    const processed = preprocessComments(rawComments, { maxTextLength: 200 });
    assert.strictEqual(processed.length, 3, "Spam bot should be filtered out");
    assert.strictEqual(processed[0].id, "c_1");
    assert.strictEqual(processed[0].text, "Great & clear tutorial!");
    assert.strictEqual(processed[0].likes, 10);
    assert.ok(processed[0].engagementWeight > 1, "Likes should produce engagement weight > 1");
    assert.strictEqual(processed[1].id, "c_2");
    assert.strictEqual(processed[2].id, "c_3");
    assert.ok(processed[2].text.endsWith("..."), "Text over 200 chars should be truncated");
    assert.strictEqual(processed[2].text.length, 203);

    // Test 4: chunkCommentsIntoBatches
    const dummyList = Array.from({ length: 75 }, (_, i) => ({ id: `c_${i}` }));
    const batches = chunkCommentsIntoBatches(dummyList, 25);
    assert.strictEqual(batches.length, 3, "75 items chunked by 25 should yield 3 batches");
    assert.strictEqual(batches[0].length, 25);
    assert.strictEqual(batches[1].length, 25);
    assert.strictEqual(batches[2].length, 25);

    const oddBatches = chunkCommentsIntoBatches(dummyList, 30);
    assert.strictEqual(oddBatches.length, 3);
    assert.strictEqual(oddBatches[0].length, 30);
    assert.strictEqual(oddBatches[1].length, 30);
    assert.strictEqual(oddBatches[2].length, 15);

    console.log(" All commentPreprocessor tests passed successfully!");
}

runTests();
