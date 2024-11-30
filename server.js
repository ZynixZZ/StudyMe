require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Add this console log to show server is initializing
console.log('Starting server...');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Add more console logs for debugging
app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.url}`);
    next();
});

// AI endpoint
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

// Add this with your other endpoints
app.post('/api/summarize', async (req, res) => {
    try {
        const { videoUrl, username } = req.body;
        console.log('Summary request from:', username, 'URL:', videoUrl);

        if (!videoUrl) {
            return res.status(400).json({ error: 'Video URL is required' });
        }

        // Ensure the API key is set
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not set');
            return res.status(500).json({ error: 'AI service configuration error' });
        }

        // Get Gemini model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Create prompt for summarization
        const prompt = `Please provide a concise summary of this YouTube video: ${videoUrl}. 
                       Focus on the main points and key takeaways.`;

        // Generate summary from Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        console.log('Summary generated:', summary);
        res.status(200).json({ summary });

    } catch (error) {
        console.error('Summary error:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

// WebSocket setup
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');  // Add this log

    ws.on('message', (message) => {
        console.log('Received:', message);  // Add this log
        // Your existing WebSocket message handling
    });
});

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

