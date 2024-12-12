document.addEventListener('DOMContentLoaded', function() {
    // Button event listeners
    document.getElementById('testBtn').addEventListener('click', () => {
        window.location.href = 'test.html';
    });

    document.getElementById('vocabBtn').addEventListener('click', () => {
        window.location.href = 'vocab.html';
    });

    document.getElementById('assistantBtn').addEventListener('click', () => {
        window.location.href = 'assistant.html';
    });

    document.getElementById('modelsBtn').addEventListener('click', () => {
        window.location.href = 'models.html';
    });

    document.getElementById('flashcardBtn').addEventListener('click', () => {
        window.location.href = 'flashcards.html';
    });

    document.getElementById('studyNoteBtn').addEventListener('click', toggleStudyNote);

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('username');
        window.location.href = '/login.html';
    });

    // Study note functionality
    document.getElementById('studyNoteForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveNote();
    });

    document.getElementById('loadNotesBtn').addEventListener('click', function() {
        const notesList = document.getElementById('notesList');
        if (notesList.style.display === 'none') {
            loadNotes();
        } else {
            notesList.style.display = 'none';
        }
    });

    document.getElementById('summarizeBtn').addEventListener('click', summarizeYouTubeVideo);
});

// Your existing functions
function toggleStudyNote() {
    const panel = document.getElementById('studyNotePanel');
    panel.classList.toggle('active');
}

function saveNote() {
    const noteData = {
        title: document.getElementById('noteTitle').value,
        content: document.getElementById('noteContent').value,
        timestamp: new Date().toISOString()
    };

    let savedNotes = [];
    try {
        savedNotes = JSON.parse(localStorage.getItem('studyNotes')) || [];
        savedNotes.unshift(noteData);
        localStorage.setItem('studyNotes', JSON.stringify(savedNotes));
        
        const summaryStatus = document.getElementById('summaryStatus');
        summaryStatus.textContent = 'Note saved successfully!';
        summaryStatus.className = 'summary-status success';

        if (document.getElementById('notesList').style.display !== 'none') {
            loadNotes();
        }
    } catch (e) {
        console.error('Error saving notes:', e);
    }
}

function loadNotes() {
    // Your existing loadNotes function
}

async function summarizeYouTubeVideo(event) {
    // Your existing summarizeYouTubeVideo function
}

// Chat functionality
let username = localStorage.getItem('username');

async function sendMessage() {
    // Your existing sendMessage function
}

function appendMessage(type, content) {
    // Your existing appendMessage function
}

function initializeChat() {
    // Your existing initializeChat function
}

async function handleFiles(files) {
    for (const file of files) {
        console.log('Processing file type:', file.type);
        console.log('File name:', file.name);
        console.log('File size:', file.size);
        
        if (file.type.startsWith('image/')) {
            await handleImageFile(file);
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            console.log('PDF file detected');
            await handlePdfFile(file);
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || 
                   file.type === 'application/vnd.ms-powerpoint' ||
                   file.type === 'application/powerpoint' ||
                   file.type.includes('powerpoint')) {
            appendMessage('error', '❌ PowerPoint files are not yet supported. Please convert to PDF first.');
        } else {
            console.log('Invalid file type:', file.type);
            appendMessage('error', '❌ Please upload an image or PDF file. For PowerPoint files, please convert to PDF first.');
        }
    }
}

async function handlePdfFile(file) {
    try {
        console.log('Starting PDF processing');
        appendMessage('system', '📄 Processing PDF...');
        
        const arrayBuffer = await file.arrayBuffer();
        console.log('PDF loaded into buffer');
        
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        console.log('PDF parsed, number of pages:', pdfDoc.numPages);
        
        let fullText = '';

        // Extract text from each page
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            console.log(`Processing page ${i} of ${pdfDoc.numPages}`);
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + ' ';
        }

        console.log('PDF text extracted, length:', fullText.length);
        currentPdfContent = fullText;
        currentImage = null; // Reset image when new PDF is loaded

        // Get initial analysis of the PDF
        const response = await fetch('/api/analyze-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pdfContent: fullText
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        appendMessage('system', '📄 PDF loaded! You can now ask questions about it.');
        appendMessage('ai', data.analysis);

    } catch (error) {
        console.error('Detailed PDF processing error:', error);
        appendMessage('error', `❌ Failed to process PDF: ${error.message}`);
    }
}
