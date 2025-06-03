const urlParams = new URLSearchParams(window.location.search);
const start = urlParams.get('start');
const end = urlParams.get('end');
const sample = urlParams.get('sample') || 0; // Récupérer le paramètre sample

function injectExternalScript() {
	const script = document.createElement('script');
	script.src = chrome.runtime.getURL('injected.js');
	script.onload = () => script.remove();
	(document.head || document.documentElement).appendChild(script);
  }
  
injectExternalScript();

  	
const URL3 = `https://rehane.dev.acgvas.com/proxy/list?start=${start || 0 }&take=1010`;
chrome.runtime.onMessage.addListener((message) => {
	if (message.action === "runItems") {
	  const data = message.data;
	  console.log('🟢 DATA READY', data);
  
	  const index = parseInt(localStorage.getItem("your_cache_key")) || 0;
	  const itemsToProcess = data.items.slice(index);
  
	  const startIndex = index;
	  const endIndex = itemsToProcess.length;
	  const sampleSize = message.sampleSize || sample || 0; // Utiliser le paramètre de l'URL ou du message
  
	  // Passer la taille d'échantillon avec les données
	  sendtoinjected('DATA_READY', {
	    items: itemsToProcess,
	    sampleSize: sampleSize,
	    start: start,
	    end: end
	  });

	  const maxTries = 20;
	  const retryDelay = 5000;
	  let attempt = 0;
	}
  });


  window.addEventListener('message', (event) => {
	if (event.data.source === 'my-extension' && event.data.type === 'CAPTURED_HEADERS') {
	  const headers = event.data.payload;
	  console.log('📦 Headers reçus de injected.js:', headers);
	  // Store or forward them as needed
	}
  });
  
chrome.runtime.sendMessage({ action: 'fetchItems', url: URL3, start: start });


console.log('[Content] Loaded');

// Listen for messages from injected script
window.addEventListener('message', function(event) {
  // Only accept messages from the same window
  if (event.source !== window) return;
  
  if (event.data.type === 'ZENROWS_REQUEST') {
    // Forward request to background script
    chrome.runtime.sendMessage({
      action: 'zenrows_request',
      url: event.data.url,
      init: event.data.init,
      pxCookies: event.data.pxCookies
    }, response => {
      console.log('Response from background ZENROWS script:', response);
      // Send response back to injected script
      window.postMessage({
        messageId: event.data.messageId,
        success: response.success,
        data: response.data,
        error: response.error
      }, '*');
    });
  }
});


function sendtoinjected(type, payload) {
	window.postMessage({
		source: 'content-script',
		type: type,
		payload: payload
	  }, '*');
}

