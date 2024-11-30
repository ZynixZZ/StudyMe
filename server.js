require('dotenv').config();
const express = require('express');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript-api');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

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

// This is a temporary in-memory store - in production you'd use a database
const users = new Map();
const sessions = new Map();

// Helper function to create a session
function createSession(username) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, {
        username,
        timestamp: Date.now()
    });
    return sessionId;
}

// Signup endpoint
app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Signup attempt:', { username });

        if (!username || !password) {
            console.log('Missing credentials');
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }

        // Check if user already exists
        if (users.has(username)) {
            return res.status(400).json({ 
                error: 'Username already exists' 
            });
        }

        // Store user (in production, you'd hash the password)
        users.set(username, { 
            password,
            createdAt: Date.now()
        });

        // Create session
        const sessionId = createSession(username);

        console.log('Signup successful for:', username);
        
        // Send session cookie and success response
        res.cookie('sessionId', sessionId, { 
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }).status(200).json({ 
            message: 'Signup successful',
            username: username
        });

    } catch (error) {
        console.error('Server signup error:', error);
        res.status(500).json({ 
            error: 'Failed to create account',
            details: error.message 
        });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check credentials
        const user = users.get(username);
        if (!user || user.password !== password) {
            return res.status(401).json({ 
                error: 'Invalid username or password' 
            });
        }

        // Create session
        const sessionId = createSession(username);

        // Send session cookie and success response
        res.cookie('sessionId', sessionId, { 
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }).status(200).json({ 
            message: 'Login successful',
            username: username
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Failed to log in',
            details: error.message 
        });
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

// Add these routes after your existing routes
// Make sure they're before any catch-all routes

// Add middleware to check auth for dashboard
function checkAuth(req, res, next) {
    const sessionId = req.cookies?.sessionId;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.redirect('/login');
    }

    req.username = session.username;
    next();
}

// Dashboard route
app.get('/dashboard', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Root route - redirect to login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Catch-all route for any unmatched routes
app.get('*', (req, res) => {
    res.redirect('/login');
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

// Initialize the AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Update the AI chat endpoint
app.post('/api/ai-chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        console.log('Attempting AI chat with message:', message);

        // Use the hosted Gemini Pro model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        // Generate content
        const result = await model.generateContent(message);
        const response = await result.response;
        const text = response.text();
        
        console.log('AI Response received:', text.substring(0, 100) + '...');
        
        res.json({ reply: text });
        
    } catch (error) {
        console.error('AI Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to get AI response',
            details: error.message 
        });
    }
});

