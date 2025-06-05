var ids = {}; // Store opened URLs
var urls = {};
var stats = {};
var tabs = {};
let capturedHeaders = null;
let haslistener = false;
var extra = ['https://stockx.com/?start=3990:new2', 'https://stockx.com/?start=3990:new'];
// Ajouter cette fonction pour vérifier et activer le VPN si nécessaire
// Note: Ceci est conceptuel, l'API exacte dépend d'Opera
function ensureVpnEnabled() {
  try {
    // Vérifier si l'API VPN d'Opera est disponible
    if (chrome.vpnPrivate) {
      chrome.vpnPrivate.getState(state => {
        if (state !== 'connected') {
          console.log('Tentative d\'activation du VPN Opera...');
          chrome.vpnPrivate.connect();
        } else {
          console.log('VPN Opera déjà activé');
        }
      });
    }
  } catch (error) {
    console.error('Erreur lors de la vérification du VPN:', error);
  }
}

// Appeler cette fonction avant d'ouvrir les onglets StockX
function openStockXTabs() {
  const RANGE = 1010;
  const URL = 'https://rehane.dev.acgvas.com/proxy/list?start=0&all=true';

  fetch(URL)
    .then(async res => {
      var data = await res.json();
      const totalItems = data.length;
      let start = 0;
      const total = totalItems / RANGE;
      console.log('This is total number of tabs:', Math.floor(total));

      for (let i = 0, len = Math.floor(total) + 1; i < len; i++) {

        let islast = (i + 1) == len;
        console.log(i, len);
        const tabURL = `https://stockx.com/fr-fr/air-jordan-1-retro-low-og-sp-travis-scott-canary-ps?start=${Math.floor(start)}&end=${Math.floor(RANGE)}`;
        // Check if the tab URL is already opened
        if (!ids[tabURL]) {
          chrome.tabs.create({ url: tabURL, active: false }, (tab) => {
            var split = tabURL.split('start=')[1];
            var key = split.split('&')[0]
            urls[start] = tabURL;
            ids[tabURL] = tab.id;
            tabs[key] = tab.id;
            // Wait for the tab to fully load before messaging
            console.log('Islast', islast, len);
            const listener = function(tabId, info) {
              if (tabId === tab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                islast && chrome.tabs.update(tab.id, { active: true });
                islast && focus_cycle(len);
                // create extra 

                if (islast) {
                  for (var link of extra) {
                    chrome.tabs.create({ url: link, active: false });
                  }
                }
               
              }
            };
          
            chrome.tabs.onUpdated.addListener(listener);
          });
          
        } else {
          console.log('Tab already exists for URL:', tabURL);
        }
        if (start == 0) {
          start = RANGE - 20
        } else {
          start += 1000;
        }
      }
    })
    .catch(error => console.error('Error fetching data:', error));
}

// Listener for the alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'openStockXTabs') {
    openStockXTabs();
  }
});

// Schedule the extension to run every 2 days
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('openStockXTabs', { periodInMinutes: 2 * 24 * 60 });
});

// Listener for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openStockXTabs') {
    openStockXTabs(request.sampleSize || 0);
    sendResponse({ status: 'Tabs opened' });
    return true; // Keep the message channel open for asynchronous response
  }
});

function openStockXTabs(sampleSize = 0) {
  ensureVpnEnabled();
  const RANGE = 1010;
  const URL = 'https://rehane.dev.acgvas.com/proxy/list?start=0&all=true';

  fetch(URL)
    .then(async res => {
      var data = await res.json();
      const totalItems = data.length;
      let start = 0;
      const total = totalItems / RANGE;
      console.log('This is total number of tabs:', Math.floor(total));
      
      // Si l'échantillonnage est activé (sampleSize > 0), ouvrir un seul onglet
      let tabsToOpen = sampleSize > 0 ? 1 : Math.floor(total) + 1;
      console.log(`Nombre d'onglets à ouvrir: ${tabsToOpen}`);

      for (let i = 0, len = tabsToOpen; i < len; i++) {
        let islast = (i + 1) == len;
        console.log(i, len);
        // Ajouter le paramètre sample à l'URL
        const tabURL = `https://stockx.com/travis-scott-x-fc-barcelona-2024-25-match-away-cactus-jack-jersey-black?start=${Math.floor(start)}&end=${Math.floor(RANGE)}&sample=${sampleSize}`;
        // Check if the tab URL is already opened
        if (!ids[tabURL]) {
          chrome.tabs.create({ url: tabURL, active: false }, (tab) => {
            var split = tabURL.split('start=')[1];
            var key = split.split('&')[0]
            urls[start] = tabURL;
            ids[tabURL] = tab.id;
            tabs[key] = tab.id;
            // Wait for the tab to fully load before messaging
            console.log('Islast', islast, len);
            const listener = function(tabId, info) {
              if (tabId === tab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                islast && chrome.tabs.update(tab.id, { active: true });
                islast && focus_cycle(len);
                // create extra 

                if (islast && sampleSize === 0) { // Ajouter les onglets supplémentaires seulement si on n'est pas en mode échantillonnage
                  for (var link of extra) {
                    chrome.tabs.create({ url: link, active: false });
                  }
                }
               
              }
            };
          
            chrome.tabs.onUpdated.addListener(listener);
          });
          
        } else {
          console.log('Tab already exists for URL:', tabURL);
        }
        if (start == 0) {
          start = RANGE - 20
        } else {
          start += 1000;
        }
      }
    })
    .catch(error => console.error('Error fetching data:', error));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open_tabs") {
    openStockXTabs();
    sendResponse({ status: 'Tabs opened' });
    return true; // Keep the message channel open
  }

  if (request.action == 'tab_progress') {
    console.log('RECEIVED PROGRESS DATA', request.start);
    stats[request.start] = { total: request.total, index: request.index };
    refresh();
    sendResponse({ status: 'Progress updated' });
    return true; // Keep the message channel open
  }

  if (request.action == 'fetchItems') {
    const URL3 = request.url;
    const start = request.start;
    var tabid = tabs[start];
    fetch(URL3).then(async function(res) {
      var data = await res.json();
      if (chrome && tabid) {
        try {
          chrome.tabs.sendMessage(tabid, { action: "runItems", data: data}, response => {
            if (chrome.runtime.lastError) {
              console.warn('Error sending message:', chrome.runtime.lastError.message);
            }
            sendResponse({ status: 'Items fetched', data: data });
          });
        } catch (error) {
          console.error('Error sending message to tab:', error);
        }
      }
    }).catch(error => {
      console.error('Error fetching items:', error);
      sendResponse({ status: 'Error', error: error.message });
    });
    return true; // Keep the message channel open
  }
});


function refresh () {
  var arr = [];
  for (key in stats) {
    var data = stats[key];
    var output = { id: key, url: urls[key], total: data.total, index: data.index, percentage: Math.floor((data.index / data.total ) * 100) };
    arr.push(output);  
  }
  try {
    chrome.runtime.sendMessage({ action: 'updateProgress', data: JSON.stringify(arr) });
  } catch (e) {
    console.warn('No listener for updateProgress message');
  }
}

function focus_cycle (len) {
  console.log(chrome.tabs, chrome.windows);
  chrome.tabs.query({}, function(tabs) {
    const originalTab = tabs.find(tab => tab.active);
    let index = len;
  
    function focusNextTab() {
      if (index == tabs.length) {
      // Restore focus to original tab
      chrome.tabs.update(originalTab.id, { active: true });
      return;
      }
  
      const tab = tabs[index];
      chrome.tabs.update(tab.id, { active: true }, () => {
      index--;
      setTimeout(focusNextTab, 30000); // Wait 30s then focus next
      });
    }
    console.log('CURRENT');
  
    focusNextTab();
  })
    
}

// Listener to clean up `ids` when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const url in ids) {
    if (ids[url] === tabId) {
      delete ids[url]; // Remove the closed tab from the list
      console.log('Tab closed, removing URL from list:', url);
      break;
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getHeaders") {
    sendResponse({ headers: capturedHeaders });
    return true; // Keep the message channel open
  }
});

// Fonction pour récupérer les éléments avec prise en compte de l'échantillonnage
async function fetchItems(sampleSize = 0) {
  const URL = 'https://rehane.dev.acgvas.com/proxy/list?start=0&all=true';
  try {
    const response = await fetch(URL);
    let data = await response.json();
    
    // Appliquer l'échantillonnage si demandé
    if (sampleSize > 0 && data.items && data.items.length > sampleSize) {
      console.log(`Échantillonnage activé: ${sampleSize} éléments sur ${data.items.length}`);
      // Option 1: Prendre les premiers éléments
      data.items = data.items.slice(0, sampleSize);
      
      // Option 2 (alternative): Prendre des éléments aléatoires
      // data.items = getRandomSample(data.items, sampleSize);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching items:', error);
    return { items: [] };
  }
}

// Fonction utilitaire pour obtenir un échantillon aléatoire
function getRandomSample(array, size) {
  if (size >= array.length) return array;
  
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, size);
}

// Mise à jour du gestionnaire de messages pour utiliser le paramètre d'échantillonnage
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openStockXTabs') {
    // Si sampleSize > 0, ouvrir un seul onglet et y envoyer les données
    if (message.sampleSize > 0) {
      // Ouvrir un seul onglet
      openStockXTabs(message.sampleSize);
      
      // Récupérer les données avec échantillonnage
      fetchItems(message.sampleSize).then(data => {
        // Attendre que l'onglet soit créé et chargé
        setTimeout(() => {
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs && tabs[0]) {
              try {
                chrome.tabs.sendMessage(tabs[0].id, {
                  action: 'runItems',
                  data: data,
                  sampleSize: message.sampleSize
                }, response => {
                  if (chrome.runtime.lastError) {
                    console.warn('Error sending message:', chrome.runtime.lastError.message);
                  }
                });
              } catch (error) {
                console.error('Error sending message to tab:', error);
              }
            }
          });
        }, 3000); // Attendre 3 secondes pour que l'onglet soit chargé
      });
    } else {
      // Comportement normal sans échantillonnage
      openStockXTabs(0);
      fetchItems(0).then(data => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs && tabs[0]) {
            try {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'runItems',
                data: data,
                sampleSize: 0
              }, response => {
                if (chrome.runtime.lastError) {
                  console.warn('Error sending message:', chrome.runtime.lastError.message);
                }
              });
            } catch (error) {
              console.error('Error sending message to tab:', error);
            }
          }
        });
      });
    }
    sendResponse({ status: 'Tabs opened' });
    return true; // Keep the message channel open
  }
});

// Add Zenrows configuration
const ZENROWS_PROXY_URL = 'https://api.zenrows.com/v1/';  // Replace with your actual URL
const ZENROWS_API_KEY = 'ce4b270edd469da1fa2ac04bba5dd7bd58a05301';  // Replace with your actual API key

// Handle Zenrows requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'zenrows_request') {
    const { url, init, pxCookies } = request;
    // const zenrowsUrl = `${ZENROWS_PROXY_URL}?url=${encodeURIComponent(url)}&apikey=${ZENROWS_API_KEY}&js_render=true`;
    
    // Prepare headers for ZenRows
    const newInit = { 
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-zenrows-custom-headers': JSON.stringify({
          'apollographql-client-name': 'stockx-web',
          'app-platform': 'web',
          'app-version': '2023.07.01.01',
          ...pxCookies
        })
      },
      body: init.body
    };

    // use postViaZenRows
    postViaZenRows(url, newInit.body, newInit.headers);
    return true; // Keep the message channel open
  }
});

async function postViaZenRows(targetUrl, postData = {}, customHeaders = {}) {
  const zenProxyEndpoint = 'https://rehane.dev.acgvas.com/zenrows/proxy';
  const proxyUrl = `${zenProxyEndpoint}?url=${encodeURIComponent(targetUrl)}`;

  console.log("🔁 Préparation requête POST via ZenRows Proxy (custom endpoint)...");
  console.log("🔗 URL cible :", targetUrl);
  console.log("🚪 Proxy utilisé :", proxyUrl);
  console.log("📦 Données envoyées :", postData);
  console.log("🧾 En-têtes custom :", customHeaders);

  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...customHeaders
      },
      body: JSON.stringify(postData)
    });

    const text = await response.text();
    console.log("📨 Réponse brute :", text);

    try {
      const json = JSON.parse(text);
      console.log("✅ Réponse JSON parsée :", json);
      return json;
    } catch (parseErr) {
      console.warn("⚠️ Réponse non-JSON :", text);
      return text;
    }

  } catch (err) {
    console.error("❌ Erreur lors de la requête ZenRows proxy :", err);
    throw err;
  }
}

// ✅ Exemple d’appel :
