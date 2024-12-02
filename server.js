require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

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

        if (!process.env.SERP_API_KEY) {
            console.error('SERP_API_KEY is not set');
            return res.status(500).json({ error: 'API configuration error' });
        }

        // Extract video ID
        let videoId;
        try {
            const url = new URL(videoUrl);
            if (url.hostname.includes('youtube.com')) {
                videoId = url.searchParams.get('v');
            } else if (url.hostname.includes('youtu.be')) {
                videoId = url.pathname.slice(1);
            }
            
            if (!videoId) {
                throw new Error('Could not extract video ID');
            }
            console.log('Processing video ID:', videoId);
        } catch (error) {
            console.error('URL parsing error:', error);
            return res.status(400).json({ error: 'Invalid YouTube URL format' });
        }

        // Fetch video details from SerpApi with updated query parameters
        console.log('Fetching video data from SerpApi');
        const apiUrl = `https://serpapi.com/search.json`;
        const params = {
            engine: 'youtube',
            search_query: videoId,
            api_key: process.env.SERP_API_KEY
        };

        console.log('Making API request with params:', { ...params, api_key: '***' });
        
        const serpApiResponse = await axios.get(apiUrl, { params });
        
        if (!serpApiResponse.data || !serpApiResponse.data.video_results) {
            console.error('API Response:', serpApiResponse.data);
            throw new Error('Invalid response from API');
        }

        const videoInfo = serpApiResponse.data.video_results[0] || {};

        // Create prompt for Gemini
        const prompt = `Analyze this YouTube video based on its metadata:

VIDEO DETAILS:
Title: ${videoInfo.title || 'Unknown Title'}
Channel: ${videoInfo.channel?.name || 'Unknown Channel'}
Views: ${videoInfo.views || 'Unknown Views'}
Description: ${videoInfo.description || 'No description available'}
Duration: ${videoInfo.duration_text || 'Unknown Duration'}

Please provide a structured summary:

MAIN TOPICS:
• [Extract 3-4 main topics from the video's description]

KEY POINTS:
• [List 4-5 key points based on the video's content]

DETAILED SUMMARY:
[2-3 paragraphs summarizing the main content]

TAKEAWAYS:
• [List 2-3 main takeaways]`;

        console.log('Sending prompt to Gemini');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const geminiResult = await model.generateContent(prompt);
        const geminiResponse = await geminiResult.response;
        const summary = geminiResponse.text();

        console.log('Summary generated successfully');
        res.status(200).json({ summary });

    } catch (error) {
        console.error('Detailed summarizer error:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            apiKey: process.env.SERP_API_KEY ? 'Present' : 'Missing',
            apiKeyLength: process.env.SERP_API_KEY ? process.env.SERP_API_KEY.length : 0
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
                const systemMessage = JSON.stringify({
                    type: 'system',
                    username: 'System',
                    message: `${data.username} joined the chat`
                });
                
                // Send to all clients except the sender
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(systemMessage);
                    }
                });
            } else if (data.type === 'chat') {
                console.log('Broadcasting chat message:', data);
                const chatMessage = JSON.stringify({
                    type: 'chat',
                    username: clients.get(ws),
                    message: data.message
                });
                
                // Send to all clients including the sender (they'll receive it only once)
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(chatMessage);
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

