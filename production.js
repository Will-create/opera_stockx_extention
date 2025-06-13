class OptimizedScraper {
// Public utility methods
static async getResults(tabId = null, dateKey = null, start = null, end = null) {
    try {
        const scraper = new OptimizedScraper();
        await scraper.initDB();
        
        if (tabId && dateKey && start && end) {
            // Get specific session results
            const extractedData = await scraper.getAllFromDB('extractedData', 'tabId', tabId);
            return extractedData.filter(item => 
                item.dateKey === dateKey && 
                item.start === start && 
                item.end === end
            ).map(item => item.result);
        } else {
            // Get current session results - fallback to memory
            return window.scraperSessionData?.results || [];
        }
    } catch (error) {
        console.error('[Scraper] Failed to get results:', error);
        return window.scraperSessionData?.results || [];
    }
}

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
    
    this.dbName = 'ScraperDB';
    this.dbVersion = 1;
    this.db = null;
    this.storageKeyPrefix = 'scraper_session';
    this.dataStorageKeyPrefix = 'scraper_data';
    this.currentStorageKey = null;
    this.currentDataStorageKey = null;
    this.pageCount = 0;
    this.retryCount = 0;
    this.isProcessing = false;
    this.currentTimeout = null;
    
    this.initDB().then(() => {
        this.init();
    });
}

async initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = () => {
            console.error('[Scraper] IndexedDB error:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            this.db = request.result;
            console.log('[Scraper] IndexedDB initialized');
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create sessions store
            if (!db.objectStoreNames.contains('sessions')) {
                const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
                sessionsStore.createIndex('status', 'status', { unique: false });
                sessionsStore.createIndex('tabId', 'tabId', { unique: false });
                sessionsStore.createIndex('dateKey', 'dateKey', { unique: false });
            }
            
            // Create extracted data store
            if (!db.objectStoreNames.contains('extractedData')) {
                const dataStore = db.createObjectStore('extractedData', { keyPath: 'id' });
                dataStore.createIndex('sessionId', 'sessionId', { unique: false });
                dataStore.createIndex('tabId', 'tabId', { unique: false });
                dataStore.createIndex('dateKey', 'dateKey', { unique: false });
            }
            
            console.log('[Scraper] IndexedDB stores created');
        };
    });
}

async storeInDB(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!this.db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async getFromDB(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!this.db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async getAllFromDB(storeName, indexName = null, indexValue = null) {
    return new Promise((resolve, reject) => {
        if (!this.db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        let request;
        
        if (indexName && indexValue !== null) {
            const index = store.index(indexName);
            request = index.getAll(indexValue);
        } else {
            request = store.getAll();
        }
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async deleteFromDB(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!this.db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
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

async handleInit() {
    // Check for existing session data first
    const storedData = await this.findActiveSession();
    if (storedData && storedData.items && storedData.items.length > 0 && storedData.status === 'active') {
        console.log(`[Scraper] Resuming active session: ${storedData.currentIndex + 1}/${storedData.items.length}`);
        
        // Set current keys for this session
        this.currentStorageKey = this.generateStorageKey(storedData.tabId, storedData.dateKey, storedData.start, storedData.end);
        this.currentDataStorageKey = this.generateDataStorageKey(storedData.tabId, storedData.dateKey, storedData.start, storedData.end);
        
        // Wait a bit longer for page to fully load before resuming
        setTimeout(() => {
            this.resumeProcessing(storedData);
        }, this.config.delays.navigation);
    } else {
        console.log('[Scraper] No active session found, waiting for new data...');
    }
}

async findActiveSession() {
    try {
        const today = this.getTodayDateKey();
        const tabId = this.getTabId();
        
        // Look for any active session for this tab and date
        const sessions = await this.getAllFromDB('sessions', 'status', 'active');
        const activeSession = sessions.find(session => 
            session.tabId === tabId && session.dateKey === today
        );
        
        return activeSession || null;
    } catch (error) {
        console.error('[Scraper] Error finding active session:', error);
        return null;
    }
}

generateStorageKey(dateKey, start, end) {
    return `${this.storageKeyPrefix}_${dateKey}_${start}_${end}`;
}

generateDataStorageKey(dateKey, start, end) {
    return `${this.dataStorageKeyPrefix}_${dateKey}_${start}_${end}`;
}

getTodayDateKey() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
}

getTabId() {
    // Generate or retrieve tab-specific identifier
    if (!window.scraperTabId) {
        window.scraperTabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
    return window.scraperTabId;
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

async handleNewData(payload) {
    console.log('[Scraper] Received new data payload');
    
    if (!payload || !payload.items || !Array.isArray(payload.items)) {
        console.error('[Scraper] Invalid payload received - missing items, start, or end');
        return;
    }

    const dateKey = this.getTodayDateKey();
    
    // Generate storage keys
    this.currentStorageKey = this.generateStorageKey(dateKey, payload.start, payload.end);
    this.currentDataStorageKey = this.generateDataStorageKey(dateKey, payload.start, payload.end);
    
    // Check if we already have an active session with the same parameters
    const existingData = await this.getStoredData();
    console.log('EXISTING DATA', existingData);
    if (existingData && existingData.status === 'active') {
        console.log('[Scraper] Active session exists with same parameters, ignoring new data payload');
        return;
    }

    const data = {
        id: this.currentStorageKey,
        items: payload.items,
        currentIndex: 0,
        results: [],
        startTime: Date.now(),
        sessionId: this.generateSessionId(),
        status: 'active',
        dateKey: dateKey,
        start: payload.start,
        end: payload.end
    };
    
    console.log(`[Scraper] Starting new session with ${data.items.length} items`);
    console.log(`[Scraper] Session key: ${this.currentStorageKey}`);
    console.log(`[Scraper] Data key: ${this.currentDataStorageKey}`);
    
    await this.storeData(data);
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
            attempt: this.retryCount + 1,
            extractedAt: new Date().toISOString()
        };

        data.results.push(result);
        
        // Save extracted data immediately
        this.saveExtractedData(result, data);
        
        // Send progress update
        this.sendProgressUpdate(result, data);
        
        // Move to next item
        data.currentIndex++;
        this.storeData(data);
        
        // Navigate to next item or complete
        this.navigateToNext(data);
    });
}

async saveExtractedData(result, sessionData) {
    try {
        // Create data entry for IndexedDB
        const dataEntry = {
            id: `${this.currentDataStorageKey}_${sessionData.currentIndex}_${Date.now()}`,
            sessionId: sessionData.sessionId,
            tabId: sessionData.tabId,
            dateKey: sessionData.dateKey,
            start: sessionData.start,
            end: sessionData.end,
            result: result,
            extractedAt: new Date().toISOString(),
            itemIndex: sessionData.currentIndex
        };

        // Save to IndexedDB
        await this.storeInDB('extractedData', dataEntry);
        
        console.log(`[Scraper] Saved data for item ${sessionData.currentIndex + 1}/${sessionData.items.length}`);
    } catch (error) {
        console.error('[Scraper] Failed to save extracted data:', error);
    }
}

async getSavedData() {
    try {
        if (!this.currentDataStorageKey) return null;
        
        const tabId = this.getTabId();
        const dateKey = this.getTodayDateKey();
        
        // Get all extracted data for this session
        const extractedData = await this.getAllFromDB('extractedData', 'tabId', tabId);
        const sessionData = extractedData.filter(item => 
            item.dateKey === dateKey && 
            item.id.includes(this.currentDataStorageKey.split('_').slice(-2).join('_'))
        );
        
        return sessionData.length > 0 ? { extractedResults: sessionData } : null;
    } catch (error) {
        console.error('[Scraper] Failed to retrieve saved data:', error);
        return null;
    }
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

    buttons.forEach((button, index) => {
        try {
            // Simulate interaction
            this.simulateButtonInteraction(button);
            
            const buttonText = button.textContent?.trim() || '';
            const sizeLabel = button.querySelector('[data-testid="selector-label"]');
            const priceLabel = button.querySelector('[data-testid="selector-secondary-label"]');
            
            let sizeText = sizeLabel?.textContent?.trim() || buttonText.split(/\s+/)[0] || '';
            let priceText = priceLabel?.textContent?.trim() || buttonText.split(/\s+/).pop() || '';

            // Since sizes are already in EU standard, extract directly
            const euSize = this.extractEUSize(sizeText);
            if (euSize) {
                sizeData.push({
                    size: parseFloat(euSize),
                    price: this.extractPrice(priceText),
                    priceFormatted: priceText,
                    sizeText: sizeText,
                    buttonIndex: index,
                    rawText: buttonText,
                    available: !button.disabled && !button.classList.contains('disabled')
                });
            }
        } catch (error) {
            console.warn(`[Scraper] Button parsing error ${index}:`, error);
        }
    });

    return sizeData.sort((a, b) => a.size - b.size);
}

// Simplified EU size extraction since sizes are already in EU standard
extractEUSize(sizeText) {
    if (!sizeText) return null;
    
    // Clean the text
    sizeText = sizeText.toString().trim();
    
    // Extract any number (decimal or integer)
    const numberMatch = sizeText.match(/(\d+\.?\d*)/);
    if (numberMatch) {
        return numberMatch[1];
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
            success: result.success,
            sessionId: data.sessionId
        }, '*');
    } catch (error) {
        console.error('[Scraper] Progress update failed:', error);
    }
}

async completeProcessing(data) {
    console.log('[Scraper] Scraping session completed!');
    
    this.isProcessing = false;
    
    const summary = {
        total: data.items.length,
        successful: data.results.filter(r => r.success).length,
        failed: data.results.filter(r => !r.success).length,
        duration: Date.now() - data.startTime,
        sessionId: data.sessionId,
        completedAt: new Date().toISOString()
    };

    // Update session status to completed
    data.status = 'completed';
    data.completedAt = Date.now();
    data.summary = summary;
    await this.storeData(data);

    try {
        window.postMessage({
            source: 'injected-script',
            type: 'SCRAPING_COMPLETED',
            results: data.results,
            summary: summary,
            sessionId: data.sessionId,
            dataStorageKey: this.currentDataStorageKey
        }, '*');
    } catch (error) {
        console.error('[Scraper] Completion message failed:', error);
    }

    console.log(`[Scraper] Summary: ${summary.successful}/${summary.total} successful, Duration: ${Math.round(summary.duration/1000)}s`);
    console.log(`[Scraper] Data saved to IndexedDB`);
}

// Storage management with IndexedDB
async storeData(data) {
    try {
        if (!this.currentStorageKey) {
            console.error('[Scraper] No storage key set');
            return;
        }

        const storageData = {
            ...data,
            lastUpdate: Date.now(),
            currentUrl: window.location.href
        };
        
        await this.storeInDB('sessions', storageData);
        
        // Also keep in memory for quick access
        window.scraperSessionData = storageData;
    } catch (error) {
        console.error('[Scraper] Storage failed:', error);
        // Fallback to memory only
        window.scraperSessionData = storageData;
    }
}

async getStoredData() {
    try {
        if (!this.currentStorageKey) return null;

        // Try IndexedDB first
        const data = await this.getFromDB('sessions', this.currentStorageKey);
        if (data) {
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
async clearData() {
    try {
        if (this.currentStorageKey) {
            await this.deleteFromDB('sessions', this.currentStorageKey);
        }
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
static getResults(tabId = null, dateKey = null, start = null, end = null) {
    try {
        if (tabId && dateKey && start && end) {
            // Get specific session results
            const dataKey = `scraper_data_${tabId}_${dateKey}_${start}_${end}`;
            const stored = localStorage.getItem(dataKey);
            if (stored) {
                const data = JSON.parse(stored);
                return data.extractedResults || [];
            }
        } else {
            // Get current session results
            const stored = localStorage.getItem('scraper_session_data');
            if (stored) {
                const data = JSON.parse(stored);
                return data.results || [];
            }
            return window.scraperSessionData?.results || [];
        }
        return [];
    } catch (error) {
        return window.scraperSessionData?.results || [];
    }
}

static getStatus() {
    try {
        // Look for any active session
        const today = new Date();
        const dateKey = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('scraper_session') && key.includes(dateKey)) {
                const data = JSON.parse(localStorage.getItem(key));
                if (data && data.status === 'active') {
                    return {
                        status: data.status,
                        progress: data.currentIndex || 0,
                        total: data.items?.length || 0,
                        sessionId: data.sessionId,
                        currentUrl: data.currentUrl,
                        storageKey: key
                    };
                }
            }
        }
        
        return 'inactive';
    } catch (error) {
        return 'error';
    }
}

static getAllSavedData() {
    try {
        const savedData = {};
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('scraper_data_')) {
                const data = JSON.parse(localStorage.getItem(key));
                savedData[key] = data;
            }
        }
        
        return savedData;
    } catch (error) {
        console.error('[Scraper] Failed to get all saved data:', error);
        return {};
    }
}

static clearAll() {
    try {
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('scraper_session_') || key.startsWith('scraper_data_'))) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        delete window.scraperSessionData;
        
        console.log(`[Scraper] Cleared ${keysToRemove.length} items from storage`);
    } catch (error) {
        delete window.scraperSessionData;
        console.log('[Scraper] Session data cleared (memory only)');
    }
}

static clearOldData(daysOld = 7) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('scraper_session_') || key.startsWith('scraper_data_'))) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    const dataDate = new Date(data.startTime || data.sessionInfo?.startTime || 0);
                    if (dataDate < cutoffDate) {
                        keysToRemove.push(key);
                    }
                } catch (error) {
                    // If we can't parse, remove it
                    keysToRemove.push(key);
                }
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`[Scraper] Cleared ${keysToRemove.length} old items from storage`);
    } catch (error) {
        console.error('[Scraper] Failed to clear old data:', error);
    }
}
}

// Initialize the scraper
console.log('[Scraper] Loading production scraper...');
var SCRAPERDATA;
const scraper = new OptimizedScraper();
var isinit = false;
// Message listener for data from content script
window.addEventListener('message', (event) => {
if (event.source !== window) return;

if (event.data?.source === 'content-script' && event.data?.type === 'DATA_READY') {
   let tm = setTimeout(function() {
    SCRAPERDATA = event.data.payload;
    console.log(SCRAPERDATA);
    SCRAPERDATA && !isinit && scraper.handleNewData(event.data.payload);
    isinit = true;
    clearTimeout(tm);
   }, 2000);

}
});

// Export utilities to global scope
window.ScraperUtils = {
    getResults: OptimizedScraper.getResults,
    getStatus: OptimizedScraper.getStatus,
    getAllSavedData: OptimizedScraper.getAllSavedData,
    clearAll: OptimizedScraper.clearAll,
    clearOldData: OptimizedScraper.clearOldData
};

console.log('[Scraper] Production scraper ready!');