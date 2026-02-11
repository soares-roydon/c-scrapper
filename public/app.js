document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const clutchUrlInput = document.getElementById('clutchUrl');
    const statusArea = document.getElementById('statusArea');
    const resultArea = document.getElementById('resultArea');
    const errorArea = document.getElementById('errorArea');
    const statusText = document.getElementById('statusText');
    const errorText = document.getElementById('errorText');
    const downloadLink = document.getElementById('downloadLink');

    scrapeBtn.addEventListener('click', async () => {
        const url = clutchUrlInput.value.trim();
        const pageLimit = document.getElementById('pageLimit').value;

        if (!url) {
            showError("Please enter a valid Clutch URL.");
            return;
        }

        // Reset UI
        resultArea.classList.add('hidden');
        errorArea.classList.add('hidden');
        statusArea.classList.remove('hidden');
        scrapeBtn.disabled = true;
        statusText.textContent = "Connecting to scraper...";

        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url, pageLimit })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Unknown server error');
            }

            // Success
            statusArea.classList.add('hidden');
            resultArea.classList.remove('hidden');

            downloadLink.href = data.downloadUrl;
            downloadLink.textContent = "Download CSV";

        } catch (error) {
            console.error(error);
            statusArea.classList.add('hidden');
            showError(error.message);
        } finally {
            scrapeBtn.disabled = false;
        }
    });

    function showError(msg) {
        errorArea.classList.remove('hidden');
        errorText.textContent = msg;
    }
});
