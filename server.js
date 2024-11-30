require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const youtubedl = require('youtube-dl-exec');

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

        // Get video info and description
        console.log('Fetching video info...');
        const videoInfo = await youtubedl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true
        });

        if (!videoInfo) {
            return res.status(400).json({ error: 'Could not fetch video information' });
        }

        // Extract relevant information
        const videoContent = `
            Title: ${videoInfo.title}
            Description: ${videoInfo.description}
            Duration: ${videoInfo.duration} seconds
            Upload Date: ${videoInfo.upload_date}
            View Count: ${videoInfo.view_count}
            ${videoInfo.tags ? 'Tags: ' + videoInfo.tags.join(', ') : ''}
        `;

        console.log('Video content extracted successfully');

        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not set');
            return res.status(500).json({ error: 'AI service configuration error' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `Based on this YouTube video information:

${videoContent}

Please provide a structured summary following this format:

TITLE: ${videoInfo.title}

MAIN POINTS:
• [Extract 3-5 key points from the video description and content]

DETAILED SUMMARY:
[Provide 2-3 paragraphs summarizing the main content and themes]

KEY TAKEAWAYS:
• [List 2-3 main takeaways from the video content]

Use ONLY the information provided above. Focus on the most important aspects of the video.`;

        console.log('Sending prompt to Gemini');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        console.log('Summary generated successfully');
        res.status(200).json({ summary });

    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        if (error.message.includes('Video unavailable')) {
            return res.status(400).json({ 
                error: 'Video is unavailable or private.' 
            });
        }
        
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

