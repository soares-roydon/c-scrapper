const express = require('express');
const cors = require('cors');
const path = require('path');
const { startScraping } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint to start scraping
app.post('/api/scrape', async (req, res) => {
    const { url, pageLimit } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Received scrape request for: ${url} with limit: ${pageLimit || 'Unlimited'}`);

    try {
        const filePath = await startScraping(url, pageLimit);
        res.json({ success: true, downloadUrl: `/download/${path.basename(filePath)}` });
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Scraping failed', details: error.message });
    }
});

// Endpoint to download the file
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const file = path.join(__dirname, 'downloads', filename);
    res.download(file);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

