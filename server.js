import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { v2 as cloudinary } from 'cloudinary';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const io = new Server(server);
const wss = new WebSocketServer({ server });

// Get current directory path (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: function(req, file, cb) {
        cb(null, uuidv4() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Configure Cloudinary with your credentials
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Log the configuration to verify it's loaded
console.log('Cloudinary Configuration:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? 'Present' : 'Missing',
    api_secret: process.env.CLOUDINARY_API_SECRET ? 'Present' : 'Missing'
});

app.post('/api/convert-to-3d', async (req, res) => {
    try {
        const { image } = req.body;
        
        console.log('Uploading image to Cloudinary...');
        
        // Upload image to Cloudinary
        const uploadResponse = await cloudinary.uploader.upload(image, {
            folder: '3d-conversions'
        });

        console.log('Cloudinary upload response:', uploadResponse);

        // Make sure we have the secure_url from Cloudinary
        if (!uploadResponse.secure_url) {
            throw new Error('No secure URL received from Cloudinary');
        }

        // Create the Meshy request body
        const meshyRequestBody = {
            "image_url": uploadResponse.secure_url,
            "webhook_url": "",
            "settings": {
                "format": "glb"
            }
        };

        console.log('Sending to Meshy with body:', JSON.stringify(meshyRequestBody, null, 2));

        const meshyResponse = await fetch('https://api.meshy.ai/v1/image-to-3d', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MESHY_API_KEY}`,
                'Accept': 'application/json',
                'X-Api-Version': '2024-01'
            },
            body: JSON.stringify(meshyRequestBody)
        });

        const responseData = await meshyResponse.json();
        console.log('Meshy API Response:', responseData);

        if (meshyResponse.status === 202) {
            // Send back the task ID to the client
            res.json({
                success: true,
                taskId: responseData.result,
                status: 'processing'
            });
        } else {
            throw new Error(`Unexpected response: ${JSON.stringify(responseData)}`);
        }

    } catch (error) {
        console.error('Detailed error:', error);
        res.status(500).json({
            error: 'Failed to convert image',
            details: error.message
        });
    }
});

app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        // Here you would typically upload to a cloud storage service
        // For now, we'll just return a local URL
        const imageUrl = `http://localhost:3000/uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            imageUrl: imageUrl
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'Failed to upload image',
            details: error.message
        });
    }
});

// Add the status checking endpoint
app.get('/api/conversion-status/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        console.log('Checking status for task:', taskId);
        
        const statusResponse = await fetch(`https://api.meshy.ai/v1/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.MESHY_API_KEY}`,
                'Accept': 'application/json'
            }
        });

        const statusData = await statusResponse.json();
        console.log('Status check response:', statusData);

        res.json(statusData);
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({
            error: 'Failed to check conversion status',
            details: error.message
        });
    }
});

// ... rest of your server code ...

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const clients = new Map();

wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('Received WebSocket message:', data);

            if (data.type === 'connection') {
                clients.set(ws, data.username);
                console.log(`${data.username} connected to chat`);
                
                broadcastMessage({
                    type: 'system',
                    message: `${data.username} joined the chat`
                });
            } else if (data.type === 'chat') {
                broadcastMessage({
                    type: 'chat',
                    username: clients.get(ws),
                    message: data.message
                });
            }
        } catch (error) {
            console.error('WebSocket message processing error:', error);
        }
    });

    ws.on('close', () => {
        const username = clients.get(ws);
        if (username) {
            console.log(`${username} disconnected from chat`);
            broadcastMessage({
                type: 'system',
                message: `${username} left the chat`
            });
            clients.delete(ws);
        }
    });
});

// Helper function to broadcast messages
function broadcastMessage(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocketServer.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

