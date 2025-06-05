Array.prototype.wait = function(onItem, callback, thread, tmp) {
	var self = this;
	var init = false;
	// INIT
	if (!tmp) {

		if (typeof(callback) !== 'function') {
			thread = callback;
			callback = null;
		}

		tmp = {};
		tmp.pending = 0;
		tmp.index = 0;
		tmp.thread = thread;
		tmp.next = function(type) {
			if (type === 'cancel' || tmp.canceled) {
				tmp.pending--;
				tmp.canceled = true;
				if (!tmp.pending && callback)
					callback('cancel');
			} else
				setImmediate(next_wait, self, onItem, callback, thread, tmp);
		};

		// thread === Boolean then array has to be removed item by item
		init = true;
	}

	var item = thread === true ? self.shift() : self[tmp.index++];
	if (item === undefined) {
		if (!tmp.pending) {
			callback && callback();
			tmp.canceled = true;
		}
		return self;
	}

	tmp.pending++;
	try {
		onItem.call(self, item, tmp.next, tmp.index);
	} catch (err) {
		console.error('Erreur dans onItem:', err);
		tmp.next(); // assure qu'on continue malgré l'erreur
	}

	if (!init || tmp.thread === 1)
		return self;

	for (var i = 1; i < tmp.thread; i++)
		self.wait(onItem, callback, 1, tmp);

	return self;
};


function next_wait(self, onItem, callback, thread, tmp) {
	tmp.pending--;
	self.wait(onItem, callback, thread, tmp);
};

// Enhanced scraper with localStorage-based navigation queue
class PersistentScraper {
    constructor() {
        // Generate unique keys based on tab ID and URL parameters
        this.tabIdentifier = this.generateTabIdentifier();
        this.operationId = this.getOperationId();
        
        // Create unique storage keys using tab and operation identifiers
        this.STORAGE_KEY = `scraper_queue_${this.operationId}_${this.tabIdentifier}`;
        this.STATUS_KEY = `scraper_status_${this.operationId}_${this.tabIdentifier}`;
        this.RESULTS_KEY = `scraper_results_${this.operationId}_${this.tabIdentifier}`;
        
        console.log(`[PersistentScraper] Initialized with keys: ${this.STORAGE_KEY}, ${this.STATUS_KEY}, ${this.RESULTS_KEY}`);
        this.init();
    }
    
    // Generate a unique identifier for the current tab based on URL parameters
    generateTabIdentifier() {
        const urlParams = new URLSearchParams(window.location.search);
        const start = urlParams.get('start') || '0';
        const end = urlParams.get('end') || '0';
        return `tab_${start}_${end}`;
    }
    
    // Get operation ID from URL or generate a timestamp-based one
    getOperationId() {
        const urlParams = new URLSearchParams(window.location.search);
        // Try to get operation ID from URL if available
        const opId = urlParams.get('op') || `op_${Date.now()}`;
        return opId;
    }

    init() {
        // Wait for DOM to be ready before doing anything
        const initWhenReady = () => {
            console.log('[PersistentScraper] DOM is ready');
            // Check if we have a queue in localStorage first
            const queueData = this.getStoredQueue();
            // If we have a queue, log it  
            console.log('[PersistentScraper] Stored queue:', queueData);
            

            if (queueData && queueData.items.length > 0) {
                console.log(`[PersistentScraper] Resuming from stored queue ${this.STORAGE_KEY}, seq:`, queueData.currentSeq);
                // Add a small delay to ensure page is fully loaded
                setTimeout(() => {
                    this.processCurrentItem(queueData);
                }, 1500);
            } else {
                console.log('[PersistentScraper] No stored queue found. Starting from scratch');
                // No stored queue, start from scratch
            }
        };

        // Check if DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initWhenReady);
        } else {
            // DOM is already ready
            initWhenReady();
        }
    }


    handleNewData(payload) {
        console.log('[PersistentScraper] Received new data:', payload);
        
        let items = payload.items;
        const sampleSize = payload.sampleSize || 0;
        
        // Apply sampling if requested
        if (sampleSize > 0 && items.length > sampleSize) {
            console.log(`Sampling activated: ${sampleSize} items out of ${items.length}`);
            items = items.slice(0, sampleSize);
        }

        // Store the queue in localStorage
        const queueData = {
            items: items,
            currentSeq: 0,
            totalItems: items.length,
            sampleSize: sampleSize,
            startTime: Date.now(),
            results: []
        };
        
        this.storeQueue(queueData);
        this.storeStatus('running');
        
        // Start processing
        this.processCurrentItem(queueData);
    }

    processCurrentItem(queueData) {
        console.log('[PersistentScraper] Processing current item:', queueData.currentSeq);
        if (queueData.currentSeq >= queueData.items.length) {
            // All items processed
            this.completeProcessing(queueData);
            return;
        }

        const currentItem = queueData.items[queueData.currentSeq];
        console.log(`[PersistentScraper] Processing item ${queueData.currentSeq + 1}/${queueData.totalItems}:`, currentItem.link);

        // If we're already on the target page, extract data
        if (window.location.href === currentItem.link) {
            console.log('[PersistentScraper] Already on target page:', currentItem.link);
            this.extractDataFromCurrentPage(queueData, currentItem);
        } else {
            console.log('[PersistentScraper] Navigating to:', currentItem.link);
            // Navigate to the page using window.location.href with concat of operation ID
            let operationId = this.getOperationId();
            console.log('[PersistentScraper] Navigating to:', currentItem.link + '&op=' + operationId);
            window.location.href = currentItem.link + '?op=' + operationId;
            // The page will reload, and init() will resume from localStorage
        }
    }

    extractDataFromCurrentPage(queueData, currentItem) {
        console.log('[PersistentScraper] ===== EXTRACTING DATA FROM CURRENT PAGE =====');
        console.log('[PersistentScraper] URL:', window.location.href);
        console.log('[PersistentScraper] Current item:', currentItem);
        console.log('[PersistentScraper] Page title:', document.title);
        console.log('[PersistentScraper] DOM ready state:', document.readyState);
        
        // Log initial DOM state
        const initialButtons = document.querySelectorAll('button[data-testid="size-selector-button"]');
        console.log('[PersistentScraper] Initial size buttons found:', initialButtons.length);
        
        if (initialButtons.length > 0) {
            console.log('[PersistentScraper] Sample button HTML:', initialButtons[0].outerHTML);
        }
        
        // Use your enhanced extraction strategies
        this.tryAllStrategies((data) => {
            console.log('[PersistentScraper] ===== EXTRACTION COMPLETE =====');
            console.log('[PersistentScraper] Extracted data:', data);
            console.log('[PersistentScraper] Data length:', data ? data.length : 0);
            
            const result = {
                url: window.location.href,
                item: currentItem,
                data: data,
                timestamp: Date.now(),
                success: data && data.length > 0,
                pageTitle: document.title,
                extractionTime: new Date().toISOString()
            };

            // Store the result
            queueData.results.push(result);
            
            // Auto-download current results after each extraction
            this.downloadResults(queueData.results, `scraping_progress_${queueData.currentSeq + 1}.txt`);
            
            if (data && data.length > 0) {
                console.log('[PersistentScraper] ✅ Data extracted successfully:', data);
                
                // Send result back to content script
                window.postMessage({
                    source: 'injected-script',
                    type: 'SIZE_DATA_EXTRACTED',
                    data: data,
                    url: window.location.href,
                    progress: {
                        current: queueData.currentSeq + 1,
                        total: queueData.totalItems
                    }
                }, '*');
            } else {
                console.warn('[PersistentScraper] ❌ No data found for:', currentItem.link);
                console.log('[PersistentScraper] Debugging - checking page elements...');
                this.debugPageElements();
            }

            // Move to next item
            queueData.currentSeq++;
            this.storeQueue(queueData);
            
            console.log('[PersistentScraper] Moving to next item. Progress:', `${queueData.currentSeq}/${queueData.totalItems}`);
            
            // Process next item after a short delay
            setTimeout(() => {
                this.processCurrentItem(queueData);
            }, 2000); // Increased delay to 2 seconds
        });
    }

    tryAllStrategies(callback, timeout = 45000) { // Increased timeout
        console.log('[PersistentScraper] ===== TRYING ALL EXTRACTION STRATEGIES =====');
        let resolved = false;
        let timeoutId;
        let strategiesComplete = 0;
        const totalStrategies = 3;
        
        const resolveOnce = (data, strategyName) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                console.log(`[PersistentScraper] ✅ ${strategyName} succeeded with data:`, data);
                callback(data);
            } else {
                console.log(`[PersistentScraper] ${strategyName} completed but already resolved`);
            }
        };

        const strategies = [
            {
                name: 'MutationObserver',
                fn: (cb) => this.waitForSizeData(cb, timeout / 3)
            },
            {
                name: 'Polling',
                fn: (cb) => this.pollForSizeData(cb, 60, 500) // Increased attempts and interval
            },
            {
                name: 'MultipleConditions',
                fn: (cb) => this.waitForMultipleConditions(cb, timeout / 3)
            }
        ];
        
        strategies.forEach((strategy, index) => {
            console.log(`[PersistentScraper] Starting strategy ${index + 1}: ${strategy.name}`);
            
            strategy.fn((data) => {
                strategiesComplete++;
                console.log(`[PersistentScraper] Strategy ${strategy.name} completed. Data found: ${data ? data.length : 0} items`);
                
                if (data && data.length > 0) {
                    resolveOnce(data, strategy.name);
                } else {
                    console.log(`[PersistentScraper] Strategy ${strategy.name} found no data`);
                    
                    // If all strategies are done and none found data
                    if (strategiesComplete === totalStrategies && !resolved) {
                        console.log('[PersistentScraper] All strategies completed with no data');
                        resolved = true;
                        clearTimeout(timeoutId);
                        callback(null);
                    }
                }
            });
        });
        
        timeoutId = setTimeout(() => {
            if (!resolved) {
                console.warn('[PersistentScraper] ❌ All strategies timed out');
                resolved = true;
                callback(null);
            }
        }, timeout);
    }

    // Strategy 1: Wait for DOM elements with MutationObserver
    waitForSizeData(callback, timeout = 30000) {
        const targetSelector = 'button[data-testid="size-selector-button"]';
        
        // Check if elements already exist
        if (document.querySelectorAll(targetSelector).length > 0) {
            callback(this.extractEUSizeData());
            return;
        }
        
        // Function to start observing when DOM is ready
        const startObserving = () => {
            const targetNode = document.body || document.documentElement || document;
            
            if (!targetNode) {
                callback(null);
                return;
            }
            
            const observer = new MutationObserver((mutations) => {
                for (let mutation of mutations) {
                    if (mutation.type === 'childList') {
                        const sizeButtons = document.querySelectorAll(targetSelector);
                        if (sizeButtons.length > 0) {
                            observer.disconnect();
                            callback(this.extractEUSizeData());
                            return;
                        }
                    }
                }
            });
            
            try {
                observer.observe(targetNode, {
                    childList: true,
                    subtree: true
                });
                
                setTimeout(() => {
                    observer.disconnect();
                    callback(null);
                }, timeout);
            } catch (e) {
                console.warn('[PersistentScraper] MutationObserver failed:', e);
                callback(null);
            }
        };
        
        // Wait for DOM to be ready
        if (document.body) {
            startObserving();
        } else if (document.documentElement) {
            startObserving();
        } else {
            // Wait for DOM to load
            const domReady = () => {
                if (document.body || document.documentElement) {
                    startObserving();
                } else {
                    setTimeout(domReady, 50);
                }
            };
            domReady();
        }
    }

    // Strategy 2: Polling approach
    pollForSizeData(callback, maxAttempts = 50, interval = 500) {
        console.log(`[PersistentScraper] Starting polling strategy: ${maxAttempts} attempts every ${interval}ms`);
        let attempts = 0;
        
        const poll = () => {
            attempts++;
            console.log(`[PersistentScraper] Polling attempt ${attempts}/${maxAttempts}`);
            
            const sizeButtons = document.querySelectorAll('button[data-testid="size-selector-button"]');
            console.log(`[PersistentScraper] Poll ${attempts}: Found ${sizeButtons.length} size buttons`);
            
            if (sizeButtons.length > 0) {
                console.log(`[PersistentScraper] ✅ Polling succeeded on attempt ${attempts}`);
                const data = this.extractEUSizeData();
                callback(data);
                return;
            }
            
            if (attempts >= maxAttempts) {
                console.log(`[PersistentScraper] ❌ Polling failed: Max attempts (${maxAttempts}) reached`);
                callback(null);
                return;
            }
            
            // Log page state every 10 attempts
            if (attempts % 10 === 0) {
                console.log(`[PersistentScraper] Poll ${attempts}: Page state - readyState: ${document.readyState}, title: "${document.title}"`);
            }
            
            setTimeout(poll, interval);
        };
        
        poll();
    }

    // Strategy 3: Wait for multiple conditions
    waitForMultipleConditions(callback, timeout = 30000) {
        const conditions = {
            domReady: false,
            sizesLoaded: false,
            reactReady: false
        };
        
        let timeoutId;
        
        const checkAllConditions = () => {
            if (Object.values(conditions).every(Boolean)) {
                clearTimeout(timeoutId);
                callback(this.extractEUSizeData());
            }
        };
        
        // DOM ready check
        if (document.readyState === 'complete') {
            conditions.domReady = true;
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                conditions.domReady = true;
                checkAllConditions();
            });
        }
        
        // Size data check
        const startSizeObserver = () => {
            const targetNode = document.body || document.documentElement || document;
            
            if (targetNode) {
                try {
                    const observer = new MutationObserver(() => {
                        if (document.querySelectorAll('button[data-testid="size-selector-button"]').length > 0) {
                            conditions.sizesLoaded = true;
                            observer.disconnect();
                            checkAllConditions();
                        }
                    });
                    observer.observe(targetNode, { childList: true, subtree: true });
                    
                    // Store observer reference for cleanup
                    timeoutId = setTimeout(() => {
                        observer.disconnect();
                        clearInterval(reactCheck);
                        callback(null);
                    }, timeout);
                } catch (e) {
                    console.warn('[PersistentScraper] Size observer failed:', e);
                    conditions.sizesLoaded = true; // Skip this condition
                    checkAllConditions();
                }
            } else {
                // If no suitable node, skip this condition
                conditions.sizesLoaded = true;
                checkAllConditions();
            }
        };
        
        if (document.body || document.documentElement) {
            startSizeObserver();
        } else {
            // Wait for DOM
            const waitForDOM = () => {
                if (document.body || document.documentElement) {
                    startSizeObserver();
                } else {
                    setTimeout(waitForDOM, 50);
                }
            };
            waitForDOM();
        }
        
        // React ready check
        const reactCheck = setInterval(() => {
            if (window.React || 
                document.querySelector('[data-reactroot]') || 
                document.querySelector('[data-testid]') ||
                window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
                conditions.reactReady = true;
                clearInterval(reactCheck);
                checkAllConditions();
            }
        }, 100);
        
        timeoutId = setTimeout(() => {
            if (typeof observer !== 'undefined') {
                try { observer.disconnect(); } catch(e) {}
            }
            clearInterval(reactCheck);
            callback(null);
        }, timeout);
        
        checkAllConditions();
    }

    extractEUSizeData() {
        console.log('[PersistentScraper] ===== EXTRACTING EU SIZE DATA =====');
        
        // Try multiple selector strategies to find size buttons
        const selectorStrategies = [
            'button[data-testid="size-selector-button"]',
            'div[data-component="size-selector"] button',
            'div[class*="size-selector"] button',
            'div[class*="SizeSelector"] button',
            'button[class*="size"]',
            'div[class*="ProductSizeSelector"] button'
        ];
        
        let sizeButtons = [];
        
        // Try each selector strategy until we find buttons
        for (const selector of selectorStrategies) {
            sizeButtons = document.querySelectorAll(selector);
            console.log(`[PersistentScraper] Selector "${selector}": found ${sizeButtons.length} buttons`);
            
            if (sizeButtons.length > 0) {
                console.log(`[PersistentScraper] Using selector: ${selector}`);
                break;
            }
        }
        
        if (sizeButtons.length === 0) {
            console.log('[PersistentScraper] No size buttons found with any selector strategy');
            return [];
        }
        
        // Extract product title for debugging
        const productTitle = document.querySelector('h1') ? 
            document.querySelector('h1').textContent.trim() : 
            document.title;
        
        console.log(`[PersistentScraper] Product title: "${productTitle}"`);
        
        const euSizeData = [];
        const usToEuSizeMap = this.getUSTOEUSizeMap();
        
        // Process each button
        sizeButtons.forEach((button, index) => {
            try {
                // Get all text content from the button
                const buttonText = button.textContent.trim();
                console.log(`[PersistentScraper] Button ${index + 1} text: "${buttonText}"`);
                
                // Try multiple strategies to extract size and price
                let sizeText = '';
                let priceText = '';
                
                // Strategy 1: Use data-testid attributes
                const sizeLabel = button.querySelector('[data-testid="selector-label"]');
                const priceLabel = button.querySelector('[data-testid="selector-secondary-label"]');
                
                if (sizeLabel && priceLabel) {
                    sizeText = sizeLabel.textContent.trim();
                    priceText = priceLabel.textContent.trim();
                } 
                // Strategy 2: Look for specific class patterns
                else {
                    const spans = button.querySelectorAll('span');
                    if (spans.length >= 2) {
                        sizeText = spans[0].textContent.trim();
                        priceText = spans[spans.length - 1].textContent.trim();
                    }
                }
                
                // Strategy 3: Parse the entire button text
                if (!sizeText || !priceText) {
                    const parts = buttonText.split(/\s+/);
                    if (parts.length >= 2) {
                        // Assume first part is size, last part is price
                        sizeText = parts[0];
                        priceText = parts[parts.length - 1];
                    }
                }
                
                console.log(`[PersistentScraper] Button ${index + 1} - Extracted: Size="${sizeText}", Price="${priceText}"`);
                
                // Process EU sizes directly
                if (sizeText.includes('EU')) {
                    const size = sizeText.replace('EU', '').trim();
                    const sizeData = {
                        size: parseFloat(size),
                        price: this.extractPrice(priceText),
                        priceFormatted: priceText,
                        sizeText: `EU ${size}`,
                        buttonIndex: index
                    };
                    
                    console.log(`[PersistentScraper] ✅ Added EU size directly: ${JSON.stringify(sizeData)}`);
                    euSizeData.push(sizeData);
                }
                // Convert US sizes to EU if needed
                else if (sizeText.includes('US')) {
                    const usSize = sizeText.replace('US', '').trim();
                    const euSize = this.convertUSToEU(usSize, usToEuSizeMap);
                    
                    if (euSize) {
                        const sizeData = {
                            size: parseFloat(euSize),
                            price: this.extractPrice(priceText),
                            priceFormatted: priceText,
                            sizeText: `EU ${euSize}`,
                            originalSize: `US ${usSize}`,
                            buttonIndex: index
                        };
                        
                        console.log(`[PersistentScraper] ✅ Converted US ${usSize} to EU ${euSize}: ${JSON.stringify(sizeData)}`);
                        euSizeData.push(sizeData);
                    }
                }
                // Try to handle sizes without explicit region marker
                else if (!isNaN(parseFloat(sizeText))) {
                    // Assume it's a US size and try to convert
                    const usSize = parseFloat(sizeText);
                    const euSize = this.convertUSToEU(usSize.toString(), usToEuSizeMap);
                    
                    if (euSize) {
                        const sizeData = {
                            size: parseFloat(euSize),
                            price: this.extractPrice(priceText),
                            priceFormatted: priceText,
                            sizeText: `EU ${euSize}`,
                            originalSize: `${sizeText}`,
                            buttonIndex: index
                        };
                        
                        console.log(`[PersistentScraper] ✅ Assumed US size and converted to EU ${euSize}: ${JSON.stringify(sizeData)}`);
                        euSizeData.push(sizeData);
                    }
                }
            } catch (err) {
                console.error(`[PersistentScraper] Error processing button ${index + 1}:`, err);
            }
        });
        
        // Sort by size
        euSizeData.sort((a, b) => a.size - b.size);
        
        console.log(`[PersistentScraper] Final EU size data: ${euSizeData.length} sizes found`);
        console.log(euSizeData);
        
        return euSizeData;
    }
    
    // Helper to extract price from text
    extractPrice(priceText) {
        if (!priceText) return null;
        
        // Handle "Bid" or "Ask" text
        if (priceText.toLowerCase().includes('bid') || 
            priceText.toLowerCase().includes('ask') || 
            priceText.toLowerCase().includes('offre')) {
            return 'OFFRE';
        }
        
        // Extract numeric price
        const priceMatch = priceText.match(/[\d,.]+/);
        if (priceMatch) {
            const price = priceMatch[0].replace(/[^\d]/g, '');
            return parseInt(price) || priceText;
        }
        
        return priceText;
    }
    
    // Convert US sizes to EU sizes
    convertUSToEU(usSize, sizeMap) {
        if (!usSize) return null;
        
        // Try direct lookup first
        if (sizeMap[usSize]) {
            return sizeMap[usSize];
        }
        
        // Try as a number
        const numericSize = parseFloat(usSize);
        if (isNaN(numericSize)) return null;
        
        // Find closest match
        const usSizes = Object.keys(sizeMap).map(parseFloat).filter(size => !isNaN(size));
        const closest = usSizes.reduce((prev, curr) => {
            return (Math.abs(curr - numericSize) < Math.abs(prev - numericSize) ? curr : prev);
        }, Infinity);
        
        if (closest !== Infinity) {
            return sizeMap[closest.toString()];
        }
        
        return null;
    }
    
    // US to EU size conversion map
    getUSTOEUSizeMap() {
        return {
            '3.5': '36',
            '4': '36.5',
            '4.5': '37.5',
            '5': '38',
            '5.5': '38.5',
            '6': '39',
            '6.5': '40',
            '7': '40.5',
            '7.5': '41',
            '8': '42',
            '8.5': '42.5',
            '9': '43',
            '9.5': '44',
            '10': '44.5',
            '10.5': '45',
            '11': '45.5',
            '11.5': '46',
            '12': '47',
            '12.5': '47.5',
            '13': '48',
            '13.5': '48.5',
            '14': '49',
            '15': '50',
            '16': '51'
        };
    }

    // Debug function to analyze page elements
    debugPageElements() {
        console.log('[PersistentScraper] ===== DEBUG: ANALYZING PAGE ELEMENTS =====');
        
        // Check all buttons on the page
        const allButtons = document.querySelectorAll('button');
        console.log('[PersistentScraper] Total buttons on page:', allButtons.length);
        
        // Check for any elements with "size" in their attributes
        const sizeElements = document.querySelectorAll('[*|*="size" i], [class*="size" i], [data-testid*="size" i]');
        console.log('[PersistentScraper] Elements with "size" in attributes:', sizeElements.length);
        
        // Check for common StockX selectors
        const stockxSelectors = [
            '[data-testid*="selector"]',
            '[class*="selector"]',
            '[class*="size"]',
            '.btn',
            'button[class*="size"]'
        ];
        
        stockxSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            console.log(`[PersistentScraper] "${selector}": ${elements.length} elements`);
            if (elements.length > 0 && elements.length < 20) {
                elements.forEach((el, i) => {
                    console.log(`  ${i + 1}. Text: "${el.textContent.trim()}" | HTML: ${el.outerHTML.substring(0, 200)}...`);
                });
            }
        });
        
        // Check for text containing "EU"
        const allElements = document.querySelectorAll('*');
        let euElements = 0;
        for (let el of allElements) {
            if (el.textContent && el.textContent.includes('EU ') && el.textContent.length < 50) {
                euElements++;
                if (euElements <= 10) { // Limit output
                    console.log(`[PersistentScraper] EU text found: "${el.textContent.trim()}" in`, el.tagName);
                }
            }
        }
        console.log(`[PersistentScraper] Total elements containing "EU ": ${euElements}`);
    }

    // Auto-download results as text file
    downloadResults(results, filename = 'scraping_results.txt') {
        try {
            let content = `StockX Scraping Results\n`;
            content += `Generated: ${new Date().toISOString()}\n`;
            content += `Total Items: ${results.length}\n`;
            content += `Successful: ${results.filter(r => r.success).length}\n`;
            content += `Failed: ${results.filter(r => !r.success).length}\n`;
            content += `\n${'='.repeat(80)}\n\n`;
            
            results.forEach((result, index) => {
                content += `${index + 1}. ${result.success ? '✅' : '❌'} ${result.url}\n`;
                content += `   Title: ${result.pageTitle || 'N/A'}\n`;
                content += `   Time: ${result.extractionTime || new Date(result.timestamp).toISOString()}\n`;
                
                if (result.data && result.data.length > 0) {
                    content += `   EU Sizes Found: ${result.data.length}\n`;
                    result.data.forEach(size => {
                        content += `     - EU ${size.size}: ${size.priceFormatted}\n`;
                    });
                } else {
                    content += `   No EU sizes found\n`;
                }
                content += `\n`;
            });
            
            // Create and trigger download
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log(`[PersistentScraper] 📁 Downloaded results file: ${filename}`);
        } catch (error) {
            console.error('[PersistentScraper] Failed to download results:', error);
        }
        console.log('[PersistentScraper] All items processed!');
        console.log('Results summary:', {
            total: queueData.totalItems,
            successful: queueData.results.filter(r => r.success).length,
            failed: queueData.results.filter(r => !r.success).length,
            duration: Date.now() - queueData.startTime
        });

        // Store final results
        this.storeResults(queueData.results);
        this.storeStatus('completed');
        
        // Send completion message
        window.postMessage({
            source: 'injected-script',
            type: 'SCRAPING_COMPLETED',
            results: queueData.results,
            summary: {
                total: queueData.totalItems,
                successful: queueData.results.filter(r => r.success).length,
                failed: queueData.results.filter(r => !r.success).length
            }
        }, '*');

        // Clean up localStorage
        this.clearQueue();
    }

    // localStorage utilities
    storeQueue(queueData) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queueData));
        } catch (e) {
            console.error(`[PersistentScraper] Failed to store queue in ${this.STORAGE_KEY}:`, e);
        }
    }

    getStoredQueue() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            console.error(`[PersistentScraper] Failed to get stored queue from ${this.STORAGE_KEY}:`, e);
            return null;
        }
    }

    storeStatus(status) {
        try {
            localStorage.setItem(this.STATUS_KEY, JSON.stringify({
                status: status,
                timestamp: Date.now(),
                url: window.location.href,
                tabId: this.tabIdentifier,
                operationId: this.operationId
            }));
        } catch (e) {
            console.error(`[PersistentScraper] Failed to store status in ${this.STATUS_KEY}:`, e);
        }
    }

    storeResults(results) {
        try {
            localStorage.setItem(this.RESULTS_KEY, JSON.stringify(results));
        } catch (e) {
            console.error(`[PersistentScraper] Failed to store results in ${this.RESULTS_KEY}:`, e);
        }
    }

    clearQueue() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem(this.STATUS_KEY);
            // Keep results for potential retrieval
        } catch (e) {
            console.error('[PersistentScraper] Failed to clear queue:', e);
        }
    }

    // Update static methods to handle the new key format
    static getResults(operationId, tabId) {
        try {
            // If specific operationId and tabId are provided, use them
            if (operationId && tabId) {
                const key = `scraper_results_${operationId}_${tabId}`;
                const stored = localStorage.getItem(key);
                return stored ? JSON.parse(stored) : null;
            }
            
            // Otherwise, try to find all results keys and return them
            const results = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('scraper_results_')) {
                    const stored = localStorage.getItem(key);
                    results[key] = stored ? JSON.parse(stored) : null;
                }
            }
            return results;
        } catch (e) {
            console.error('Failed to get results:', e);
            return null;
        }
    }

    static getStatus(operationId, tabId) {
        try {
            // If specific operationId and tabId are provided, use them
            if (operationId && tabId) {
                const key = `scraper_status_${operationId}_${tabId}`;
                const stored = localStorage.getItem(key);
                return stored ? JSON.parse(stored) : null;
            }
            
            // Otherwise, try to find all status keys and return them
            const statuses = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('scraper_status_')) {
                    const stored = localStorage.getItem(key);
                    statuses[key] = stored ? JSON.parse(stored) : null;
                }
            }
            return statuses;
        } catch (e) {
            console.error('Failed to get status:', e);
            return null;
        }
    }

    static clearAll(operationId) {
        try {
            // If operationId is provided, only clear keys for that operation
            if (operationId) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.includes(`_${operationId}_`)) {
                        localStorage.removeItem(key);
                    }
                }
                console.log(`All scraper data for operation ${operationId} cleared`);
            } else {
                // Otherwise clear all scraper-related keys
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.startsWith('scraper_')) {
                        localStorage.removeItem(key);
                    }
                }
                console.log('All scraper data cleared');
            }
        } catch (e) {
            console.error('Failed to clear data:', e);
        }
    }
}

// Initialize the persistent scraper
// Export utilities to global scope for debugging
const persistentScraper = new PersistentScraper();

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source === 'content-script' && event.data?.type === 'DATA_READY') {
        persistentScraper.handleNewData(event.data.payload);
    }
});

window.ScraperUtils = {
    getResults: PersistentScraper.getResults,
    getStatus: PersistentScraper.getStatus,
    clearAll: PersistentScraper.clearAll
};

window.postMessage({
    type: 'INJECTED_REQUEST'
  }, '*');