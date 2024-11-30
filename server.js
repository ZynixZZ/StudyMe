require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Add this console log to show server is initializing
console.log('Starting server...');

// Add these console logs for debugging
console.log('Complete environment variables check:');
console.log('All env variables:', Object.keys(process.env));
console.log('TEST_KEY:', process.env.TEST_KEY);
console.log('YOUTUBE_API_KEY:', process.env.YOUTUBE_API_KEY ? 'Present' : 'Missing');
console.log('YOUTUBE_API_KEY length:', process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.length : 0);
console.log('First 6 chars of YouTube key:', process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.substring(0, 6) : 'none');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Present' : 'Missing');

// Add detailed logging for API key
console.log('YouTube API Key Check:');
console.log('Key exists:', !!process.env.YOUTUBE_API_KEY);
console.log('Key length:', process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.length : 0);
console.log('Key starts with:', process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.substring(0, 6) : 'none');

// Initialize YouTube client differently
const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Root route - serve login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Add explicit routes for each page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Add these endpoints after your existing middleware and before the static routes
app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Signup attempt:', { username });

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }

        // For now, just return success
        // In a real app, you'd want to store this in a database
        res.status(200).json({ 
            message: 'Signup successful',
            username: username
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Login attempt:', { username });

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }

        // For now, just return success
        // In a real app, you'd verify against a database
        res.status(200).json({ 
            message: 'Login successful',
            username: username
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Make sure this endpoint is defined BEFORE your catch-all route
app.post('/api/ai-server', async (req, res) => {
    try {
        const { message, username } = req.body;
        console.log('AI request from:', username, 'Message:', message);

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Ensure the API key is set
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not set');
            return res.status(500).json({ error: 'AI service configuration error' });
        }

        // Get Gemini model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Generate response from Gemini
        const result = await model.generateContent(message);
        const response = await result.response;
        const reply = response.text();

        console.log('AI response:', reply);
        res.status(200).json({ reply });

    } catch (error) {
        console.error('AI server error:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ error: 'Failed to get AI response' });
    }
});

// Add this with your other endpoints, before the catch-all route
app.post('/api/summarize', async (req, res) => {
    try {
        const { videoUrl, username } = req.body;
        console.log('Summary request from:', username, 'URL:', videoUrl);

        if (!videoUrl) {
            return res.status(400).json({ error: 'Video URL is required' });
        }

        // Verify API key again at request time
        if (!process.env.YOUTUBE_API_KEY) {
            console.error('YouTube API key missing at request time');
            return res.status(500).json({ error: 'YouTube API configuration error' });
        }

        // Extract video ID with logging
        let videoId;
        try {
            const url = new URL(videoUrl);
            if (url.hostname.includes('youtube.com')) {
                videoId = url.searchParams.get('v');
            } else if (url.hostname.includes('youtu.be')) {
                videoId = url.pathname.slice(1);
            }
            console.log('Extracted video ID:', videoId);
        } catch (error) {
            console.error('URL parsing error:', error);
            return res.status(400).json({ error: 'Invalid YouTube URL format' });
        }

        // Log the actual API call details
        console.log('Making YouTube API request with:');
        console.log('- Video ID:', videoId);
        console.log('- API Key present:', !!process.env.YOUTUBE_API_KEY);

        // Make the API call with explicit key
        const videoData = await youtube.videos.list({
            key: process.env.YOUTUBE_API_KEY,  // Explicitly include the key here
            part: ['snippet', 'statistics', 'contentDetails'],
            id: [videoId]
        });

        if (!videoData.data.items || videoData.data.items.length === 0) {
            return res.status(404).json({ error: 'Video not found or is private' });
        }

        const video = videoData.data.items[0];
        const videoInfo = {
            title: video.snippet.title || 'Untitled',
            description: video.snippet.description || 'No description available',
            publishedAt: video.snippet.publishedAt,
            channelTitle: video.snippet.channelTitle || 'Unknown channel',
            tags: video.snippet.tags || [],
            viewCount: video.statistics.viewCount || '0',
            duration: video.contentDetails.duration || 'Unknown duration'
        };

        console.log('Video info extracted:', {
            title: videoInfo.title,
            channel: videoInfo.channelTitle,
            id: videoId
        });

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `Analyze this specific YouTube video based on its official metadata:

VIDEO DETAILS:
Title: ${videoInfo.title}
Channel: ${videoInfo.channelTitle}
Published: ${videoInfo.publishedAt}
Views: ${videoInfo.viewCount}

Description:
${videoInfo.description}

Please provide a structured summary of THIS SPECIFIC video using the above information:

TITLE: ${videoInfo.title}

MAIN TOPICS:
• [Extract 3-4 main topics from the video's description]

KEY POINTS:
• [List 3-5 key points based on the video's description]

DETAILED SUMMARY:
[2-3 paragraphs summarizing the video's content]`;

        console.log('Sending prompt to Gemini');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        console.log('Summary generated successfully');
        res.status(200).json({ summary });

    } catch (error) {
        console.error('Detailed summarizer error:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            apiKeyCheck: {
                exists: !!process.env.YOUTUBE_API_KEY,
                length: process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.length : 0,
                startsWith: process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.substring(0, 6) : 'none'
            }
        });
        
        res.status(500).json({ 
            error: 'Failed to generate summary',
            details: error.message 
        });
    }
});

// Make sure this is AFTER all your API endpoints
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Add more console logs for debugging
app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.url}`);
    next();
});

// WebSocket setup
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('Received message:', data);

            if (data.type === 'connection') {
                // Store username and connection
                clients.set(ws, data.username);
                console.log(`${data.username} connected`);
                
                // Broadcast user joined message
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'system',
                            username: 'System',
                            message: `${data.username} joined the chat`
                        }));
                    }
                });
            } else if (data.type === 'chat') {
                console.log('Broadcasting chat message:', data);
                // Broadcast the message to all clients
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'chat',
                            username: clients.get(ws),
                            message: data.message
                        }));
                    }
                });
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        const username = clients.get(ws);
        clients.delete(ws);
        
        if (username) {
            console.log(`${username} disconnected`);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'system',
                        username: 'System',
                        message: `${username} left the chat`
                    }));
                }
            });
        }
    });
});

// Heartbeat to keep connections alive
setInterval(() => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.ping();
        }
    });
}, 30000);

// Start server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});

// Add error handling
server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

