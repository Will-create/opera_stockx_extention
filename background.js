var ids = {}; // Store opened URLs
var urls = {};
var stats = {};
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

      for (var i = 0, len = Math.floor(total) + 1; i < len; i++) {
        const tabURL = `https://stockx.com?start=${Math.floor(start)}&end=${Math.floor(RANGE)}`;
        // Check if the tab URL is already opened
        if (!ids[tabURL]) {
          chrome.tabs.create({ url: tabURL, active: false }, (tab) => {
            urls[start] = tabURL;
            ids[tabURL] = tab.id;
          
            // Wait for the tab to fully load before messaging
            const listener = function(tabId, info) {
              if (tabId === tab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.sendMessage(tabId, { action: "startScript" });
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
    openStockXTabs();
    sendResponse({ status: 'Tabs opened' });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open_tabs") {
    openStockXTabs();
  }

  if (request.action == 'tab_progress') {
    stats[request.start] = { total: request.total, index: request.index };
    refresh();
  }
});

function refresh () {
  var arr = [];
  for (key in stats) {
    var data = stats[key];
    var output = { id: key, url: urls[key], total: data.total, index: data.index, percentage: Math.floor((data.index / data.total ) * 100) };
    arr.push(output);  

  chrome && chrome.runtime.sendMessage({ action: 'updateProgress', data: JSON.stringify(arr) });
  }
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
