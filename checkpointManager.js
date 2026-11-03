const fs = require("fs");
const path = require("path");
const config = require("./config");

/**
 * Manages local JSON checkpoints to enable resumption and prevent duplicate LLM calls.
 */
class CheckpointManager {
    constructor(checkpointDir = config.checkpointDir) {
        this.checkpointDir = path.resolve(checkpointDir);
        this.ensureDir();
    }

    ensureDir() {
        if (!fs.existsSync(this.checkpointDir)) {
            fs.mkdirSync(this.checkpointDir, { recursive: true });
        }
    }

    getFilePath(videoId) {
        const sanitized = String(videoId).replace(/[^a-zA-Z0-9_-]/g, "_");
        return path.join(this.checkpointDir, `checkpoint_${sanitized}.json`);
    }

    load(videoId) {
        const filePath = this.getFilePath(videoId);
        if (!fs.existsSync(filePath)) {
            return {
                videoId,
                batches: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        try {
            const raw = fs.readFileSync(filePath, "utf-8");
            return JSON.parse(raw);
        } catch (err) {
            console.warn(`[Checkpoint] Failed to read ${filePath}, creating new:`, err.message);
            return {
                videoId,
                batches: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }
    }

    saveBatch(videoId, batchIndex, data) {
        const checkpoint = this.load(videoId);
        checkpoint.batches[String(batchIndex)] = {
            batchIndex,
            commentIds: data.commentIds || [],
            classifications: data.classifications || [],
            provider: data.provider || "unknown",
            durationMs: data.durationMs || 0,
            tokens: data.tokens || null,
            timestamp: new Date().toISOString()
        };
        checkpoint.updatedAt = new Date().toISOString();

        const filePath = this.getFilePath(videoId);
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2), "utf-8");
        fs.renameSync(tempPath, filePath);
    }

    getCompletedBatch(videoId, batchIndex) {
        const checkpoint = this.load(videoId);
        return checkpoint.batches[String(batchIndex)] || null;
    }

    getAllCompletedBatches(videoId) {
        const checkpoint = this.load(videoId);
        return checkpoint.batches || {};
    }

    clear(videoId) {
        const filePath = this.getFilePath(videoId);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.warn(`[Checkpoint] Could not delete ${filePath}:`, err.message);
            }
        }
    }
}

module.exports = new CheckpointManager();
