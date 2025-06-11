class OptimizedScraper {
    constructor() {
        this.config = {
            selectors: [
                'button[data-testid="size-selector-button"]',
                'div[data-component="size-selector"] button',
                'button[class*="size"]',
                '.size-selector button',
                '[data-automation-id*="size"] button'
            ],
            delays: {
                min: 2000,
                max: 5000,
                processing: 1000,
                idle: 10000,
                navigation: 3000
            },
            timeouts: {
                extraction: 15000,
                navigation: 8000,
                pageLoad: 10000
            },
            userAgents: [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
            ],
            maxRetries: 3,
            idleInterval: 10 // Take break every 10 pages
        };
        
        this.storageKey = 'scraper_session_data';
        this.pageCount = 0;
        this.retryCount = 0;
        this.isProcessing = false;
        this.currentTimeout = null;
        
        this.init();
    }

    init() {
        console.log('[Scraper] Initializing...');
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.handleInit());
        } else {
            this.handleInit();
        }
    }

    handleInit() {
        // Check for existing session data first
        const storedData = this.getStoredData();
        if (storedData && storedData.items && storedData.items.length > 0 && storedData.status === 'active') {
            console.log(`[Scraper] Resuming active session: ${storedData.currentIndex + 1}/${storedData.items.length}`);
            
            // Wait a bit longer for page to fully load before resuming
            setTimeout(() => {
                this.resumeProcessing(storedData);
            }, this.config.delays.navigation);
        } else {
            console.log('[Scraper] No active session found, waiting for new data...');
        }
    }

    resumeProcessing(data) {
        if (this.isProcessing) {
            console.log('[Scraper] Already processing, skipping...');
            return;
        }

        this.isProcessing = true;
        
        // Small delay before resuming
        setTimeout(() => {
            this.processCurrentItem(data);
        }, this.config.delays.processing);
    }

    handleNewData(payload) {
        console.log('[Scraper] Received new data payload');
        
        // Check if we already have an active session - if so, ignore new data
        const existingData = this.getStoredData();
        if (existingData && existingData.status === 'active') {
            console.log('[Scraper] Active session exists, ignoring new data payload');
            return;
        }
        
        if (!payload || !payload.items || !Array.isArray(payload.items)) {
            console.error('[Scraper] Invalid payload received');
            return;
        }

        const data = {
            items: payload.items.slice(0, payload.sampleSize || payload.items.length),
            currentIndex: 0,
            results: [],
            startTime: Date.now(),
            sessionId: this.generateSessionId(),
            status: 'active'
        };
        
        console.log(`[Scraper] Starting new session with ${data.items.length} items`);
        
        this.storeData(data);
        this.rotateUserAgent();
        this.pageCount = 0;
        this.retryCount = 0;
        this.isProcessing = true;
        
        // Start processing with delay
        setTimeout(() => {
            this.processCurrentItem(data);
        }, this.config.delays.processing);
    }

    processCurrentItem(data) {
        if (!data || data.currentIndex >= data.items.length) {
            this.completeProcessing(data);
            return;
        }

        const currentItem = data.items[data.currentIndex];
        const progress = `${data.currentIndex + 1}/${data.items.length}`;
        
        console.log(`[Scraper] Processing ${progress}: ${currentItem.name || currentItem.link}`);

        // Check if we need an idle break
        if (this.pageCount > 0 && this.pageCount % this.config.idleInterval === 0) {
            console.log('[Scraper] Taking idle break...');
            setTimeout(() => {
                this.extractCurrentPageData(data, currentItem);
            }, this.config.delays.idle);
        } else {
            this.extractCurrentPageData(data, currentItem);
        }
        
        this.pageCount++;
    }

    extractCurrentPageData(data, currentItem) {
        // Simulate human behavior
        this.simulateHumanBehavior();
        
        // Extract size data from current page
        this.extractSizeData((sizeData) => {
            const result = {
                url: window.location.href,
                item: currentItem,
                data: sizeData || [],
                success: sizeData && sizeData.length > 0,
                timestamp: Date.now(),
                pageTitle: document.title,
                attempt: this.retryCount + 1
            };

            data.results.push(result);
            
            // Send progress update
            this.sendProgressUpdate(result, data);
            
            // Move to next item
            data.currentIndex++;
            this.storeData(data);
            
            // Navigate to next item or complete
            this.navigateToNext(data);
        });
    }

    extractSizeData(callback) {
        let resolved = false;
        let observer = null;
        
        const resolveOnce = (data) => {
            if (resolved) return;
            resolved = true;
            
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            
            if (this.currentTimeout) {
                clearTimeout(this.currentTimeout);
                this.currentTimeout = null;
            }
            
            callback(data);
        };

        // Check for existing elements first
        const existingElements = this.findSizeElements();
        if (existingElements && existingElements.length > 0) {
            const sizeData = this.parseSizeButtons(existingElements);
            resolveOnce(sizeData);
            return;
        }

        // Wait for elements to appear
        observer = new MutationObserver(() => {
            const elements = this.findSizeElements();
            if (elements && elements.length > 0) {
                const sizeData = this.parseSizeButtons(elements);
                resolveOnce(sizeData);
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false
        });

        // Timeout fallback
        this.currentTimeout = setTimeout(() => {
            console.warn('[Scraper] Extraction timeout reached');
            resolveOnce([]);
        }, this.config.timeouts.extraction);
    }

    findSizeElements() {
        for (const selector of this.config.selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                if (elements && elements.length > 0) {
                    return Array.from(elements);
                }
            } catch (error) {
                console.warn(`[Scraper] Selector error: ${selector}`, error);
            }
        }
        return null;
    }

    parseSizeButtons(buttons) {
        const sizeData = [];
        const sizeMap = this.getSizeMap();

        buttons.forEach((button, index) => {
            try {
                // Simulate interaction
                this.simulateButtonInteraction(button);
                
                const buttonText = button.textContent?.trim() || '';
                const sizeLabel = button.querySelector('[data-testid="selector-label"]');
                const priceLabel = button.querySelector('[data-testid="selector-secondary-label"]');
                
                let sizeText = sizeLabel?.textContent?.trim() || buttonText.split(/\s+/)[0] || '';
                let priceText = priceLabel?.textContent?.trim() || buttonText.split(/\s+/).pop() || '';

                const euSize = this.extractEUSize(sizeText, sizeMap);
                if (euSize) {
                    sizeData.push({
                        size: parseFloat(euSize),
                        price: this.extractPrice(priceText),
                        priceFormatted: priceText,
                        sizeText: `EU ${euSize}`,
                        buttonIndex: index,
                        rawText: buttonText
                    });
                }
            } catch (error) {
                console.warn(`[Scraper] Button parsing error ${index}:`, error);
            }
        });

        return sizeData.sort((a, b) => a.size - b.size);
    }

    navigateToNext(data) {
        if (data.currentIndex >= data.items.length) {
            this.processCurrentItem(data);
            return;
        }

        const nextItem = data.items[data.currentIndex];
        const delay = this.getRandomDelay();
        
        console.log(`[Scraper] Navigating to next item in ${delay}ms`);
        
        setTimeout(() => {
            try {
                window.location.href = nextItem.link;
            } catch (error) {
                console.error('[Scraper] Navigation error:', error);
                // Retry or skip
                this.handleNavigationError(data);
            }
        }, delay);
    }

    handleNavigationError(data) {
        this.retryCount++;
        
        if (this.retryCount < this.config.maxRetries) {
            console.log(`[Scraper] Retrying navigation (${this.retryCount}/${this.config.maxRetries})`);
            setTimeout(() => {
                this.navigateToNext(data);
            }, this.config.delays.navigation);
        } else {
            console.error('[Scraper] Max retries reached, skipping item');
            data.currentIndex++;
            this.retryCount = 0;
            this.storeData(data);
            this.processCurrentItem(data);
        }
    }

    // Human behavior simulation
    simulateHumanBehavior() {
        // Random scroll
        const scrollY = Math.random() * 200 + 100;
        window.scrollTo({ 
            top: scrollY, 
            behavior: 'smooth' 
        });
        
        // Mouse movement
        this.simulateMouseMovement();
    }

    simulateMouseMovement() {
        try {
            const event = new MouseEvent('mousemove', {
                clientX: Math.random() * window.innerWidth * 0.8 + window.innerWidth * 0.1,
                clientY: Math.random() * window.innerHeight * 0.8 + window.innerHeight * 0.1,
                bubbles: true
            });
            document.dispatchEvent(event);
        } catch (error) {
            // Ignore mouse simulation errors
        }
    }

    simulateButtonInteraction(button) {
        try {
            button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            setTimeout(() => {
                button.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            }, 100);
        } catch (error) {
            // Ignore interaction errors
        }
    }

    getRandomDelay(min = this.config.delays.min, max = this.config.delays.max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    rotateUserAgent() {
        if (Math.random() < 0.15) { // 15% chance
            try {
                const randomUA = this.config.userAgents[
                    Math.floor(Math.random() * this.config.userAgents.length)
                ];
                Object.defineProperty(navigator, 'userAgent', {
                    get: () => randomUA,
                    configurable: true
                });
            } catch (error) {
                // User agent rotation not critical
            }
        }
    }

    // Size conversion utilities
    extractEUSize(sizeText, sizeMap) {
        if (!sizeText) return null;
        
        // Clean the text
        sizeText = sizeText.toString().toUpperCase().trim();
        
        // Direct EU size
        if (sizeText.includes('EU')) {
            const match = sizeText.match(/EU\s*(\d+\.?\d*)/);
            return match ? match[1] : null;
        }
        
        // Direct number (assume EU)
        const directMatch = sizeText.match(/^(\d+\.?\d*)$/);
        if (directMatch) {
            return directMatch[1];
        }
        
        // US to EU conversion
        const usMatch = sizeText.match(/US\s*(\d+\.?\d*)|(\d+\.?\d*)\s*US/);
        if (usMatch) {
            const usSize = usMatch[1] || usMatch[2];
            return sizeMap[usSize] || null;
        }
        
        // Generic number extraction
        const numberMatch = sizeText.match(/(\d+\.?\d*)/);
        if (numberMatch) {
            const size = numberMatch[1];
            // If it's likely a US size (4-15 range), convert it
            const numSize = parseFloat(size);
            if (numSize >= 4 && numSize <= 15) {
                return sizeMap[size] || null;
            }
            return size; // Assume EU
        }
        
        return null;
    }

    extractPrice(priceText) {
        if (!priceText) return null;
        
        const lowerText = priceText.toLowerCase();
        
        // Check for bid/ask indicators
        if (lowerText.includes('bid') || 
            lowerText.includes('ask') || 
            lowerText.includes('offre') ||
            lowerText.includes('offer')) {
            return 'OFFER';
        }
        
        // Extract numeric price
        const priceMatch = priceText.match(/[\d,.\s]+/);
        if (priceMatch) {
            const cleanPrice = priceMatch[0].replace(/[^\d]/g, '');
            return cleanPrice ? parseInt(cleanPrice) : null;
        }
        
        return priceText;
    }

    getSizeMap() {
        // US to EU size conversion
        return {
            '4': '36.5', '4.5': '37.5', '5': '38', '5.5': '38.5',
            '6': '39', '6.5': '40', '7': '40.5', '7.5': '41',
            '8': '42', '8.5': '42.5', '9': '43', '9.5': '44',
            '10': '44.5', '10.5': '45', '11': '45.5', '11.5': '46',
            '12': '47', '12.5': '47.5', '13': '48', '13.5': '48.5',
            '14': '49', '15': '50', '16': '51'
        };
    }

    // Progress and completion
    sendProgressUpdate(result, data) {
        try {
            window.postMessage({
                source: 'injected-script',
                type: 'SIZE_DATA_EXTRACTED',
                data: result.data,
                url: result.url,
                progress: {
                    current: data.currentIndex,
                    total: data.items.length,
                    percentage: Math.round((data.currentIndex / data.items.length) * 100)
                },
                success: result.success
            }, '*');
        } catch (error) {
            console.error('[Scraper] Progress update failed:', error);
        }
    }

    completeProcessing(data) {
        console.log('[Scraper] Scraping session completed!');
        
        this.isProcessing = false;
        
        const summary = {
            total: data.items.length,
            successful: data.results.filter(r => r.success).length,
            failed: data.results.filter(r => !r.success).length,
            duration: Date.now() - data.startTime,
            sessionId: data.sessionId
        };

        try {
            window.postMessage({
                source: 'injected-script',
                type: 'SCRAPING_COMPLETED',
                results: data.results,
                summary: summary
            }, '*');
        } catch (error) {
            console.error('[Scraper] Completion message failed:', error);
        }

        // Clear session data
        this.clearData();
        
        console.log(`[Scraper] Summary: ${summary.successful}/${summary.total} successful, Duration: ${Math.round(summary.duration/1000)}s`);
    }

    // Storage management (using localStorage for persistence across page reloads)
    storeData(data) {
        try {
            const storageData = {
                ...data,
                lastUpdate: Date.now(),
                currentUrl: window.location.href
            };
            
            // Use localStorage for persistence across page navigations
            localStorage.setItem(this.storageKey, JSON.stringify(storageData));
            
            // Also keep in memory for quick access
            window.scraperSessionData = storageData;
        } catch (error) {
            console.error('[Scraper] Storage failed:', error);
            // Fallback to memory only
            window.scraperSessionData = storageData;
        }
    }

    getStoredData() {
        try {
            // Try localStorage first
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                // Also update memory cache
                window.scraperSessionData = data;
                return data;
            }
            
            // Fallback to memory
            return window.scraperSessionData || null;
        } catch (error) {
            console.error('[Scraper] Data retrieval failed:', error);
            // Try memory as last resort
            return window.scraperSessionData || null;
        }
    }

    clearData() {
        try {
            localStorage.removeItem(this.storageKey);
            delete window.scraperSessionData;
        } catch (error) {
            console.error('[Scraper] Data clearing failed:', error);
            // At least clear memory
            delete window.scraperSessionData;
        }
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Public utility methods
    static getResults() {
        try {
            const stored = localStorage.getItem('scraper_session_data');
            if (stored) {
                const data = JSON.parse(stored);
                return data.results || [];
            }
            return window.scraperSessionData?.results || [];
        } catch (error) {
            return window.scraperSessionData?.results || [];
        }
    }

    static getStatus() {
        try {
            const stored = localStorage.getItem('scraper_session_data');
            let data = null;
            
            if (stored) {
                data = JSON.parse(stored);
            } else {
                data = window.scraperSessionData;
            }
            
            if (!data) return 'inactive';
            
            return {
                status: data.status || 'unknown',
                progress: data.currentIndex || 0,
                total: data.items?.length || 0,
                sessionId: data.sessionId,
                currentUrl: data.currentUrl
            };
        } catch (error) {
            return 'error';
        }
    }

    static clearAll() {
        try {
            localStorage.removeItem('scraper_session_data');
            delete window.scraperSessionData;
            console.log('[Scraper] All session data cleared');
        } catch (error) {
            delete window.scraperSessionData;
            console.log('[Scraper] Session data cleared (memory only)');
        }
    }
}

// Initialize the scraper
console.log('[Scraper] Loading optimized scraper...');
const scraper = new OptimizedScraper();

// Message listener for data from content script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data?.source === 'content-script' && event.data?.type === 'DATA_READY') {
        scraper.handleNewData(event.data.payload);
    }
});

// Export utilities to global scope
window.ScraperUtils = {
    getResults: OptimizedScraper.getResults,
    getStatus: OptimizedScraper.getStatus,
    clearAll: OptimizedScraper.clearAll
};

console.log('[Scraper] Optimized scraper ready!');