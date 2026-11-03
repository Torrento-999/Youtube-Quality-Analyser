/**
 * Executes async tasks over an array of items with a fixed concurrency limit.
 * Preserves the original item ordering in the output array.
 *
 * @param {Array<any>} items - Array of inputs.
 * @param {number} concurrency - Maximum number of parallel tasks.
 * @param {Function} taskFn - Async function (item, index) => Promise<result>.
 * @returns {Promise<Array<any>>} Results in matching order.
 */
async function asyncPool(items, concurrency = 3, taskFn) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const results = new Array(items.length);
    let currentIndex = 0;

    async function worker() {
        while (currentIndex < items.length) {
            const index = currentIndex++;
            try {
                results[index] = await taskFn(items[index], index);
            } catch (err) {
                // Return error object rather than crashing the whole pool
                results[index] = { error: err.message, failedIndex: index };
            }
        }
    }

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}

module.exports = asyncPool;
