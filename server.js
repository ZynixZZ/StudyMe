const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Add this to parse JSON requests
app.use(express.json());

// Add your signup endpoint
app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Signup attempt:', { username });

        // Add validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Here you would typically:
        // 1. Check if username already exists
        // 2. Hash the password
        // 3. Save to database
        // For now, we'll just send back success

        res.status(200).json({ 
            message: 'Signup successful',
            username: username
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add your login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Login attempt:', { username });

        // Add validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Here you would typically:
        // 1. Verify username exists
        // 2. Verify password matches
        // For now, we'll just send back success

        res.status(200).json({ 
            message: 'Login successful',
            username: username
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve static files from 'public' directory
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// WebSocket setup
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);

            switch (data.type) {
                case 'connection':
                    clients.set(ws, data.username);
                    broadcastMessage({
                        type: 'connection',
                        username: data.username,
                        message: `${data.username} joined the chat`
                    });
                    break;

                case 'chat':
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
        const username = clients.get(ws);
        clients.delete(ws);
        if (username) {
            broadcastMessage({
                type: 'disconnection',
                username: username,
                message: `${username} left the chat`
            });
        }
        console.log('Client disconnected');
    });
});

function broadcastMessage(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

