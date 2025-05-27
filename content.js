const urlParams = new URLSearchParams(window.location.search);
const start = urlParams.get('start');
const end = urlParams.get('end');

function injectExternalScript() {
	const script = document.createElement('script');
	script.src = chrome.runtime.getURL('inject.js');
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
  
	  const start = index;
	  const end = itemsToProcess.length;
  
	  sendtoinjected('DATA_READY', itemsToProcess);

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

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source === 'my-extension') {
    console.log('[Content] Got message:', event.data);
  }
});


function sendtoinjected(type, payload) {
	window.postMessage({
		source: 'content-script',
		type: type,
		payload: payload
	  }, '*');
}

