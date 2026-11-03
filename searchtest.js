const searchYouTube = require("./youtubesearch.js");

async function main() {

    const userText = "Javascript tutorial for beginners";

    const videos = await searchYouTube(userText, 10);

    console.log("\nVideos found:\n");

    console.log(JSON.stringify(videos, null, 2));

}

main();