require('dotenv').config();
const express = require('express');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript-api');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const youtubedl = require('youtube-dl-exec');
const cors = require('cors');

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

// Store users in memory with better structure
const users = new Map();
const sessions = new Map();

// Helper function to log users
function logCurrentUsers() {
    console.log('Current registered users:');
    users.forEach((data, username) => {
        console.log(`- ${username}: ${JSON.stringify(data)}`);
    });
}

// Update signup endpoint with more logging
app.post('/api/signup', async (req, res) => {
    console.log('Received signup request');
    console.log('Request body:', req.body);
    
    try {
        const { username, password } = req.body;
        
        console.log('Processing signup for:', username);

        if (!username || !password) {
            console.log('Missing credentials');
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }

        // Store user
        users.set(username, {
            password,
            createdAt: new Date().toISOString()
        });

        console.log('User stored in memory:', username);
        console.log('Current users:', Array.from(users.keys()));

        // Create session
        const sessionId = crypto.randomBytes(32).toString('hex');
        sessions.set(sessionId, {
            username,
            createdAt: new Date().toISOString()
        });

        console.log('Session created:', sessionId);

        res.cookie('sessionId', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        console.log('Sending success response');
        res.status(200).json({ 
            message: 'Signup successful',
            username: username
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            error: 'Failed to create account',
            details: error.message 
        });
    }
});

// Update login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('\n--- Login Attempt ---');
        console.log('Username:', username);
        console.log('Current users:', Array.from(users.keys()));

        // Check if user exists
        const userData = users.get(username);
        
        if (!userData) {
            console.log('Login failed: User not found');
            return res.status(401).json({ 
                error: 'Invalid username or password' 
            });
        }

        // Check password
        if (userData.password !== password) {
            console.log('Login failed: Invalid password');
            return res.status(401).json({ 
                error: 'Invalid username or password' 
            });
        }

        // Update last login
        userData.lastLogin = new Date().toISOString();
        users.set(username, userData);

        // Create new session
        const sessionId = crypto.randomBytes(32).toString('hex');
        sessions.set(sessionId, {
            username,
            createdAt: new Date().toISOString()
        });

        console.log('Login successful for:', username);
        console.log('Session created:', sessionId);

        // Set cookie and send response
        res.cookie('sessionId', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        }).status(200).json({ 
            message: 'Login successful',
            username: username,
            redirect: '/dashboard'  // Add explicit redirect path
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Failed to log in',
            details: error.message 
        });
    }
});

// Add a test endpoint to view current users (remove in production)
app.get('/api/debug/users', (req, res) => {
    const userList = Array.from(users.entries()).map(([username, data]) => ({
        username,
        createdAt: data.createdAt,
        lastLogin: data.lastLogin
    }));
    res.json(userList);
});

// Add a route to check current session
app.get('/api/check-session', (req, res) => {
    const sessionId = req.cookies?.sessionId;
    const session = sessions.get(sessionId);
    
    if (session) {
        res.json({ 
            loggedIn: true, 
            username: session.username 
        });
    } else {
        res.json({ 
            loggedIn: false 
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

// Add authentication middleware
const checkAuth = (req, res, next) => {
    const sessionId = req.cookies?.sessionId;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.redirect('/login');
    }
    
    req.user = session;
    next();
};

// Update dashboard route to use auth
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

// Use environment variable for port
const PORT = process.env.PORT || 3000;

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

// Keep track of all connected clients
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);

            // Handle different message types
            switch (data.type) {
                case 'connection':
                    // Store username with the connection
                    clients.set(ws, data.username);
                    broadcastMessage({
                        type: 'connection',
                        username: data.username,
                        message: `${data.username} joined the chat`
                    });
                    break;

                case 'chat':
                    // Broadcast the chat message to all clients
                    broadcastMessage({
                        type: 'chat',
                        username: data.username,
                        message: data.message
                    });
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        // Get username before removing from clients
        const username = clients.get(ws);
        // Remove client from the map
        clients.delete(ws);
        // Notify others that user has left
        if (username) {
            broadcastMessage({
                type: 'disconnection',
                username: username,
                message: `${username} left the chat`
            });
        }
        console.log('Client disconnected');
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Function to broadcast messages to all connected clients
function broadcastMessage(message) {
    console.log('Broadcasting:', message);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Log server start
console.log('WebSocket server started on port 3000');

// Start server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Initialize the AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Middleware
app.use(cors());

// Chat endpoint (removed authentication middleware)
app.post('/api/ai-server', async (req, res) => {
    try {
        const { message } = req.body;
        
        // Generate response using Gemini
        const result = await model.generateContent(message);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });
    } catch (error) {
        console.error('Gemini API error:', error);
        res.status(500).json({ error: 'Failed to get AI response' });
    }
});

// YouTube summary endpoint (removed authentication middleware)
app.post('/api/summarize', async (req, res) => {
    try {
        const { videoUrl } = req.body;
        
        const prompt = `Please provide a comprehensive summary of this YouTube video: ${videoUrl}. 
                       Focus on the main points and key takeaways.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        res.json({ summary });
    } catch (error) {
        console.error('Summary error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

