require('dotenv').config();
const express = require('express');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript-api');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WebSocket = require('ws');
const http = require('http');

// Initialize Express
const app = express();
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Update WebSocket server to handle production
const wss = new WebSocket.Server({ 
    server,
    // Add WebSocket options for production
    clientTracking: true,
    perMessageDeflate: false
});

// Initialize the Google AI
const genAI = new GoogleGenerativeAI(process.env.PALM_API_KEY);

// Rate limiting middleware - more restrictive for production
const summaryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.'
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Basic error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Your existing routes...

// WebSocket connection handling with error handling
wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Update the port configuration
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

