require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const config = require("./config.js");
const searchYouTube = require("./youtubesearch.js");
const { preprocessComments, chunkCommentsIntoBatches } = require("./commentPreprocessor.js");
const { classifyAllBatches } = require("./absaBatchClassifier.js");
const { aggregateEducationalScores } = require("./scoringAggregator.js");
const { synthesizeQualityReport } = require("./finalSynthesizer.js");
const { saveEducationalReport, formatMultiVideoReport } = require("./reportFormatter.js");

const API_KEY = config.youtubeApiKey || process.env.YOUTUBE_API_KEY;

/**
 * Extract YouTube video ID from various URL formats.
 */
function extractVideoId(url) {
    if (!url || typeof url !== "string") return null;

    const regex =
        /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&?/]+)/;

    const match = url.match(regex);

    return match ? match[1] : null;
}

/**
 * Fetch comments from YouTube with pagination up to maxComments (default: 500).
 */
async function fetchComments(videoId, options = {}) {
    const maxComments = options.maxComments || config.maxComments;
    let comments = [];
    let nextPageToken = null;

    try {
        do {
            const response = await axios.get(
                "https://www.googleapis.com/youtube/v3/commentThreads",
                {
                    params: {
                        part: "snippet,replies",
                        videoId: videoId,
                        maxResults: 100,
                        pageToken: nextPageToken,
                        textFormat: "plainText",
                        key: API_KEY
                    }
                }
            );

            const items = response.data.items || [];

            for (const item of items) {
                const topComment = item.snippet?.topLevelComment?.snippet;
                if (topComment) {
                    comments.push({
                        author: topComment.authorDisplayName || "Anonymous",
                        text: topComment.textDisplay || "",
                        likes: topComment.likeCount || 0,
                        publishedAt: topComment.publishedAt || null,
                        type: "top-level"
                    });
                }

                if (item.replies && item.replies.comments) {
                    for (const reply of item.replies.comments) {
                        comments.push({
                            author: reply.snippet?.authorDisplayName || "Anonymous",
                            text: reply.snippet?.textDisplay || "",
                            likes: reply.snippet?.likeCount || 0,
                            publishedAt: reply.snippet?.publishedAt || null,
                            type: "reply"
                        });
                    }
                }

                if (comments.length >= maxComments) {
                    break;
                }
            }

            nextPageToken = response.data.nextPageToken;

        } while (nextPageToken && comments.length < maxComments);

        return comments.slice(0, maxComments);

    } catch (error) {
        console.error(
            "Error fetching comments:",
            error.response?.data || error.message
        );

        return [];
    }
}

/**
 * Analyzes educational video quality with batch ABSA, JS aggregation, and synthesis.
 */
async function analyzeVideo(videoInput, options = {}) {
    const startTime = Date.now();
    let videoId = null;
    let videoURL = null;
    let videoMeta = { title: "", channel: "", publishedAt: "" };

    if (typeof videoInput === "string") {
        videoURL = videoInput;
        videoId = extractVideoId(videoInput);
    } else if (typeof videoInput === "object" && videoInput !== null) {
        videoId = videoInput.videoId || extractVideoId(videoInput.url);
        videoURL = videoInput.url || `https://www.youtube.com/watch?v=${videoId}`;
        videoMeta = {
            title: videoInput.title || "",
            channel: videoInput.channel || "",
            publishedAt: videoInput.publishedAt || ""
        };
    }

    if (!videoId) {
        console.log("Invalid YouTube URL/Input:", videoInput);
        return null;
    }

    console.log(`\n======================================`);
    console.log(`Processing video: ${videoId}`);
    if (videoMeta.title) console.log(`Title: ${videoMeta.title}`);
    console.log(`======================================`);

    // 1. Fetch comments
    console.log(`Fetching comments: up to ${options.maxComments || config.maxComments}`);
    const comments = options.mockComments || await fetchComments(videoId, options);

    if (comments.length === 0) {
        console.log("No comments found for this video.");
        return {
            videoId,
            videoURL,
            videoMeta,
            totalComments: 0,
            analysis: null,
            message: "No comments found"
        };
    }

    console.log(`Fetched comments: ${comments.length}`);

    // 2. Preprocess comments
    const preprocessed = preprocessComments(comments, options.preprocessingOptions);
    console.log(`Preprocessing: ${preprocessed.length} valid`);

    if (preprocessed.length === 0) {
        console.log("No valid comments remaining after preprocessing.");
        return {
            videoId,
            videoURL,
            videoMeta,
            totalComments: comments.length,
            preprocessedComments: 0,
            analysis: null,
            message: "No valid comments after preprocessing"
        };
    }

    try {
        // 3. Batch ABSA Classification
        const batchSize = options.batchSize || config.batchSize;
        const batches = chunkCommentsIntoBatches(preprocessed, batchSize);

        const classifications = await classifyAllBatches(
            batches,
            videoId,
            videoMeta,
            options
        );

        // 4. Deterministic JavaScript Aggregation & Scoring
        console.log("\nAggregation completed.");
        const aggregatedReport = aggregateEducationalScores(preprocessed, classifications, {
            ...options,
            totalCommentsFetched: comments.length
        });

        const overallScore = aggregatedReport.overallEducationalQuality.score;
        const tier = aggregatedReport.overallEducationalQuality.tier;
        console.log(`Quality score calculated: ${overallScore !== null ? overallScore + "/100" : "N/A"} (${tier})`);

        // 5. Final LLM Synthesis (Optional)
        let qualitativeSynthesis = null;
        if (options.enableSynthesis ?? config.enableSynthesis) {
            console.log("Generating final synthesis report...");
            qualitativeSynthesis = await synthesizeQualityReport(aggregatedReport, videoMeta, options);
            console.log("Final report generated.");
        }

        const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

        const finalResult = {
            videoId,
            videoURL,
            videoMeta,
            processingDurationSeconds: durationSeconds,
            pipelineCounts: aggregatedReport.pipelineCounts,
            evidenceCoverage: aggregatedReport.evidenceCoverage,
            overallEducationalQuality: aggregatedReport.overallEducationalQuality,
            sentimentDistribution: aggregatedReport.sentiment.distribution,
            relevanceDistribution: aggregatedReport.relevance.distribution,
            aspectScores: aggregatedReport.aspectScores,
            topPraisedAspects: aggregatedReport.topPraisedAspects,
            topCriticisms: aggregatedReport.topCriticisms,
            synthesis: qualitativeSynthesis,
            disclaimer: aggregatedReport.disclaimer
        };

        // Save concise educational report as a .txt file
        const reportPath = options.outputFile || `report_${videoId}.txt`;
        saveEducationalReport(finalResult, reportPath);
        finalResult.reportFilePath = reportPath;

        return finalResult;

    } catch (error) {
        console.error(`Analysis failed for video ${videoId}:`, error.message);
        return {
            videoId,
            videoURL,
            videoMeta,
            totalComments: comments.length,
            error: error.message
        };
    }
}

/**
 * Searches YouTube and analyzes videos sequentially.
 */
async function searchAndFetchComments(query, options = {}) {
    const { maxVideos = 5, interVideoDelayMs = 3000 } = options;

    try {
        console.log("\nSearching YouTube for:", query);

        const videos = await searchYouTube(query, maxVideos);

        if (!videos || videos.length === 0) {
            console.log("No videos found for the query.");
            return [];
        }

        const allResults = [];

        for (let i = 0; i < videos.length; i++) {
            const videoItem = videos[i];

            console.log(`\nVideo ${i + 1}/${videos.length}`);

            const result = await analyzeVideo(videoItem, options);

            if (result) {
                allResults.push(result);
            }

            if (i < videos.length - 1 && interVideoDelayMs > 0) {
                console.log(`Waiting ${Math.ceil(interVideoDelayMs / 1000)}s before next video...`);
                await new Promise((resolve) => setTimeout(resolve, interVideoDelayMs));
            }
        }

        // Save consolidated summary report.txt if videos were analyzed
        if (allResults.length > 0) {
            const summaryFile = options.summaryFile || "report.txt";
            const summaryText = formatMultiVideoReport(allResults);
            fs.writeFileSync(path.resolve(process.cwd(), summaryFile), summaryText, "utf-8");
        }

        console.log("\n\n======================================");
        console.log("FINAL RESULTS FOR ALL VIDEOS");
        console.log("======================================\n");
        console.log(JSON.stringify(allResults, null, 2));

        return allResults;

    } catch (error) {
        console.error("Application error:", error.message);
        return [];
    }
}

// CLI entry point
if (require.main === module) {
    const query = process.argv[2] || "Javascript tutorial for beginners";
    searchAndFetchComments(query);
}

module.exports = {
    extractVideoId,
    fetchComments,
    analyzeVideo,
    searchAndFetchComments
};
