const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL } = require('url');
const { exec } = require('child_process');

// Helper function to resolve redirects (for PPC links) using curl
function resolveRedirect(url) {
    return new Promise((resolve) => {
        // Use NUL for Windows, /dev/null for others
        const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
        // Command to follow redirects and output only the effective URL
        const command = `curl -w "%{url_effective}" -o ${nullDevice} -s -L "${url}"`;

        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error resolving redirect with curl for ${url.substring(0, 50)}...:`, error.message);
                resolve(url); // Return original on error
                return;
            }

            const resolvedUrl = stdout.trim();
            if (resolvedUrl && resolvedUrl !== url) {
                resolve(resolvedUrl);
            } else {
                resolve(url);
            }
        });
    });
}

// Helper function to clean Clutch URLs
async function getCleanUrl(rawUrl) {
    if (!rawUrl || rawUrl === 'N/A') return 'N/A';

    try {
        // Check if it's a Clutch redirect URL
        if (rawUrl.includes('clutch.co/redirect')) {
            const urlObj = new URL(rawUrl);
            const nestedU = urlObj.searchParams.get('u');

            if (nestedU) {
                // If it's a PPC link (pointing to ppc.clutch.co), resolve the redirect
                if (nestedU.includes('ppc.clutch.co')) {
                    const resolved = await resolveRedirect(nestedU);
                    return resolved;
                }
                // Otherwise validation/standard link, just return the nested URL
                return nestedU;
            }
        }

        return rawUrl;
    } catch (e) {
        console.warn(`Failed to clean URL ${rawUrl}:`, e.message);
        return rawUrl;
    }
}

async function startScraping(startUrl, pageLimit) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-http2',
            '--disable-features=IsolateOrigins,site-per-process'
        ],
        ignoreHTTPSErrors: true
    });
    const page = await browser.newPage();

    // Set viewport and user agent to mimic a real user
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    let allCompanies = [];
    let currentUrl = startUrl;
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = pageLimit ? parseInt(pageLimit) : Infinity;

    console.log(`Starting scraper on: ${startUrl} with limit: ${maxPages === Infinity ? 'Unlimited' : maxPages}`);

    try {
        while (hasNextPage) {
            if (pageCount >= maxPages) {
                console.log(`Reached page limit of ${maxPages}. Stopping.`);
                break;
            }

            pageCount++;
            console.log(`Scraping page ${pageCount}: ${currentUrl}`);

            try {
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            } catch (err) {
                console.error(`Failed to load page ${currentUrl}:`, err.message);
                break;
            }

            // Wait for list to load
            try {
                await page.waitForSelector('.provider-row', { timeout: 10000 });
            } catch (e) {
                console.log("No provider rows found. Might be empty or blocked.");
                break;
            }

            // Extract raw data from the page
            const rawCompanies = await page.evaluate(() => {
                const rows = document.querySelectorAll('.provider-row');
                const data = [];

                rows.forEach(row => {
                    const nameEl = row.querySelector('.provider__title .provider__title-link');
                    const websiteEl = row.querySelector('.website-link__item');
                    const ratingEl = row.querySelector('.sg-rating__number');
                    const reviewCountEl = row.querySelector('.sg-rating__reviews');
                    const locationEl = row.querySelector('.location');
                    const hourlyRateEl = row.querySelector('.hourly-rate');
                    const minProjectReleaseEl = row.querySelector('.min-project-size');
                    const employeesEl = row.querySelector('.employees-count');

                    data.push({
                        name: nameEl ? nameEl.innerText.trim() : 'N/A',
                        rawWebsite: websiteEl ? websiteEl.href : 'N/A', // Get raw href
                        rating: ratingEl ? ratingEl.innerText.trim() : 'N/A',
                        reviewCount: reviewCountEl ? reviewCountEl.innerText.replace(/\s+/g, ' ').trim() : 'N/A',
                        location: locationEl ? locationEl.innerText.trim() : 'N/A',
                        hourlyRate: hourlyRateEl ? hourlyRateEl.innerText.trim() : 'N/A',
                        minProjectSize: minProjectReleaseEl ? minProjectReleaseEl.innerText.trim() : 'N/A',
                        employees: employeesEl ? employeesEl.innerText.trim() : 'N/A',
                        profileUrl: nameEl ? nameEl.href : 'N/A'
                    });
                });
                return data;
            });

            console.log(`Found ${rawCompanies.length} companies. Processing URLs sequentially...`);

            const processedCompanies = [];
            for (const company of rawCompanies) {
                // Pass browser instance for redirect resolution
                const cleanWebsite = await getCleanUrl(company.rawWebsite);
                processedCompanies.push({
                    ...company,
                    website: cleanWebsite
                });
                // Small delay not strictly necessary for curl but good practice
                if (company.rawWebsite && company.rawWebsite.includes('clutch.co/redirect')) {
                    await new Promise(r => setTimeout(r, 200));
                }
            }

            allCompanies = allCompanies.concat(processedCompanies);
            console.log(`Processed ${processedCompanies.length} companies on page ${pageCount}. Total: ${allCompanies.length}`);

            // Check for next page
            const nextButton = await page.$('.pagination .next a');
            if (nextButton && pageCount < maxPages) {
                // Get the href directly to navigate
                const nextUrl = await page.evaluate(el => el.href, nextButton);
                currentUrl = nextUrl;
                // Add a small delay to be polite
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.log("No next page button found or limit reached. Stopping.");
                hasNextPage = false;
            }
        }
    } catch (error) {
        console.error("Error during scraping:", error);
    } finally {
        await browser.close();
    }

    // Export to CSV
    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `clutch_data_${timestamp}.csv`;
    const filePath = path.join(downloadsDir, filename);

    const csvWriter = createCsvWriter({
        path: filePath,
        header: [
            { id: 'name', title: 'Company Name' },
            { id: 'website', title: 'Website URL' },
            { id: 'rating', title: 'Rating' },
            { id: 'reviewCount', title: 'Reviews' },
            { id: 'location', title: 'Location' },
            { id: 'hourlyRate', title: 'Hourly Rate' },
            { id: 'minProjectSize', title: 'Min Project Size' },
            { id: 'employees', title: 'Employees' },
            { id: 'profileUrl', title: 'Clutch Profile' }
        ]
    });

    await csvWriter.writeRecords(allCompanies);
    console.log(`CSV saved to: ${filePath}`);

    return filePath;
}

module.exports = { startScraping };
