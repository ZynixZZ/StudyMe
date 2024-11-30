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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Basic validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Here you would typically:
        // 1. Check if username already exists
        // 2. Hash the password
        // 3. Save to database
        
        // For now, we'll just send a success response
        res.json({ 
            message: 'Signup successful',
            username: username
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Basic validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Here you would typically:
        // 1. Check credentials against database
        // 2. Create a session or token
        
        // For now, we'll just send a success response
        res.json({ 
            message: 'Login successful',
            username: username
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to log in' });
    }
});

// Add a route for the signup page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Add a route for the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Initialize WebSocket with production settings
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    perMessageDeflate: false
});

// Your existing WebSocket code...

// Update port for production
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

