const urlParams = new URLSearchParams(window.location.search);
const start = urlParams.get('start');
const end = urlParams.get('end');


const PROXYSERVER = "https://rehane.innovxpro.com/proxy";
const PROXYSERVER_TOKEN = "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";
const API_STOCKSX = "https://stockx.com/api/p/e";
const TARGET_URL = "https://stockx.com";

function Scraper(content) {
  this.file_url = '[placeholder]';
	this.content = content;
	this.proxy_url = PROXYSERVER;
	this.proxy_token = PROXYSERVER_TOKEN;
	this.api = API_STOCKSX;
	this.target = TARGET_URL;
  this.total = content.length;
  this.i = 0;
	this.newData = [];
	this.oldData = [];
	this.queue = {};
	this.queue2 = [];
	this.done = {};
	this.isOnline = true;

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
	onItem.call(self, item, tmp.next, tmp.index);

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


const SP = Scraper.prototype;

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
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
	'Accept-Language': 'fr-FR',
	'apollographql-client-name': 'Iron',
	'apollographql-client-version': '2023.09.24.00',
	'App-Platform': 'Iron',
	'App-Version': '2023.09.24.00',
	'Accept': 'application/json',
	'Content-Type': 'application/json',
	'x-stockx-device-id': 'eyJhbGciOiJkaXIiLCJjdHkiOiJKV1QiLCJlbmMiOiJBMTI4R0NNIiwidHlwIjoiSldUIn0',
	'operationName': 'GetShoesData'
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
		try {
			await self.fetchWithRetry(`${PROXYSERVER}/log`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${PROXYSERVER_TOKEN}`
				},
				body: JSON.stringify({ message, type: 'error', data: self.current })
			}, 3);
		} catch (logError) {
			console.log('Failed to send log to server:', logError);
		}
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
	// Check if the browser is offline
	if (!self.isOnline) {
		console.warn('Offline: Request queued.');
		self.queue2.push({ url, options });
		return;  // Exit without making the request
	}

	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url, options);
			if (!response.ok) {
				const errorMessage = `Erreur HTTP! status: ${response.status}`;
				self.customLog(errorMessage, true); // Custom logging
				if (self.current && !self.done[self.current.id])
					self.queue[self.current.id] = self.current;
			}
			return await response.json();
		} catch (error) {
			if (i === retries - 1) {
				// On final retry, add to queue if online check fails again
				if (!navigator.onLine) {
					console.warn('Still offline: Request re-queued.');
					this.queue2.push({ url, options });
				}
			}
		}
	}
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
	await self.delay(2300);
	const response = await self.fetchWithRetry(self.api, {
		method: 'POST',
		headers: HEADERS,
		body: JSON.stringify(self.payload(shoesId)),
	});

	if (response.errors) {
		await self.customLog(`Erreur GraphQL: ${response.errors[0].message} pour la chaussure ${shoesId}`, true);
		if (self.current && !self.done[self.current.id])
			self.queue[self.current.id] = self.current;

		self.next();
	}

	await self.customLog(`Request ======> ${shoesId} ==> OK`);
	return response.data.products;
};

// Example request method using fetchWithRetry
SP.fetchStockXData = async function(shoesIdList = []) {
	var self = this;
	let allData = [];

	try {
		for (let i = 0; i < shoesIdList.length; i++) {
			const shoeId = shoesIdList[i];
			const data = await this.asyncTools(shoeId);  // Assuming asyncTools also uses fetchWithRetry
			allData.push(data);
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

	console.log('SIZES: ', rawSize);
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
  this.i++;
  chrome.runtime.sendMessage({ action: 'tab_progress', start: start, total: this.total, index: this.i });
};

const URL3 = `https://rehane.dev.acgvas.com/proxy/list?start=${start || 0 }&take=1010`;
fetch(URL3).then(async function(res) {
  var data = await res.json();
  console.log('Data from url: ', data);
  var scraper = new Scraper(data.items);
  scraper.start();
  console.log(`Instance started with range: ${start} - ${end}`);
  console.log(scraper);
});
