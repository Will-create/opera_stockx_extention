// Optimized StockX Scraper with Anti-Captcha Measures
class OptimizedScraper {
    constructor() {
        this.config = {
            selectors: [
                'button[data-testid="size-selector-button"]',
                'div[data-component="size-selector"] button',
                'button[class*="size"]'
            ],
            delays: {
                min: 3000,
                max: 8000,
                processing: 1500,
                idle: 15000 // Every 15 pages
            },
            timeouts: {
                extraction: 30000,
                navigation: 5000
            },
            userAgents: [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
            ]
        };
        
        this.storageKey = `scraper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.pageCount = 0;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.handleInit());
        } else {
            this.handleInit();
        }
    }

    handleInit() {
        const storedData = this.getStoredData();
        if (storedData?.items?.length > 0) {
            console.log('[Scraper] Resuming scraping...');
            this.simulateHumanBehavior(() => {
                this.processCurrentItem(storedData);
            });
        }
    }

    // Anti-captcha: Simulate human behavior
    simulateHumanBehavior(callback) {
        // Random scroll
        const scrollY = Math.random() * 300;
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
        
        // Random mouse movement simulation
        this.simulateMouseMovement();
        
        // Random delay
        const delay = this.getRandomDelay();
        setTimeout(callback, delay);
    }

    simulateMouseMovement() {
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight,
            bubbles: true
        });
        document.dispatchEvent(mouseEvent);
    }

    getRandomDelay(min = this.config.delays.min, max = this.config.delays.max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Rotate user agent periodically
    rotateUserAgent() {
        if (Math.random() < 0.1) { // 10% chance
            const randomUA = this.config.userAgents[Math.floor(Math.random() * this.config.userAgents.length)];
            Object.defineProperty(navigator, 'userAgent', {
                get: () => randomUA,
                configurable: true
            });
        }
    }

    handleNewData(payload) {
        console.log('[Scraper] Starting new scraping session');
        
        const data = {
            items: payload.items.slice(0, payload.sampleSize || payload.items.length),
            currentIndex: 0,
            results: [],
            startTime: Date.now()
        };
        
        this.storeData(data);
        this.rotateUserAgent();
        this.processCurrentItem(data);
    }

    processCurrentItem(data) {
        if (data.currentIndex >= data.items.length) {
            this.completeProcessing(data);
            return;
        }

        const currentItem = data.items[data.currentIndex];
        console.log(`[Scraper] Processing ${data.currentIndex + 1}/${data.items.length}: ${currentItem.link}`);

        // Anti-captcha: Add idle period every 15 pages
        if (this.pageCount > 0 && this.pageCount % 15 === 0) {
            console.log('[Scraper] Taking idle break...');
            setTimeout(() => {
                this.extractAndNavigate(data, currentItem);
            }, this.config.delays.idle);
        } else {
            this.extractAndNavigate(data, currentItem);
        }
        
        this.pageCount++;
    }

    extractAndNavigate(data, currentItem) {
        this.extractSizeData((sizeData) => {
            const result = {
                url: window.location.href,
                item: currentItem,
                data: sizeData,
                success: sizeData?.length > 0,
                timestamp: Date.now(),
                pageTitle: document.title
            };

            data.results.push(result);
            data.currentIndex++;
            this.storeData(data);

            if (sizeData?.length > 0) {
                window.postMessage({
                    source: 'injected-script',
                    type: 'SIZE_DATA_EXTRACTED',
                    data: sizeData,
                    url: window.location.href,
                    progress: {
                        current: data.currentIndex,
                        total: data.items.length
                    }
                }, '*');
            }

            // Navigate with human-like delay
            this.simulateHumanBehavior(() => {
                if (data.currentIndex < data.items.length) {
                    const nextItem = data.items[data.currentIndex];
                    window.location.href = nextItem.link;
                } else {
                    this.processCurrentItem(data);
                }
            });
        });
    }

    extractSizeData(callback) {
        let resolved = false;
        
        const resolveOnce = (data) => {
            if (!resolved) {
                resolved = true;
                callback(data);
            }
        };

        // Single strategy with MutationObserver
        this.waitForElements(this.config.selectors, (buttons) => {
            if (buttons?.length > 0) {
                const sizeData = this.parseSizeButtons(buttons);
                resolveOnce(sizeData);
            } else {
                resolveOnce([]);
            }
        });

        // Timeout fallback
        setTimeout(() => resolveOnce([]), this.config.timeouts.extraction);
    }

    waitForElements(selectors, callback) {
        // Check if elements already exist
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                callback(elements);
                return;
            }
        }

        // Use MutationObserver to wait for elements
        const observer = new MutationObserver(() => {
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    observer.disconnect();
                    callback(elements);
                    return;
                }
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        // Cleanup observer after timeout
        setTimeout(() => {
            observer.disconnect();
            callback(null);
        }, this.config.timeouts.extraction);
    }

    parseSizeButtons(buttons) {
        const sizeData = [];
        const sizeMap = this.getSizeMap();

        buttons.forEach((button, index) => {
            try {
                // Simulate hover before processing
                button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                
                const buttonText = button.textContent.trim();
                const sizeLabel = button.querySelector('[data-testid="selector-label"]');
                const priceLabel = button.querySelector('[data-testid="selector-secondary-label"]');
                
                let sizeText = sizeLabel?.textContent.trim() || buttonText.split(/\s+/)[0];
                let priceText = priceLabel?.textContent.trim() || buttonText.split(/\s+/).pop();

                // Process size
                const euSize = this.extractEUSize(sizeText, sizeMap);
                if (euSize) {
                    sizeData.push({
                        size: parseFloat(euSize),
                        price: this.extractPrice(priceText),
                        priceFormatted: priceText,
                        sizeText: `EU ${euSize}`,
                        buttonIndex: index
                    });
                }
            } catch (error) {
                console.warn(`[Scraper] Error processing button ${index}:`, error);
            }
        });

        return sizeData.sort((a, b) => a.size - b.size);
    }

    extractEUSize(sizeText, sizeMap) {
        if (!sizeText) return null;
        
        // Direct EU size
        if (sizeText.includes('EU')) {
            return sizeText.replace('EU', '').trim();
        }
        
        // Convert US to EU
        const usMatch = sizeText.match(/(\d+\.?\d*)/);
        if (usMatch) {
            const usSize = usMatch[1];
            return sizeMap[usSize] || null;
        }
        
        return null;
    }

    extractPrice(priceText) {
        if (!priceText) return null;
        
        if (priceText.toLowerCase().includes('bid') || 
            priceText.toLowerCase().includes('ask') || 
            priceText.toLowerCase().includes('offre')) {
            return 'OFFRE';
        }
        
        const priceMatch = priceText.match(/[\d,.]+/);
        return priceMatch ? parseInt(priceMatch[0].replace(/[^\d]/g, '')) : priceText;
    }

    getSizeMap() {
        return {
            '4': '36.5', '4.5': '37.5', '5': '38', '5.5': '38.5',
            '6': '39', '6.5': '40', '7': '40.5', '7.5': '41',
            '8': '42', '8.5': '42.5', '9': '43', '9.5': '44',
            '10': '44.5', '10.5': '45', '11': '45.5', '11.5': '46',
            '12': '47', '13': '48', '14': '49', '15': '50'
        };
    }

    completeProcessing(data) {
        console.log('[Scraper] Scraping completed!');
        
        const summary = {
            total: data.items.length,
            successful: data.results.filter(r => r.success).length,
            failed: data.results.filter(r => !r.success).length,
            duration: Date.now() - data.startTime
        };

        window.postMessage({
            source: 'injected-script',
            type: 'SCRAPING_COMPLETED',
            results: data.results,
            summary
        }, '*');

        this.clearData();
    }

    // Simplified storage methods
    storeData(data) {
        try {
            const storageData = {
                ...data,
                timestamp: Date.now(),
                url: window.location.href
            };
            
            // Use memory storage instead of localStorage to avoid detection
            window.scraperData = storageData;
        } catch (error) {
            console.error('[Scraper] Storage failed:', error);
        }
    }

    getStoredData() {
        try {
            return window.scraperData || null;
        } catch (error) {
            console.error('[Scraper] Failed to retrieve data:', error);
            return null;
        }
    }

    clearData() {
        try {
            delete window.scraperData;
        } catch (error) {
            console.error('[Scraper] Failed to clear data:', error);
        }
    }

    // Static utility methods
    static getResults() {
        return window.scraperData?.results || [];
    }

    static clearAll() {
        delete window.scraperData;
        console.log('[Scraper] All data cleared');
    }
}

// Initialize scraper
const scraper = new OptimizedScraper();

// Message listener
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source === 'content-script' && event.data?.type === 'DATA_READY') {
        scraper.handleNewData(event.data.payload);
    }
});

// Export utilities
window.ScraperUtils = {
    getResults: OptimizedScraper.getResults,
    clearAll: OptimizedScraper.clearAll
};