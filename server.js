const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

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

// Serve static files from 'public' directory
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

