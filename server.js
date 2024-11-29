require('dotenv').config();
const express = require('express');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript-api');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WebSocket = require('ws');
const http = require('http');
const youtubedl = require('youtube-dl-exec');

// Initialize Express
const app = express();
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Broadcast message to all connected clients
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Initialize the Google AI
const genAI = new GoogleGenerativeAI(process.env.PALM_API_KEY);

// Rate limiting middleware
const summaryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10
});

// Update the video ID extraction function to be more robust
function extractVideoId(url) {
    try {
        // Handle different YouTube URL formats
        let videoId = null;
        
        // Regular YouTube URL format
        const regularMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        if (regularMatch) {
            videoId = regularMatch[1];
        }
        
        // Short URL format
        const shortMatch = url.match(/^.*youtu.be\/([^#\&\?]*).*/);
        if (shortMatch) {
            videoId = shortMatch[1];
        }

        console.log('Extracted Video ID:', videoId); // Debug log
        return videoId;
    } catch (error) {
        console.error('Error extracting video ID:', error);
        return null;
    }
}

// Update the video summarizer endpoint
app.post('/api/summarize-video', summaryLimiter, async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Received URL:', url);

        if (!url) {
            return res.status(400).json({ error: 'No URL provided' });
        }

        // Get video information using youtube-dl
        try {
            console.log('Fetching video info...');
            const videoInfo = await youtubedl(url, {
                dumpSingleJson: true,
                noWarnings: true,
                noCallHome: true,
                preferFreeFormats: true,
                youtubeSkipDashManifest: true,
            });

            // Extract relevant information
            const title = videoInfo.title;
            const description = videoInfo.description || '';
            const duration = videoInfo.duration;
            const views = videoInfo.view_count;
            
            // Create a prompt for the AI
            const prompt = `
                Please analyze this YouTube video information and provide a concise summary of key points.
                
                Title: ${title}
                Duration: ${duration} seconds
                Views: ${views}
                Description: ${description}

                Please provide:
                1. Main topic or purpose
                2. Key points and takeaways
                3. Brief conclusion
                
                Format the response in bullet points.
            `;

            // Initialize the model
            const model = genAI.getGenerativeModel({ 
                model: "gemini-pro",
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7,
                },
            });

            console.log('Generating summary...');
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const summary = response.text();

            return res.json({ 
                summary: summary,
                videoInfo: {
                    title,
                    duration: `${Math.floor(duration / 60)}:${duration % 60}`,
                    views
                }
            });

        } catch (videoError) {
            console.error('Video fetch error:', videoError);
            return res.status(400).json({ 
                error: 'Could not fetch video information',
                details: 'Please make sure the video URL is valid and the video is publicly accessible.'
            });
        }

    } catch (error) {
        console.error('General error:', error);
        return res.status(500).json({ 
            error: 'Failed to process video',
            details: error.message
        });
    }
});

// AI Chat endpoint
app.post('/api/ai-chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        // Initialize the model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Generate the response
        const result = await model.generateContent(message);
        const response = await result.response;
        const aiResponse = response.text();

        res.json({ 
            response: aiResponse
        });

    } catch (error) {
        console.error('AI Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to generate response',
            details: error.message 
        });
    }
});

// Add this error handling middleware at the end
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

