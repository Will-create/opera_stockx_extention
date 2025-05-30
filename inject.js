
const urlParams = new URLSearchParams(window.location.search);
const start = urlParams.get('start');
const end = urlParams.get('end');
const sampleSize = urlParams.get('sample') || 0; // Nouveau paramètre pour l'échantillonnage

const PROXYSERVER = "https://rehane.innovxpro.com/proxy";
const PROXYSERVER_TOKEN = "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";
const API_STOCKSX = "https://stockx.com/api/p/e";
const TARGET_URL = "https://stockx.com";

function Scraper(content, options = {}) {
  this.file_url = '[placeholder]';
	this.content = content;
	this.proxy_url = PROXYSERVER;
	this.proxy_token = PROXYSERVER_TOKEN;
	this.api = API_STOCKSX;
	this.target = TARGET_URL;
  this.total = content.length;
	this.newData = [];
	this.oldData = [];
	this.queue = {};
	this.queue2 = [];
	this.done = {};
	this.isOnline = true;
	this.sampleMode = options.sampleMode || false;
	const now = new Date();
	const key = `index_cache_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${start}`;
	this.cache_key = key;
	this.i = window.localStorage.getItem(key) || 0;
	window.addEventListener('online', () => this.retryQueue());
	window.addEventListener('offline', () => this.handleOffline());
};

if (typeof setImmediate === 'undefined') {
	var setImmediate = function (callback, ...args) {
		return setTimeout(callback, 0, ...args);
	};
};

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
		tmp.next(); // assure qu’on continue malgré l’erreur
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


const SP = Scraper.prototype; // Extend the object with prototype

SP.handleOffline = function() {
	this.isOnline = false;
	console.log('Browser is offline. Queuing requests...');
};

SP.retryQueue = function() {
	this.isOnline = true;
	console.log('Browser is online again. Retrying queued requests...');
	while (this.queue2.length > 0) {
		const queuedRequest = this.queue2.shift(); // Remove the first item from the queue
		this.fetchWithRetry(queuedRequest.url, queuedRequest.options).catch(err => {
			console.log('Retry failed. Re-queueing request:', err);
			this.queue2.push(queuedRequest);
		});
	}
};

const HEADERS = {
    // Headers de base qui varient légèrement à chaque requête
    'User-Agent': navigator.userAgent, // Utiliser l'UA réel du navigateur
    'Accept-Language': navigator.language, // Utiliser la langue réelle du navigateur
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Referer': 'https://stockx.com/',
    'Origin': 'https://stockx.com',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    // Headers spécifiques à StockX mais moins évidents
    'apollographql-client-name': 'Iron',
    'apollographql-client-version': '2023.09.24.00',
    'App-Platform': 'Iron',
    'App-Version': '2023.09.24.00'
};


SP.customLog =  async function (message, isError = false) {
	var self = this;

	if (message.indexOf('possède') > -1) {
		await self.fetchWithRetry(`${PROXYSERVER}/is404/` + self.current.id, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${PROXYSERVER_TOKEN}`
			},
			body: '{}'
		}, 3);
	}

	if (self.current)
		message = message + (` Index: ${self.index} ID: ${ self.current ? self.current.id : ''} STOCKX URL: ${ self.current ? self.current.titles : ''} URL: ${self.file_url}`);
	else
		message = message + (` Index: ${self.index}`);

	if (isError) {
		console.log(message);
		// try {
		// 	await self.fetchWithRetry(`${PROXYSERVER}/log`, {
		// 		method: 'POST',
		// 		headers: {
		// 			'Content-Type': 'application/json',
		// 			'Authorization': `Bearer ${PROXYSERVER_TOKEN}`
		// 		},
		// 		body: JSON.stringify({ message, type: 'error', data: self.current })
		// 	}, 3);
		// } catch (logError) {
		// 	console.log('Failed to send log to server:', logError);
		// }
	} else {
		console.log(message);
	}
};
SP.delay = function(timeout) {
	return new Promise(function(resolve) {
		setTimeout(resolve, timeout || 2000);
	});
};
// Enhanced fetchWithRetry to handle offline scenario
SP.fetchWithRetry = async function(url, options, retries = 3) {
	var self = this;
	let lastError;
	let lastResponse;

	for (let i = 0; i < retries; i++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000); // 15 sec timeout
		
		try {
			// Add exponential backoff delay between retries
			if (i > 0) {
				const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
				await new Promise(resolve => setTimeout(resolve, delay));
				
				// Si c'est une nouvelle tentative, modifions légèrement les headers
				if (options.headers) {
					options.headers['x-request-id'] = generateUUID();
					options.headers['x-timestamp'] = Date.now().toString();
				}
			}

			// Use fetchWithHumanBehavior for more natural requests
			const response = await fetchWithHumanBehavior(url, { ...options, signal: controller.signal });
			clearTimeout(timeout);
			
			// Stocker la réponse pour analyse
			lastResponse = response.clone();
			
			// Check if response indicates blocking
			if (response.status === 403 || response.status === 429) {
				// Tenter de récupérer le texte de la réponse pour analyse
				const responseText = await response.text();
				
				// Vérifier si c'est un challenge PerimeterX
				if (responseText.includes('_px') || responseText.includes('captcha')) {
					await self.customLog(`PerimeterX challenge détecté. Tentative ${i + 1}/${retries}`, true);
					
					// Attendre plus longtemps pour ce type d'erreur
					await self.delay(5000 + Math.random() * 5000);
					
					// Rafraîchir les cookies si possible
					await self.refreshCookies();
					continue; // Retry
				}
				
				await self.customLog(`Rate limit detected (${response.status}). Tentative ${i + 1}/${retries}`, true);
				continue; // Retry
			}

			if (!response.ok) {
				await self.customLog(`HTTP Error ${response.status}`, true);
				throw new Error(`HTTP Error ${response.status}`);
			}

			// Tenter de parser la réponse JSON
			try {
				return await response.json();
			} catch (jsonError) {
				throw new Error(`Erreur de parsing JSON: ${jsonError.message}`);
			}
		} catch (error) {
			clearTimeout(timeout);
			lastError = error;
			console.log(`Retry ${i + 1} failed`, error);
			
			// Si c'est la dernière tentative, on retourne null
			if (i === retries - 1) {
				return null;
			}
		}
	}
	
	return null;
};

SP.payload = function(shoesIdList) {
	return {
		operationName: "GetShoesData",
		query: `
query GetShoesData($ids: [String!]!) {
products(ids: $ids) {
id
urlKey
variants {
id
market(currencyCode: EUR) {
bidAskData(country: "FR", market: null) {
lowestAsk
}
}
sizeChart {
displayOptions {
size
type
}
}
}
}
}`,
		variables: { ids: shoesIdList }
	};
};

SP.asyncTools = async function(shoesId) {
	var self = this;
	await self.delay(Math.floor(Math.random() * 2000) + 1000); // Délai plus aléatoire

	// Récupérer les données de session actuelles
	const sessionData = {
		cookies: document.cookie,
		userAgent: navigator.userAgent,
		language: navigator.language,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		platform: navigator.platform,
		referrer: document.referrer || 'https://www.google.com/search?q=stockx',
		deviceMemory: navigator.deviceMemory || 'unknown',
		screen: {
		  width: screen.width,
		  height: screen.height,
		  pixelDepth: screen.pixelDepth,
		},
		stockxUUID: window.localStorage.getItem('x-stockx-device-uuid') || generateRandomDeviceId(),
	};

	// Nombre maximum de tentatives
	const maxRetries = 5;
	let attempt = 0;
	let lastError = null;

	while (attempt < maxRetries) {
		try {
			// Construire le payload avec une légère variation
			const payload = self.payload(shoesId);
			
			// Ajouter une légère variation au payload
			if (Math.random() > 0.5) {
				payload.query = payload.query.replace(/\s+/g, ' ');
			}
			
			// Créer des headers dynamiques pour cette requête
			const dynamicHeaders = {
				...HEADERS,
				'User-Agent': navigator.userAgent,
				'Accept-Language': navigator.language,
				'x-stockx-device-id': sessionData.stockxUUID,
				'x-request-id': generateUUID(),
			};
			
			// Ajouter les cookies PerimeterX directement dans les headers
			document.cookie.split(';').forEach(cookie => {
				const [name, value] = cookie.trim().split('=');
				if (name && name.includes('_px')) {
					const headerName = name.replace('_', '');
					dynamicHeaders[headerName] = value;
				}
			});

			const response = await self.fetchWithRetry(self.api, {
				method: 'POST',
				headers: dynamicHeaders,
				body: JSON.stringify(payload),
			});

			if (!response) {
				throw new Error('Réponse vide');
			}

			if (response.errors) {
				await self.customLog(`Erreur GraphQL: ${response.errors[0].message} pour la chaussure ${shoesId}`, true);
				throw new Error(response.errors[0].message);
			}

			await self.customLog(`Request ======> ${shoesId} ==> OK`);

			if (!response.data) {
				throw new Error('Données manquantes dans la réponse');
			}

			return response.data.products;

		} catch (err) {
			lastError = err;
			attempt++;
			
			// Attendre plus longtemps entre les tentatives
			const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 2000;
			await self.delay(backoffDelay);
			
			await self.customLog(`Tentative ${attempt}/${maxRetries} échouée pour ${shoesId}: ${err.message}`, true);
		}
	}

	// Toutes les tentatives ont échoué
	await self.customLog(`Échec après ${maxRetries} tentatives pour la chaussure ${shoesId}: ${lastError?.message}`, true);
	
	if (self.current && !self.done[self.current.id]) {
		self.queue[self.current.id] = self.current;
	}
	
	return null;
};

// Example request method using fetchWithRetry
SP.fetchStockXData = async function(shoesIdList = []) {
	var self = this;
	let allData = [];

	try {
		const results = await Promise.allSettled(shoesIdList.map(id => self.asyncTools(id)));

		for (const result of results) {
			if (result.status === 'fulfilled' && result.value) {
				allData.push(result.value);
			} else {
				await self.customLog(`Echec de traitement pour une chaussure: ${result.reason}`, true);
			}
		}
	} catch (error) {
		console.log(error);
		await self.customLog(`Echec de recuperation des donnees de StockX: ${error.message}`, true);
	}

	const flatResult = allData.flat();

	if (flatResult.length !== shoesIdList.length) {
		const errorMessage = `Toutes les chaussure n'ont pas ete recuperee de stockx, effectué: ${flatResult.length} sur ${shoesIdList.length}`;
		await self.customLog(errorMessage, true);
	}

	const shoesErrors = flatResult.map((d, i) => (d ? null : shoesIdList[i])).filter(x => x);

	return [flatResult, shoesErrors];
};

SP.snakeToCamelCase = function(snakeStr) {
	return snakeStr.replace(/(_\w)/g, m => m[1].toUpperCase());
};

SP.adaptValue = function(key, value) {
	if (key === "id") {
		return "gid://shopify/ProductVariant/" + value;
	}
	return value;
};

SP.sortVariantsBySize = function(variants) {
	variants.forEach(variant => {
		variant.floatSize = parseFloat(variant.options[0]);
	});

	variants.sort((a, b) => a.floatSize - b.floatSize);

	variants.forEach(variant => {
		delete variant.floatSize;
	});

	return variants;
};

SP.createPointure = function (raw) {
	var self = this;
	let size = null;
	const sizes = raw.sizeChart.displayOptions;
	const rawSize = sizes.filter(s => s.type === "eu").map(s => s.size);

	if (rawSize.length === 1) {
		size = rawSize[0].startsWith("EU ") ? rawSize[0].substring(3) : rawSize[0];
	}

	const price = raw.market.bidAskData.lowestAsk;

	function newPrice() {
		if (price !== null) {
			let priceFluctuation;
			if (price >= 0 && price <= 30) {
				priceFluctuation = 30;
			} else if (price >= 31 && price <= 40) {
				priceFluctuation = 40;
			} else if (price >= 41 && price <= 50) {
				priceFluctuation = 60;
			} else if (price >= 51 && price <= 70) {
				priceFluctuation = 70;
			} else if (price >= 71 && price <= 85) {
				priceFluctuation = 80;
			} else if (price >= 86 && price <= 100) {
				priceFluctuation = 90;
			} else if (price >= 101 && price <= 125) {
				priceFluctuation = 100;
			} else if (price >= 126 && price <= 150) {
				priceFluctuation = 105;
			} else if (price >= 151 && price <= 200) {
				priceFluctuation = 105;
			} else if (price >= 201 && price <= 250) {
				priceFluctuation = 120;
			} else if (price >= 251 && price <= 350) {
				priceFluctuation = 130;
			} else if (price >= 351 && price <= 450) {
				priceFluctuation = 150;
			} else if (price >= 451 && price <= 600) {
				priceFluctuation = 170;
			} else if (price >= 601 && price <= 800) {
				priceFluctuation = 200;
			} else if (price >= 801 && price <= 1000) {
				priceFluctuation = 250;
			} else if (price >= 1001 && price <= 1400) {
				priceFluctuation = 290;
			} else if (price >= 1401 && price <= 1800) {
				priceFluctuation = 300;
			} else if (price >= 1801 && price <= 2000) {
				priceFluctuation = 450;
			} else if (price >= 2001 && price <= 3000) {
				priceFluctuation = 550;
			} else if (price >= 3001 && price <= 5000) {
				priceFluctuation = 700;
			} else if (price >= 5001 && price <= 10000) {
				priceFluctuation = 2000;
			} else if (price >= 10001 && price <= 50000) {
				priceFluctuation = 4500;
			} else if (price > 50000) {
				priceFluctuation = 15000;
			} else {
				return null; // Cas où le prix est négatif ou invalide
			}
			let newPrice = 5 * Math.round((price + priceFluctuation) / 5);
			if (newPrice % 10 === 0) {
				newPrice -= 1;
			}
			return newPrice;
		}
		return null; // Retourne null si le prix est indisponible
	}

	function makePayload(variantShopifyId = null, defaultPrice = 500) {
		const newPriceVal = newPrice();
		let result;
		if (newPriceVal !== null) {
			result = {
				inventory_management: "SHOPIFY",
				inventory_policy: "CONTINUE",
				price: newPriceVal
			};
		} else {
			result = {
				inventory_management: "SHOPIFY",
				inventory_policy: "DENY", // Modification : Inventory policy est deny si le prix est indisponible
				price: defaultPrice
			};
		}
		if (variantShopifyId !== null) {
			result.id = variantShopifyId;
		} else {
			result.options = [String(size)];
		}
		return result;
	}

	return {
		size,
		price,
		newPrice,
		makePayload,
		toString: function () {
			return `Pointure(size=${size}, price=${price})`;
		}
	};
};

SP.getShopify = async function(productId) {
	var self = this;

	// GraphQL query to fetch product options
	const query = `
query getProduct($id: ID!) {
product(id: $id) {
id
options {
name
values
}
}
}`;

	// Payload for the request
	const payload = {
		query: query,
		variables: {
			id: `gid://shopify/Product/${productId}`
		}
	};

	try {
		// Make the request to Shopify
		const response = await self.fetchWithRetry(self.proxy_url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Shopify-Access-Token': self.proxy_token
			},
			body: JSON.stringify(payload)
		});

		// Parse the response
		if (response && response.data && response.data.product) {
			const product = response.data.product;
			console.log("Shopify Product Options:", product.options);
			return product.options; // Return options for further processing
		} else {
			console.log("Failed to fetch product options:", response);
			return null;
		}
	} catch (error) {
		console.log("Error fetching Shopify product options:", error);
		return null;
	}
};

SP.createChaussure = function (data, shopifyId) {
	var self = this;

	if (data === null) {
		const errorMessage = `La chaussure n°${shopifyId} ne possède pas d'information`;
		self.customLog(errorMessage, true); // Custom logging
		return;
	}

	const shoeId = data.urlKey;
	const pointures = data.variants.map(rawVariant => self.createPointure(rawVariant));

	async function pushAll() {
		const variantsBuilder = {};
		pointures.forEach(variant => {
			const data = variant.makePayload();
			if (variant.size !== null) {
				variantsBuilder[variant.size] = data;
			}
		});


		const variants = Object.values(variantsBuilder);
		const payloadData = payload(shopifyId, variants);

		try {
			const response = await self.fetchWithRetry(self.proxy_url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Shopify-Access-Token': self.proxy_token
				},
				body: JSON.stringify(payloadData)
			}, 5);
			//await self.delay();
      self.increment();
			return response;

		} catch (error) {
			await self.customLog(`Echec de la création de la chaussure ${shoeId}: ${error.message}`, true);
		}
	}


	function payload(productId, variantsData) {
		const variantsDataFormatted = variantsData.map(variant => {
			return Object.keys(variant).reduce((acc, key) => {
				acc[self.snakeToCamelCase(key)] = self.adaptValue(key, variant[key]);
				return acc;
			}, {});
		});

		var sorted = self.sortVariantsBySize(variantsDataFormatted);
		return {
			query: `
mutation productUpdate($input: ProductInput!) {
productUpdate(input: $input) {
product {
id
}
userErrors {
field
message
}
}
}`,
			variables: {
				input: {
					id: "gid://shopify/Product/" + productId,
					variants: sorted
				}
			}
		};
	}

	return {
		shoeId,
		pointures,
		pushAll,
		toString: function () {
			return `Chaussure(shoeId=${shoeId}, pointures=${pointures.length})`;
		}
	};
};

SP.keepLowPrice = function (allRawSrcData, allShopifyIds) {
	var self = this;
	const noInfo = [];
	const allChaussures = allRawSrcData.map((data, i) => {
		try {
			return self.createChaussure(data, allShopifyIds[i]);
		} catch (err) {
			noInfo.push({
				err: err.message,
				stockxId: data.urlKey,
				shopifyId: allShopifyIds[i]
			});
			self.customLog(`Erreur lors de la creation de la chaussure: ${err.message}`, true); // Custom logging
			return null;
		}
	}).filter(x => x);

	const nbChaussures = allChaussures.length;

	async function pushAll() {
		const updates = [];
		for (let i = 0; i < nbChaussures; i++) {
			try {
				const res = await allChaussures[i].pushAll();
				updates.push(res);
			} catch (error) {
				self.next();
				self.customLog(`Une erreur est survenue lors de la mise a jours shopify ${allChaussures[i].shopifyId}: ${error.message}`, true); // Custom logging
			}
		}
		return updates;
	}

	return {
		allChaussures,
		pushAll,
		noInfo
	};
};
SP.refreshCookies = async function() {
	try {
		// Faire une requête simple à la page d'accueil pour rafraîchir les cookies
		await fetch('https://stockx.com/', {
			method: 'GET',
			credentials: 'include',
			headers: {
				'User-Agent': navigator.userAgent,
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': navigator.language,
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache'
			}
		});
		
		await this.customLog('Cookies rafraîchis');
	} catch (error) {
		await this.customLog(`Erreur lors du rafraîchissement des cookies: ${error.message}`, true);
	}
};

SP.retry = async function() {
	var self = this;
	for (var key in self.queue) {
		var item = self.queue[key];


		if (item.shoe) {
			await item.shoe.pushAll();
			continue;
		}

		if (item.data) {
			var shoe = self.createChaussure(item.data[0], item.id);
			await shoe.pushAll();
			continue;
		} else {
			const stockxData = await self.asyncTools([item.item.title]);
			self.current.data = stockxData;
			const shoe = self.createChaussure(stockxData[0], item.id);
			self.current.shoe = shoe;
			await shoe.pushAll();
		}

		self.done[item.id] = 1;
		delete self.queue[item.id];
	}
};
SP.getTitles = function (items) {
	var titles = [];

	for (var item of items) {
		titles.push(item.title);
	}

	return titles;
};

SP.start = async function () {
	var self = this;
	const fileContent = self.content;
	self.index = 1;
	if (fileContent.length > 0)
		self.customLog(`DEBUT de mise a jours: ${self.file_url}, count: ${fileContent.length}`, true);

	var groups = {};

	fileContent.wait(function(item1, resume) {
		const rawUrl = item1.link.trim();
		const shopifyId = item1.shoeid.trim();
		const stockxTitle = new URL(rawUrl).pathname.split("/").pop();
		//await self.delay();
		var current = { items: [], id: shopifyId };
		var link = {};
		link.id = shopifyId;
		link.url = rawUrl;
		link.id = shopifyId;
		link.title = stockxTitle;


		if (!groups[link.id]) {
			groups[link.id] = { items: [link], id: shopifyId };
		} else {
			groups[link.id].items.push(link);
		}

	
		resume();
	}, async function() {
		var ids = Object.keys(groups);
    self.total = ids.length;
		ids.wait(async function(id, next) {
			var items = groups[id].items;

			self.next = next;
			self.current = groups[id];
			var titles = self.getTitles(items);
			self.current.titles = titles.join(',');
			const stockxData = await self.asyncTools(titles);
			console.log(self.current);
			if (!stockxData) {
				self.index++;
				next();
				return;
			}

			var obj = { urlKey: id, variants: [] };
			for (var element of stockxData) {
				if (element && element.variants) {
					for (var el of element.variants)
						obj.variants.push(el);

				}
			}

			self.current.data = obj;

			const shoe = self.createChaussure(obj, id);
			self.current.shoe = shoe;
			if (!shoe) {
				self.index++;
				next();
				return;
			}
			await shoe.pushAll();
			self.index++;
			next();
		}, function() {
		if (Object.keys(self.queue).length > 0)
			self.retry();

		console.log(self);
		self.customLog(`FIN de mise a jours: ${self.file_url}, retries: ${Object.keys(self.queue).length}`, true);
		});
	});
};

SP.increment = function() {
	this.index_cache();
//   chrome.runtime.sendMessage({ action: 'tab_progress', start: start, total: this.total, index: this.i });

};
SP.index_cache = function() {
	localStorage.setItem(this.cache_key, this.i);
	this.i++;
};
  	
//   useFetchMiddleware(async (req, next) => {

//     const response = await next(req);
  
//     if (response.status === 401) {
//       console.warn('🔐 Unauthorized. Maybe refresh token?');
//       // Potential auto-refresh logic
//     }
//     if (req.input.includes('/api/p/e')) {
//       const cloned = response.clone();
//       const data = await cloned.json();
//       console.log('🎯 Special route req:');
//       sendtocontent(response);
//       console.log('🎯 Special route payload:', response);
//     }
//     return response;
//   });


  console.log('[Injected] Loaded');
  window.postMessage({
    source: 'my-extension',
    type: 'HELLO_FROM_INJECTED',
    payload: { msg: 'It works!' }
  }, '*');


function sendtocontent(payload) {
window.postMessage({
    source: 'my-extension',
    type: 'HELLO_FROM_INJECTED',
    payload: payload
    }, '*');

}

// injected.js
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source === 'content-script' && event.data?.type === 'DATA_READY') {
        let payload = event.data.payload;
        const sampleSize = payload.sampleSize || 0;
        const startParam = payload.start;
        const endParam = payload.end;
        
        console.log('[Injected.js] Received message from content.js:', event.data.payload);
        console.log('DATA_READY', payload);
        
        let items = payload.items;
        
        // Appliquer l'échantillonnage si demandé
        if (sampleSize > 0 && items.length > sampleSize) {
            console.log(`Échantillonnage activé: ${sampleSize} éléments sur ${items.length}`);
            // Option 1: Prendre les premiers éléments
            items = items.slice(0, sampleSize);
            
            // Option 2 (alternative): Prendre des éléments aléatoires
            // items = getRandomSample(items, sampleSize);
        }
        
        // Initialiser le Scraper avec les options d'échantillonnage
        let scraper = new Scraper(items, {
            sampleMode: sampleSize > 0,
            sampleSize: sampleSize
        });
        
        // Utiliser le Scraper au lieu de la redirection directe
        scraper.start();
        
        // Commenter cette partie pour éviter la redirection directe
        /*
        items && items.wait(async function(link, next) {
            console.log(link);
            fetch(link.link, { 
                method: 'GET'
            }).then(async function(response) {
                let html = await response.text();
                window.location.href = link.link;
            });
        }, function() {

        });
        */
    }
});


  function downloadAsHTML(text, filename) {
    const blob = new Blob([text], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
  
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.html') ? filename : `${filename}.html`;
    document.body.appendChild(link);
    link.click();
  
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

// Fonction pour obtenir un échantillon aléatoire
function getRandomSample(array, size) {
    if (size >= array.length) return array;
    
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled.slice(0, size);
}
const ZENROWS_API_KEY = 'ce4b270edd469da1fa2ac04bba5dd7bd58a05301';
const ZENROWS_PROXY_URL = 'https://api.zenrows.com/v1/';

const originalFetch = window.fetch;
let lastValidRequest = null;

// Fonction pour surveiller et capturer les cookies PerimeterX
function monitorPerimeterXCookies() {
  const originalSetCookie = document.__lookupSetter__('cookie');
  const originalGetCookie = document.__lookupGetter__('cookie');
  
  // Stocker les cookies PerimeterX
  let pxCookies = {};
  
  // Intercepter les écritures de cookies
  Object.defineProperty(document, 'cookie', {
    set: function(value) {
      // Appeler le setter original
      originalSetCookie.call(document, value);
      
      // Capturer les cookies PerimeterX
      try {
        const cookieParts = value.split(';')[0].trim().split('=');
        const name = cookieParts[0];
        const cookieValue = cookieParts.slice(1).join('=');
        
        if (name && name.includes('_px')) {
          pxCookies[name] = cookieValue;
          console.log(`Cookie PerimeterX capturé: ${name}=${cookieValue}`);
          
          // Stocker dans localStorage pour persistance
          localStorage.setItem('px_cookies', JSON.stringify(pxCookies));
        }
      } catch (e) {
        console.error('Erreur lors de la capture du cookie:', e);
      }
    },
    get: function() {
      return originalGetCookie.call(document);
    }
  });
  
  // Charger les cookies stockés précédemment
  try {
    const storedCookies = localStorage.getItem('px_cookies');
    if (storedCookies) {
      pxCookies = JSON.parse(storedCookies);
      console.log('Cookies PerimeterX chargés:', pxCookies);
    }
  } catch (e) {
    console.error('Erreur lors du chargement des cookies stockés:', e);
  }
  
  return pxCookies;
}

// Initialiser le monitoring des cookies
let pxCookies = monitorPerimeterXCookies();

// Intercepter toutes les requêtes fetch
window.fetch = async function(input, init = {}) {
  try {
    // Determine if this is a StockX GraphQL request
    const isStockXRequest = input.toString().includes('graphql') || 
      (init.body && typeof init.body === 'string' && init.body.includes('operationName'));
    
    if (isStockXRequest) {
      console.log('Requête GraphQL StockX détectée:', input, init);
      
      // Store original URL and prepare ZenRows URL
      const originalUrl = input.toString();
      const zenrowsUrl = `${ZENROWS_PROXY_URL}?url=${encodeURIComponent(originalUrl)}&apikey=${ZENROWS_API_KEY}`;
      
      // Prepare headers for ZenRows
      const newInit = { ...init };
      newInit.headers = {
        ...newInit.headers,
        'Content-Type': 'application/json',
        // Add any specific ZenRows parameters as needed
        'x-zenrows-custom-headers': JSON.stringify({
          'apollographql-client-name': 'stockx-web',
          'app-platform': 'web',
          'app-version': '2023.07.01.01',
          ...pxCookies // Include PerimeterX cookies
        })
      };
      
      // Store for reuse
      lastValidRequest = {
        url: originalUrl,
        init: JSON.parse(JSON.stringify(newInit))
      };
      
      // Make request through ZenRows
      const response = await originalFetch(zenrowsUrl, newInit);
      
      // Handle response
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response;
    }
    
    // Non-StockX requests proceed normally
    return await originalFetch(input, init);
    
  } catch (error) {
    console.error('Erreur dans fetch intercepté:', error);
    return await originalFetch(input, init);
  }
};

// Fonction pour réutiliser la dernière requête valide
async function reuseLastValidRequest(newBody) {
  if (!lastValidRequest) {
    console.error('Aucune requête valide disponible à réutiliser');
    return null;
  }
  
  try {
    // Créer une copie de la dernière requête valide
    const request = {
      ...lastValidRequest.init,
      body: newBody || lastValidRequest.init.body
    };
    
    // Ajouter les cookies PerimeterX aux headers
    if (!request.headers) request.headers = {};
    if (Object.keys(pxCookies).length > 0) {
      const cookieString = Object.entries(pxCookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      request.headers['Cookie'] = cookieString;
    }
    
    // Exécuter la requête
    return await originalFetch(lastValidRequest.url, request);
  } catch (error) {
    console.error('Erreur lors de la réutilisation de la requête:', error);
    return null;
  }
}

// Exemple d'utilisation pour récupérer des données de produit
async function fetchProductData(productId) {
  try {
    // Attendre que des requêtes légitimes soient capturées
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (lastValidRequest) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);
      
      // Timeout après 10 secondes
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10000);
    });
    
    if (!lastValidRequest) {
      console.error('Aucune requête valide capturée');
      return null;
    }
    
    // Créer un nouveau corps de requête basé sur le dernier valide
    const newBody = JSON.stringify({
      // Adapter selon vos besoins
      operationName: "GetProduct",
      variables: {
        id: productId
      },
      query: "query GetProduct($id: ID!) { product(id: $id) { id name price } }"
    });
    
    // Utiliser la fonction de retry avec la requête clonée
    const response = await fetchWithRetry(lastValidRequest.url, {
      ...lastValidRequest.init,
      body: newBody
    }, 5);
    
    return await response.json();
  } catch (error) {
    console.error('Erreur lors de la récupération des données produit:', error);
    return null;
  }
}

// Test avec un ID de produit
// fetchProductData('some-product-id').then(data => console.log('Données produit:', data));

// Ajouter au début de votre fichier inject.js

// Modifier l'empreinte Canvas
(function() {
  // Sauvegarder les fonctions originales
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  
  // Remplacer getContext pour modifier subtilement le rendu
  HTMLCanvasElement.prototype.getContext = function(type, attributes) {
    const context = originalGetContext.call(this, type, attributes);
    if (type === '2d') {
      // Sauvegarder la fonction fillText originale
      const originalFillText = context.fillText;
      
      // Remplacer fillText pour ajouter une variation subtile
      context.fillText = function(text, x, y, maxWidth) {
        // Si le texte ressemble à celui utilisé par PerimeterX pour le fingerprinting
        if (text === 'mmmmmmmmmmlli' || text.length > 10) {
          // Ajouter une variation subtile à la position
          const newX = x + (Math.random() * 0.02 - 0.01);
          return originalFillText.call(this, text, newX, y, maxWidth);
        }
        return originalFillText.call(this, text, x, y, maxWidth);
      };
    }
    return context;
  };
  
  // Modifier légèrement les données d'image pour éviter le fingerprinting
  CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
    const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
    
    // Modifier subtilement quelques pixels si c'est probablement un test de fingerprinting
    if (sw < 200 && sh < 200 && imageData.data.length > 0) {
      // Modifier un pixel aléatoire de façon subtile
      const randomIndex = Math.floor(Math.random() * imageData.data.length / 4) * 4;
      imageData.data[randomIndex] = Math.max(0, Math.min(255, imageData.data[randomIndex] + (Math.random() > 0.5 ? 1 : -1)));
    }
    
    return imageData;
  };
})();

// Ajouter cette fonction à votre code
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Fonction améliorée pour simuler un comportement humain
async function fetchWithHumanBehavior(url, options) {
  // Simuler un délai humain aléatoire entre les requêtes (plus variable)
  await randomDelay(800, 3500);
  
  // Cloner les options pour ne pas modifier l'original
  const newOptions = JSON.parse(JSON.stringify(options));
  
  // Ajouter les cookies PerimeterX capturés
  if (!newOptions.headers) newOptions.headers = {};
  
  // Ajouter des headers dynamiques qui changent à chaque requête
  newOptions.headers = {
    ...newOptions.headers,
    'x-stockx-device-id': localStorage.getItem('x-stockx-device-uuid') || generateRandomDeviceId(),
    'x-request-id': generateUUID(),
    'x-timestamp': Date.now().toString(),
  };
  
  // Ajouter une légère variation aux headers à chaque requête
  if (Math.random() > 0.3) {
    // Varier légèrement l'ordre des headers (important pour éviter les patterns)
    const headerEntries = Object.entries(newOptions.headers);
    headerEntries.sort(() => Math.random() - 0.5);
    newOptions.headers = Object.fromEntries(headerEntries);
  }
  
  // Ajouter le cookie document.cookie à la requête
  if (document.cookie) {
    const cookies = {};
    document.cookie.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name) cookies[name] = value;
    });
    
    // Ajouter les cookies PerimeterX directement dans les headers
    if (cookies['_px3']) newOptions.headers['px3'] = cookies['_px3'];
    if (cookies['_pxvid']) newOptions.headers['pxvid'] = cookies['_pxvid'];
    if (cookies['_pxhd']) newOptions.headers['pxhd'] = cookies['_pxhd'];
  }
  
  // Simuler un clic aléatoire sur la page avant la requête
  if (Math.random() > 0.7) {
    simulateRandomClick();
  }
  
  // Ajouter un paramètre aléatoire à l'URL pour éviter la mise en cache
  const urlWithNoise = url.includes('?') 
    ? `${url}&_=${Date.now()}` 
    : `${url}?_=${Date.now()}`;
  
  // Preserve the AbortSignal from the original options
  const signal = options.signal;
  delete newOptions.signal;  // Remove it from the cloned options

  return fetch(urlWithNoise, {
    ...newOptions,
    signal  // Add it back properly
  });
}

// Fonctions utilitaires pour fetchWithHumanBehavior
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateRandomDeviceId() {
  return btoa(generateUUID()).substring(0, 32);
}

function simulateRandomClick() {
  try {
    const x = Math.floor(Math.random() * window.innerWidth);
    const y = Math.floor(Math.random() * window.innerHeight);
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y
    });
    document.elementFromPoint(x, y)?.dispatchEvent(clickEvent);
  } catch (e) {
    // Ignorer les erreurs de simulation
  }
}

// Fonction pour établir une connexion WebSocket sécurisée
function setupSecureWebSocket(url) {
  const ws = new WebSocket(url);
  
  ws.onopen = () => {
    console.log('WebSocket connecté');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      // Traiter les données reçues
    } catch (e) {
      console.error('Erreur de parsing WebSocket:', e);
    }
  };
  
  ws.onerror = (error) => {
    console.error('Erreur WebSocket:', error);
  };
  
  return ws;
}

// Fonction pour établir une connexion WebSocket sécurisée
function setupSecureWebSocket(url) {
  const ws = new WebSocket(url);
  
  ws.onopen = () => {
    console.log('WebSocket connecté');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      // Traiter les données reçues
    } catch (e) {
      console.error('Erreur de parsing WebSocket:', e);
    }
  };
  
  ws.onerror = (error) => {
    console.error('Erreur WebSocket:', error);
  };
  
  return ws;
}