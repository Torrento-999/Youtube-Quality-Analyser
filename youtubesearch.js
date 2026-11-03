require("dotenv").config();

const axios = require("axios");

const API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Search YouTube for videos matching a query.
 * 
 * @param {string} query - The search query term.
 * @param {number} [maxResults=10] - Maximum number of videos to return.
 * @param {Object} [options={}] - Options.
 * @param {boolean} [options.urlsOnly=false] - If true, returns only an array of URL strings.
 * @returns {Promise<Array<Object|string>>} Array of video objects or URL strings.
 */
async function searchYouTube(query, maxResults = 10, options = {}) {
    const { urlsOnly = false } = options;

    if (!API_KEY) {
        console.warn("YouTube Search Warning: YOUTUBE_API_KEY is not defined in environment variables.");
    }

    try {
        const response = await axios.get(
            "https://www.googleapis.com/youtube/v3/search",
            {
                params: {
                    part: "snippet",
                    q: query,
                    type: "video",
                    maxResults: maxResults,
                    order: "relevance",
                    key: API_KEY
                }
            }
        );

        const items = response.data.items || [];

        const videos = items.map((item) => ({
            videoId: item.id?.videoId,
            title: item.snippet?.title || "",
            channel: item.snippet?.channelTitle || "",
            description: item.snippet?.description || "",
            url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
            publishedAt: item.snippet?.publishedAt || ""
        }));

        if (urlsOnly) {
            return videos.map((v) => v.url);
        }

        return videos;

    } catch (error) {
        console.error(
            "YouTube search error:",
            error.response?.data || error.message
        );

        return [];
    }
}

module.exports = searchYouTube;
