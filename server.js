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
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { createClient } from '@deepgram/sdk';
import fs from 'fs';
import wav from 'node-wav';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

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

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize Deepgram with the new v3 syntax
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

app.post('/api/convert-to-3d', async (req, res) => {
    try {
        const { image } = req.body;
        
        if (!image) {
            return res.status(400).json({ error: 'No image data provided' });
        }

        console.log('Starting 3D conversion process...');
        
        // Upload image to Cloudinary
        console.log('Uploading to Cloudinary...');
        const uploadResponse = await cloudinary.uploader.upload(image, {
            folder: '3d-conversions'
        });

        if (!uploadResponse.secure_url) {
            throw new Error('Failed to upload image to Cloudinary');
        }

        console.log('Image uploaded successfully:', uploadResponse.secure_url);

        // Verify Meshy API key
        if (!process.env.MESHY_API_KEY) {
            throw new Error('MESHY_API_KEY not configured');
        }

        // Create Meshy request
        const meshyRequest = {
            image_url: uploadResponse.secure_url,
            webhook_url: "",
            settings: {
                format: "glb"
            }
        };

        console.log('Sending request to Meshy API...');
        
        const meshyResponse = await fetch('https://api.meshy.ai/v1/image-to-3d', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MESHY_API_KEY}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(meshyRequest)
        });

        if (!meshyResponse.ok) {
            const errorData = await meshyResponse.json();
            console.error('Meshy API error:', errorData);
            throw new Error(`Meshy API error: ${errorData.message || 'Unknown error'}`);
        }

        const responseData = await meshyResponse.json();
        console.log('Meshy API Response:', responseData);

        res.json({
            success: true,
            taskId: responseData.result,
            status: 'processing'
        });

    } catch (error) {
        console.error('3D Conversion error:', error);
        res.status(500).json({
            error: 'Failed to convert image',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// Update your existing AI server endpoint
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

        // Ensure the reply is properly escaped for JSON
        const sanitizedReply = reply.replace(/[\n\r]/g, ' ').trim();

        console.log('AI response:', sanitizedReply);
        return res.json({ reply: sanitizedReply });

    } catch (error) {
        console.error('AI server error:', error.message);
        console.error('Stack trace:', error.stack);
        return res.status(500).json({ error: 'Failed to get AI response' });
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

        // Fetch video details from SerpApi
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
 [Extract 3-4 main topics from the video's description]

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

// Add this with your other API endpoints
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

// In your image conversion route
app.post('/api/convert-image', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        console.log('Received image URL:', imageUrl);
        
        // Your existing code...

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ 
            error: error.message,
            details: error.stack 
        });
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('chat message', async (data) => {
        try {
            console.log('Received message:', data);
            
            // Emit the user message back to all clients
            io.emit('chat message', {
                message: data.message,
                isAI: false
            });

            // Get Gemini model
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });

            // Generate response
            const result = await model.generateContent(data.message);
            const response = await result.response;
            const reply = response.text();

            // Emit AI response
            io.emit('chat message', {
                message: reply,
                isAI: true
            });

        } catch (error) {
            console.error('AI error:', error);
            socket.emit('error', { message: 'Failed to get AI response' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

app.get('/api/proxy-model', async (req, res) => {
    try {
        const modelUrl = req.query.url;
        if (!modelUrl) {
            return res.status(400).json({ error: 'No URL provided' });
        }

        console.log('Proxying model from:', modelUrl);

        const response = await fetch(modelUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch model: ${response.statusText}`);
        }

        // Forward the content type
        res.setHeader('Content-Type', response.headers.get('content-type'));
        
        // Stream the response
        response.body.pipe(res);

    } catch (error) {
        console.error('Model proxy error:', error);
        res.status(500).json({ error: 'Failed to proxy model' });
    }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        console.log('Received audio file:', req.file.path);

        // Read the audio file
        const audioFile = await fs.promises.readFile(req.file.path);

        // Get raw transcript from Deepgram
        const { result } = await deepgram.listen.prerecorded.transcribeFile(
            audioFile,
            {
                smart_format: true,
                model: 'general',
                language: 'en-US',
                mime_type: req.file.mimetype
            }
        );

        const rawTranscript = result.results?.channels[0]?.alternatives[0]?.transcript || '';
        console.log('Raw transcript:', rawTranscript);

        // Process through Gemini
        const prompt = `Please improve this transcribed text to make it more coherent and well-formatted, 
            while maintaining the original meaning. Fix any grammar issues and add proper punctuation:

            "${rawTranscript}"

            Return only the improved text without any explanations.`;

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const geminiResult = await model.generateContent(prompt);
        const improvedTranscript = await geminiResult.response.text();

        console.log('Improved transcript:', improvedTranscript);

        res.json({ transcript: improvedTranscript });

        // Clean up the temporary file
        await fs.promises.unlink(req.file.path);

    } catch (error) {
        console.error('Transcription error:', error);
        
        // Clean up file if it exists
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        }
        
        res.status(500).json({
            error: 'Failed to process audio',
            details: error.message
        });
    }
});

// ... rest of your server code ...

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

