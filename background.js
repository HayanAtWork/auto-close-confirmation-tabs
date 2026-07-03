chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "close-snowflake-dbt-confirmation-tab") {
    return;
  }

  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    return;
  }

  chrome.tabs.remove(tabId, () => {
    void chrome.runtime.lastError;
  });
});
