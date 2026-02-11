const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL } = require('url');

/**
 * Resolve redirect safely (Render-safe)
 */
function resolveRedirect(url) {
    return new Promise((resolve) => {
        try {
            const req = https.get(url, (res) => {
                if (res.headers.location) {
                    resolve(res.headers.location);
                } else {
                    resolve(url);
                }
            });

            req.on('error', () => resolve(url));

            req.setTimeout(10000, () => {
                req.destroy();
                resolve(url);
            });

        } catch (err) {
            resolve(url);
        }
    });
}

/**
 * Clean Clutch redirect URLs
 */
async function getCleanUrl(rawUrl) {
    if (!rawUrl || rawUrl === 'N/A') return 'N/A';

    try {
        if (rawUrl.includes('clutch.co/redirect')) {
            const urlObj = new URL(rawUrl);
            const nestedU = urlObj.searchParams.get('u');

            if (nestedU) {
                if (nestedU.includes('ppc.clutch.co')) {
                    return await resolveRedirect(nestedU);
                }
                return nestedU;
            }
        }

        return rawUrl;
    } catch (e) {
        return rawUrl;
    }
}

/**
 * Main Scraper Function
 */
async function startScraping(startUrl, pageLimit) {

    // 🚀 IMPORTANT: No executablePath
    const browser = await puppeteer.launch({
        headless: "new",   // important for Puppeteer v20+
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run",
            "--no-zygote",
            "--single-process"
        ]
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1366, height: 768 });

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36"
    );

    let allCompanies = [];
    let currentUrl = startUrl;
    let hasNextPage = true;
    let pageCount = 0;

    const maxPages = pageLimit ? parseInt(pageLimit) : 3; // safer default

    console.log(`Starting scraper on: ${startUrl}`);

    try {
        while (hasNextPage && pageCount < maxPages) {

            pageCount++;
            console.log(`Scraping page ${pageCount}: ${currentUrl}`);

            try {
                await page.goto(currentUrl, {
                    waitUntil: "networkidle2",
                    timeout: 60000
                });
            } catch (err) {
                console.error("Page load failed:", err.message);
                break;
            }

            try {
                await page.waitForSelector(".provider-row", { timeout: 15000 });
            } catch (err) {
                console.log("No provider rows found.");
                break;
            }

            const rawCompanies = await page.evaluate(() => {
                const rows = document.querySelectorAll(".provider-row");
                const data = [];

                rows.forEach(row => {
                    const nameEl = row.querySelector(".provider__title .provider__title-link");
                    const websiteEl = row.querySelector(".website-link__item");
                    const ratingEl = row.querySelector(".sg-rating__number");
                    const reviewCountEl = row.querySelector(".sg-rating__reviews");
                    const locationEl = row.querySelector(".location");
                    const hourlyRateEl = row.querySelector(".hourly-rate");
                    const minProjectEl = row.querySelector(".min-project-size");
                    const employeesEl = row.querySelector(".employees-count");

                    data.push({
                        name: nameEl ? nameEl.innerText.trim() : "N/A",
                        rawWebsite: websiteEl ? websiteEl.href : "N/A",
                        rating: ratingEl ? ratingEl.innerText.trim() : "N/A",
                        reviewCount: reviewCountEl
                            ? reviewCountEl.innerText.replace(/\s+/g, " ").trim()
                            : "N/A",
                        location: locationEl ? locationEl.innerText.trim() : "N/A",
                        hourlyRate: hourlyRateEl ? hourlyRateEl.innerText.trim() : "N/A",
                        minProjectSize: minProjectEl ? minProjectEl.innerText.trim() : "N/A",
                        employees: employeesEl ? employeesEl.innerText.trim() : "N/A",
                        profileUrl: nameEl ? nameEl.href : "N/A"
                    });
                });

                return data;
            });

            console.log(`Found ${rawCompanies.length} companies`);

            for (const company of rawCompanies) {
                const cleanWebsite = await getCleanUrl(company.rawWebsite);

                allCompanies.push({
                    name: company.name,
                    website: cleanWebsite,
                    rating: company.rating,
                    reviewCount: company.reviewCount,
                    location: company.location,
                    hourlyRate: company.hourlyRate,
                    minProjectSize: company.minProjectSize,
                    employees: company.employees,
                    profileUrl: company.profileUrl
                });

                await new Promise(r => setTimeout(r, 200));
            }

            const nextButton = await page.$(".pagination .next a");

            if (nextButton && pageCount < maxPages) {
                currentUrl = await page.evaluate(el => el.href, nextButton);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                hasNextPage = false;
            }
        }

    } catch (error) {
        console.error("Scraping error:", error);
    } finally {
        await browser.close();
    }

    // 📁 Save CSV
    const downloadsDir = path.join(__dirname, "downloads");
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `clutch_data_${timestamp}.csv`;
    const filePath = path.join(downloadsDir, filename);

    const csvWriter = createCsvWriter({
        path: filePath,
        header: [
            { id: "name", title: "Company Name" },
            { id: "website", title: "Website URL" },
            { id: "rating", title: "Rating" },
            { id: "reviewCount", title: "Reviews" },
            { id: "location", title: "Location" },
            { id: "hourlyRate", title: "Hourly Rate" },
            { id: "minProjectSize", title: "Min Project Size" },
            { id: "employees", title: "Employees" },
            { id: "profileUrl", title: "Clutch Profile" }
        ]
    });

    await csvWriter.writeRecords(allCompanies);

    console.log(`CSV saved to: ${filePath}`);

    return filePath;
}

module.exports = { startScraping };
