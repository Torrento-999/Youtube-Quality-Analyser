const config = require("./config");

/**
 * Deterministic JavaScript Aggregator and Quality Scoring Engine.
 *
 * SCORING FORMULA DOCUMENTATION:
 * 1. Comment Engagement Weight: w_i = 1 + ln(1 + likes_i)
 * 2. Aspect Weighted Votes:
 *    - Praise Weight:      W_praise = sum(w_i * confidence_i) for opinion === "PRAISE"
 *    - Criticism Weight:   W_criticism = sum(w_i * confidence_i) for opinion === "CRITICISM"
 *    - Neutral/Mixed:      W_neutral = sum(w_i * confidence_i) for opinion in ["NEUTRAL", "MIXED"]
 *    - Total Aspect Weight: W_total = W_praise + W_criticism + W_neutral
 * 3. Individual Aspect Score (0 - 100):
 *    AspectScore(A) = (W_praise + 0.5 * W_neutral) / W_total * 100
 *    * If W_total === 0 (no viewer feedback for this aspect), AspectScore is strictly null (never 100).
 * 4. Overall Educational Quality Score (0 - 100):
 *    QualityScore = sum(weight_A * AspectScore_A) / sum(weight_A for active aspects with data)
 *    * Dynamic weight normalization ensures unmentioned aspects do not artificially penalize the score.
 */

function aggregateEducationalScores(preprocessedComments = [], classifications = [], options = {}) {
    const aspectWeights = options.aspectWeights || config.aspectWeights;
    const aspectLabels = options.aspectLabels || config.aspectLabels;
    const totalFetched = options.totalCommentsFetched || preprocessedComments.length;
    const validPreprocessed = preprocessedComments.length;

    // Fast lookup map for preprocessed comments
    const commentMap = new Map();
    for (const c of preprocessedComments) {
        commentMap.set(c.id, c);
    }

    if (classifications.length === 0) {
        return createEmptyReport(totalFetched, validPreprocessed);
    }

    // 1. Validation & Counter Initialization
    let analyzedCount = 0;
    const accountedCommentIds = new Set();

    const relevanceCounts = {
        RELEVANT: 0,
        IRRELEVANT: 0,
        UNCERTAIN: 0
    };

    const sentimentCounts = {
        POSITIVE: 0,
        NEGATIVE: 0,
        MIXED: 0,
        NEUTRAL: 0,
        UNCERTAIN: 0
    };

    // Aspect tracking structures
    const aspectData = {};
    for (const cat of config.aspectCategories) {
        aspectData[cat] = {
            category: cat,
            label: aspectLabels[cat] || cat,
            praiseCount: 0,
            criticismCount: 0,
            mixedCount: 0,
            neutralCount: 0,
            totalMentions: 0,
            praiseWeight: 0,
            criticismWeight: 0,
            neutralWeight: 0,
            totalWeight: 0,
            confidenceSum: 0,
            evidenceQuotes: []
        };
    }

    const allPraises = [];
    const allCriticisms = [];
    let totalConfidenceSum = 0;
    let totalConfidenceCount = 0;

    // 2. Iterate through classifications
    for (const item of classifications) {
        if (!item || !item.commentId) continue;

        const commentId = item.commentId;
        accountedCommentIds.add(commentId);
        analyzedCount++;

        const meta = commentMap.get(commentId) || {
            likes: 0,
            engagementWeight: 1,
            text: "",
            author: "Unknown"
        };
        const weight = meta.engagementWeight || 1;

        // Normalize & Count Relevance
        const rel = String(item.relevance || "UNCERTAIN").toUpperCase();
        if (relevanceCounts.hasOwnProperty(rel)) {
            relevanceCounts[rel]++;
        } else {
            relevanceCounts.UNCERTAIN++;
        }

        // Normalize & Count Sentiment
        const sent = String(item.sentiment || "UNCERTAIN").toUpperCase();
        if (sentimentCounts.hasOwnProperty(sent)) {
            sentimentCounts[sent]++;
        } else {
            sentimentCounts.UNCERTAIN++;
        }

        // Collect key points
        if (Array.isArray(item.praisedPoints)) {
            for (const p of item.praisedPoints) {
                if (p && typeof p === "string" && p.trim()) {
                    allPraises.push({ text: p.trim(), weight, likes: meta.likes });
                }
            }
        }
        if (Array.isArray(item.criticizedPoints)) {
            for (const c of item.criticizedPoints) {
                if (c && typeof c === "string" && c.trim()) {
                    allCriticisms.push({ text: c.trim(), weight, likes: meta.likes });
                }
            }
        }

        // Process aspect ratings
        if (Array.isArray(item.aspects)) {
            for (const asp of item.aspects) {
                if (!asp || !asp.category) continue;
                const cat = String(asp.category).toUpperCase();
                if (!aspectData[cat]) continue;

                const target = aspectData[cat];
                const opinion = String(asp.opinion || "NEUTRAL").toUpperCase();
                const confidence = typeof asp.confidence === "number" ? Math.max(0, Math.min(1, asp.confidence)) : 0.8;
                const effectiveWeight = weight * confidence;

                target.totalMentions++;
                target.confidenceSum += confidence;
                totalConfidenceSum += confidence;
                totalConfidenceCount++;

                if (opinion === "PRAISE") {
                    target.praiseCount++;
                    target.praiseWeight += effectiveWeight;
                } else if (opinion === "CRITICISM") {
                    target.criticismCount++;
                    target.criticismWeight += effectiveWeight;
                } else if (opinion === "MIXED") {
                    target.mixedCount++;
                    target.neutralWeight += effectiveWeight;
                } else {
                    target.neutralCount++;
                    target.neutralWeight += effectiveWeight;
                }

                target.totalWeight += effectiveWeight;

                if (asp.evidence && typeof asp.evidence === "string") {
                    target.evidenceQuotes.push({
                        quote: asp.evidence.trim(),
                        opinion,
                        likes: meta.likes,
                        author: meta.author
                    });
                }
            }
        }
    }

    const failedClassificationsCount = Math.max(0, validPreprocessed - analyzedCount);

    // 3. Exact Percentage Distributions
    const sentimentDistribution = {
        POSITIVE: Number(((sentimentCounts.POSITIVE / analyzedCount) * 100).toFixed(1)),
        NEGATIVE: Number(((sentimentCounts.NEGATIVE / analyzedCount) * 100).toFixed(1)),
        MIXED: Number(((sentimentCounts.MIXED / analyzedCount) * 100).toFixed(1)),
        NEUTRAL: Number(((sentimentCounts.NEUTRAL / analyzedCount) * 100).toFixed(1)),
        UNCERTAIN: Number(((sentimentCounts.UNCERTAIN / analyzedCount) * 100).toFixed(1))
    };

    const relevanceDistribution = {
        RELEVANT: Number(((relevanceCounts.RELEVANT / analyzedCount) * 100).toFixed(1)),
        IRRELEVANT: Number(((relevanceCounts.IRRELEVANT / analyzedCount) * 100).toFixed(1)),
        UNCERTAIN: Number(((relevanceCounts.UNCERTAIN / analyzedCount) * 100).toFixed(1))
    };

    // 4. Aspect-Level Calculation
    const aspectScores = {};
    let activeWeightSum = 0;
    let weightedScoreAccumulator = 0;
    let aspectsWithDataCount = 0;

    for (const [cat, data] of Object.entries(aspectData)) {
        if (data.totalWeight > 0 && data.totalMentions > 0) {
            aspectsWithDataCount++;
            const rawScore = ((data.praiseWeight + 0.5 * data.neutralWeight) / data.totalWeight) * 100;
            const aspectScore = Math.round(rawScore);
            const avgConfidence = Number((data.confidenceSum / data.totalMentions).toFixed(2));

            // Sort evidence by like count descending, limit to top 5
            data.evidenceQuotes.sort((a, b) => b.likes - a.likes);

            aspectScores[cat] = {
                category: cat,
                label: data.label,
                score: aspectScore,
                totalMentions: data.totalMentions,
                praiseCount: data.praiseCount,
                criticismCount: data.criticismCount,
                praisePercent: Number(((data.praiseCount / data.totalMentions) * 100).toFixed(1)),
                criticismPercent: Number(((data.criticismCount / data.totalMentions) * 100).toFixed(1)),
                averageConfidence: avgConfidence,
                topEvidence: data.evidenceQuotes.slice(0, 5)
            };

            const assignedWeight = aspectWeights[cat] || 0;
            activeWeightSum += assignedWeight;
            weightedScoreAccumulator += aspectScore * assignedWeight;
        } else {
            // Insufficient evidence: explicit null, never 100
            aspectScores[cat] = {
                category: cat,
                label: data.label,
                score: null,
                totalMentions: 0,
                praiseCount: 0,
                criticismCount: 0,
                praisePercent: null,
                criticismPercent: null,
                averageConfidence: null,
                topEvidence: []
            };
        }
    }

    // Dynamic redistribution of weight across active aspects
    let overallQualityScore = null;
    if (activeWeightSum > 0) {
        overallQualityScore = Math.round(weightedScoreAccumulator / activeWeightSum);
    }

    let qualityTier = "Insufficient Evidence";
    if (overallQualityScore !== null) {
        if (overallQualityScore >= 85) qualityTier = "Exceptional Educational Quality";
        else if (overallQualityScore >= 70) qualityTier = "Good Quality";
        else if (overallQualityScore >= 50) qualityTier = "Average / Mixed Quality";
        else qualityTier = "Low / Problematic Quality";
    }

    // 5. Evidence Coverage & Confidence Indicators
    const totalAspectCategories = config.aspectCategories.length;
    const aspectCoveragePercent = Number(((aspectsWithDataCount / totalAspectCategories) * 100).toFixed(1));
    const classificationCoveragePercent = validPreprocessed > 0
        ? Number(((analyzedCount / validPreprocessed) * 100).toFixed(1))
        : 0;

    const overallAvgConfidence = totalConfidenceCount > 0
        ? Number((totalConfidenceSum / totalConfidenceCount).toFixed(2))
        : 0;

    let confidenceLevel = "LOW";
    let confidenceExplanation = "";

    if (relevanceCounts.RELEVANT >= 30 && aspectsWithDataCount >= 5 && overallAvgConfidence >= 0.80) {
        confidenceLevel = "HIGH";
        confidenceExplanation = `Strong evidence: ${relevanceCounts.RELEVANT} relevant comments across ${aspectsWithDataCount}/${totalAspectCategories} aspects with ${(overallAvgConfidence * 100).toFixed(0)}% average certainty.`;
    } else if (relevanceCounts.RELEVANT >= 10 && aspectsWithDataCount >= 3) {
        confidenceLevel = "MEDIUM";
        confidenceExplanation = `Moderate evidence: ${relevanceCounts.RELEVANT} relevant comments covering ${aspectsWithDataCount}/${totalAspectCategories} aspects.`;
    } else {
        confidenceLevel = "LOW";
        confidenceExplanation = `Directional evidence: based on ${relevanceCounts.RELEVANT} relevant comments. Results indicate preliminary viewer trends.`;
    }

    // 6. Rank key points
    const topPraises = rankKeyPoints(allPraises, 5);
    const topCriticisms = rankKeyPoints(allCriticisms, 5);

    return {
        pipelineCounts: {
            totalFetched,
            validPreprocessed,
            successfullyAnalyzed: analyzedCount,
            failedClassifications: failedClassificationsCount,
            classificationCoveragePercent
        },
        relevance: {
            counts: relevanceCounts,
            distribution: relevanceDistribution
        },
        sentiment: {
            counts: sentimentCounts,
            distribution: sentimentDistribution
        },
        evidenceCoverage: {
            aspectsWithData: aspectsWithDataCount,
            totalAspectCategories,
            aspectCoveragePercent,
            confidenceLevel,
            confidenceScore: Math.round((overallAvgConfidence * 0.6 + (aspectsWithDataCount / totalAspectCategories) * 0.4) * 100),
            averageModelConfidence: overallAvgConfidence,
            explanation: confidenceExplanation
        },
        overallEducationalQuality: {
            score: overallQualityScore,
            tier: qualityTier,
            generalSentiment: sentimentDistribution.POSITIVE >= 60 ? "Predominantly Positive" :
                             sentimentDistribution.NEGATIVE >= 40 ? "Predominantly Negative" : "Mixed / Balanced"
        },
        aspectScores,
        topPraisedAspects: topPraises,
        topCriticisms: topCriticisms,
        disclaimer: "This score is a deterministic heuristic aggregation of viewer sentiment and engagement signals. It reflects audience perception and should not be treated as a peer-reviewed pedagogical index."
    };
}

function rankKeyPoints(items, limit = 5) {
    const frequencyMap = new Map();

    for (const item of items) {
        const normalized = item.text.trim();
        if (!normalized) continue;

        if (!frequencyMap.has(normalized)) {
            frequencyMap.set(normalized, {
                point: normalized,
                count: 1,
                totalWeight: item.weight,
                maxLikes: item.likes
            });
        } else {
            const existing = frequencyMap.get(normalized);
            existing.count++;
            existing.totalWeight += item.weight;
            existing.maxLikes = Math.max(existing.maxLikes, item.likes);
        }
    }

    const sorted = Array.from(frequencyMap.values()).sort((a, b) => b.totalWeight - a.totalWeight);
    return sorted.slice(0, limit);
}

function createEmptyReport(totalFetched, validPreprocessed) {
    return {
        pipelineCounts: {
            totalFetched,
            validPreprocessed,
            successfullyAnalyzed: 0,
            failedClassifications: validPreprocessed,
            classificationCoveragePercent: 0
        },
        relevance: { counts: { RELEVANT: 0, IRRELEVANT: 0, UNCERTAIN: 0 }, distribution: { RELEVANT: 0, IRRELEVANT: 0, UNCERTAIN: 0 } },
        sentiment: { counts: { POSITIVE: 0, NEGATIVE: 0, MIXED: 0, NEUTRAL: 0, UNCERTAIN: 0 }, distribution: { POSITIVE: 0, NEGATIVE: 0, MIXED: 0, NEUTRAL: 0, UNCERTAIN: 0 } },
        evidenceCoverage: {
            aspectsWithData: 0,
            totalAspectCategories: config.aspectCategories.length,
            aspectCoveragePercent: 0,
            confidenceLevel: "INSUFFICIENT_DATA",
            confidenceScore: 0,
            averageModelConfidence: 0,
            explanation: "No comments were classified."
        },
        overallEducationalQuality: {
            score: null,
            tier: "Insufficient Data",
            generalSentiment: "None"
        },
        aspectScores: {},
        topPraisedAspects: [],
        topCriticisms: [],
        disclaimer: "Insufficient data to calculate score."
    };
}

module.exports = {
    aggregateEducationalScores,
    rankKeyPoints
};
