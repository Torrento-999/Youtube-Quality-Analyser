# YouTube Educational Quality Analysis

An AI-powered application that analyzes YouTube video comments to evaluate **perceived educational quality** using Aspect-Based Sentiment Analysis (ABSA).

## Overview

This project analyzes audience feedback to identify the strengths and weaknesses of educational videos. It evaluates different aspects of teaching quality based on viewer comments and generates a structured quality report.

## Features

- Search educational videos using the YouTube Data API.
- Retrieve and preprocess YouTube comments.
- Perform Aspect-Based Sentiment Analysis (ABSA) using LLMs.
- Identify educational aspects such as clarity, pacing, content depth, and engagement.
- Calculate aspect-wise and overall educational quality scores.
- Analyze sentiment distribution and evidence coverage.
- Generate strengths, weaknesses, and improvement suggestions.
- Export analysis results as text reports.

## Educational Aspects Evaluated

| Aspect | Description |
|---|---|
| Clarity | How clearly concepts are explained |
| Pacing | Speed and flow of teaching |
| Content Accuracy | Correctness of information |
| Content Depth | Thoroughness of explanations |
| Practical Examples | Use of examples and demonstrations |
| Organization | Structure and logical flow |
| Engagement | Ability to maintain viewer interest |
| Audio/Video | Production and presentation quality |
| Updatedness | Relevance and freshness of content |
| General Quality | Overall perceived educational quality |

## Workflow

1. User enters a topic or search query.
2. YouTube Data API retrieves relevant videos.
3. Comments are collected and preprocessed.
4. AI models analyze comments using ABSA.
5. JavaScript aggregates sentiment and aspect classifications.
6. Educational quality scores and evidence metrics are calculated.
7. A summarized report is generated and saved as a `.txt` file.

## Tech Stack

- **Runtime:** Node.js
- **Language:** JavaScript
- **Video Data:** YouTube Data API v3
- **AI Analysis:** Gemini / Grok API
- **Analysis Method:** Aspect-Based Sentiment Analysis (ABSA)

## Setup and Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/youtube-educational-quality-analysis.git
cd youtube-educational-quality-analysis
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory:

```env
YOUTUBE_API_KEY=your_youtube_api_key
GEMINI_API_KEY=your_gemini_api_key
```

Add other provider keys if required by your configuration.

### 4. Run the application

```bash
node index.js
```

## Sample Output

```text
YOUTUBE EDUCATIONAL QUALITY REPORT

Video: JavaScript Tutorial for Beginners

OVERALL SCORE: 85/100

ASPECT SCORES
• Clarity: 90/100
• Content Depth: 75/100
• Pacing: 80/100

KEY STRENGTHS
• Clear explanations
• Engaging presentation

KEY WEAKNESSES
• Fast pacing in complex sections

SUGGESTIONS
• Include more practical examples
• Slow down difficult concepts
```

## Important Note

This project evaluates **perceived educational quality based on available audience comments**. The results do not represent an objective measurement of learning effectiveness or the opinions of all video viewers.

## Future Improvements

- Fine-tune a custom sentiment analysis model.
- Improve classification accuracy and evidence coverage.
- Introduce confidence-aware scoring.
- Develop a web-based dashboard for visualization.
- Expand multilingual comment analysis.

## License

This project is currently developed for educational and research purposes.
