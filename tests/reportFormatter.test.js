const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
    formatEducationalReport,
    saveEducationalReport,
    formatMultiVideoReport
} = require("../reportFormatter");

function runTests() {
    console.log("Running reportFormatter tests...");

    const sampleResult = {
        videoId: "sample_vid_1",
        videoURL: "https://www.youtube.com/watch?v=sample_vid_1",
        videoMeta: {
            title: "Learn Node.js Streams in 15 Minutes",
            channel: "DevTutorials"
        },
        overallEducationalQuality: {
            score: 85,
            tier: "Exceptional Educational Quality",
            generalSentiment: "Predominantly Positive"
        },
        evidenceCoverage: {
            confidenceLevel: "MEDIUM",
            confidenceScore: 78,
            aspectCoveragePercent: 38.5
        },
        aspectScores: {
            CLARITY: { score: 99, totalMentions: 12 },
            CONTENT_DEPTH: { score: 76, totalMentions: 6 },
            PACING: { score: null, totalMentions: 1 },
            CONTENT_ACCURACY: { score: null, totalMentions: 1 },
            UPDATEDNESS: { score: null, totalMentions: 0 }
        },
        synthesis: {
            strengths: [
                "Clear and beginner-friendly explanations",
                "Engaging presentation"
            ],
            weaknesses: [
                "Fast pacing in certain sections",
                "Limited depth in some topics"
            ],
            improvementSuggestions: [
                "Slow down complex explanations",
                "Include hands-on projects",
                "Provide timestamps and supplementary notes"
            ]
        }
    };

    // Test 1: formatEducationalReport produces expected output structure
    const output = formatEducationalReport(sampleResult);

    assert.ok(output.includes("YOUTUBE EDUCATIONAL QUALITY REPORT"), "Header present");
    assert.ok(output.includes("Video: Learn Node.js Streams in 15 Minutes"));
    assert.ok(output.includes("URL: https://www.youtube.com/watch?v=sample_vid_1"));
    assert.ok(output.includes("OVERALL SCORE: 85/100 — Exceptional"));
    assert.ok(output.includes("Sentiment: Predominantly Positive"));
    assert.ok(output.includes("Confidence: Medium (78%)"));
    assert.ok(output.includes("Evidence Coverage: 38.5%"));

    // Aspect scores
    assert.ok(output.includes("ASPECT SCORES"));
    assert.ok(output.includes("• Clarity: 99/100 (12 mentions)"));
    assert.ok(output.includes("• Content Depth: 76/100 (6 mentions)"));
    assert.ok(output.includes("• Pacing: Insufficient evidence (1 mention)"));
    assert.ok(output.includes("• Content Accuracy: Insufficient evidence (1 mention)"));

    // Strengths, Weaknesses, Suggestions
    assert.ok(output.includes("KEY STRENGTHS"));
    assert.ok(output.includes("• Clear and beginner-friendly explanations"));
    assert.ok(output.includes("• Engaging presentation"));

    assert.ok(output.includes("KEY WEAKNESSES"));
    assert.ok(output.includes("• Fast pacing in certain sections"));
    assert.ok(output.includes("• Limited depth in some topics"));

    assert.ok(output.includes("SUGGESTIONS"));
    assert.ok(output.includes("• Slow down complex explanations"));
    assert.ok(output.includes("• Include hands-on projects"));
    assert.ok(output.includes("• Provide timestamps and supplementary notes"));

    // Test 2: saveEducationalReport writes a .txt file
    const tempFile = path.resolve(process.cwd(), "test_temp_report.txt");
    const writtenPath = saveEducationalReport(sampleResult, tempFile);
    assert.strictEqual(writtenPath, tempFile);
    assert.ok(fs.existsSync(tempFile), "File must be created on disk");

    const fileContent = fs.readFileSync(tempFile, "utf-8");
    assert.strictEqual(fileContent, output);
    fs.unlinkSync(tempFile); // Cleanup

    // Test 3: formatMultiVideoReport
    const multiOutput = formatMultiVideoReport([sampleResult, sampleResult]);
    assert.ok(multiOutput.includes("------------------------------------------------------------"));

    console.log(" All reportFormatter tests passed successfully!");
}

runTests();
