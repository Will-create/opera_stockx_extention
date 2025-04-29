const common = { items: [] };
var alerted = false;
const progressContainer = document.getElementById("progressContainer");

// Function to create a progress item
function createProgressItem(item) {
  const itemContainer = document.createElement("div");
  itemContainer.className = "progressItem";

  const tabInfo = document.createElement("p");
  tabInfo.textContent = `Tab ${item.id}: ${item.url}`;

  const progressBarContainer = document.createElement("div");
  progressBarContainer.className = "progressBar";

  const progressBar = document.createElement("div");
  progressBar.className = "progress";
  progressBar.style.width = `${item.percentage || 0}%`;

  const progressText = document.createElement("p");
  progressText.id = `progressText-${item.id}`;
  progressText.textContent = `${item.percentage || 0}%`;

  progressBarContainer.appendChild(progressBar);
  itemContainer.appendChild(tabInfo);
  itemContainer.appendChild(progressBarContainer);
  itemContainer.appendChild(progressText);

  progressContainer.appendChild(itemContainer);
}

// Function to update a progress item
function updateProgressItem(item) {
  const progressText = document.getElementById(`progressText-${item.id}`);
  if (progressText) {
    const progressBar = progressText.previousElementSibling.querySelector(".progress");
    progressBar.style.width = `${item.percentage}%`;
    progressText.textContent = `${item.percentage}%`;
  }
}

// Listen for progress updates from the background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "updateProgress" || "tab_progress") {
    const items = JSON.parse(message.data);
    items.forEach((item) => {
      // Check if the progress item already exists
      const existingProgressText = document.getElementById(`progressText-${item.id}`);
      if (existingProgressText) {
        updateProgressItem(item); // Update existing progress
      } else {
        createProgressItem(item); // Create new progress
      }
    });

    // Check if all items are complete
    const allComplete = items.every((item) => item.percentage === 100);
    if (allComplete && !alerted) {
      alerted = true;
      alert("All tabs have completed loading!");
    }
  }
}); 

// Start button click listener
document.getElementById("openTabs").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openStockXTabs" }, (response) => {
    if (response && response.status === "Tabs opened") {
      console.log("StockX tabs opened successfully.");
    } else {
      console.error("Failed to open StockX tabs.");
    }
  });
});
