const CONTENT_SCRIPT_ID = "snowflake-dbt-confirmation-watcher";
let registration = Promise.resolve();

const getRules = async () => {
  const { rules, settings } = await chrome.storage.local.get(["rules", "settings"]);
  if (Array.isArray(rules)) {
    return rules;
  }
  if (settings?.host && settings?.text) {
    const migrated = [{
      id: crypto.randomUUID(),
      host: settings.host,
      text: settings.text,
      delay: 3
    }];
    await chrome.storage.local.set({ rules: migrated });
    await chrome.storage.local.remove("settings");
    return migrated;
  }
  return [];
};

const registerContentScript = async () => {
  const rules = await getRules();
  const origins = [...new Set(rules.map((rule) => `https://${rule.host}/*`))];
  const permitted = [];
  for (const origin of origins) {
    if (await chrome.permissions.contains({ origins: [origin] })) {
      permitted.push(origin);
    } else {
      console.warn(`Site access is missing for ${origin}; its rules are not active.`);
    }
  }

  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID]
  });
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }
  if (permitted.length) {
    await chrome.scripting.registerContentScripts([{
      id: CONTENT_SCRIPT_ID,
      matches: permitted,
      js: ["content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }]);
  }
  if (permitted.length !== origins.length) {
    throw new Error("Some rules lack site access. Edit and save those rules to grant permission.");
  }
};

const configure = () => {
  const result = registration.then(registerContentScript, registerContentScript);
  registration = result;
  return result;
};

chrome.runtime.onInstalled.addListener(() => {
  void configure().catch((error) =>
    console.error("Could not register the confirmation-page monitor:", error)
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "configure-confirmation-monitor") {
    void configure().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: String(error) })
    );
    return true;
  }

  if (message?.type !== "close-snowflake-dbt-confirmation-tab") {
    return;
  }

  const tabId = sender.tab?.id;
  if (typeof tabId !== "number" || sender.frameId !== 0 || !sender.url) {
    return;
  }

  void (async () => {
    const url = new URL(sender.url);
    const rules = await getRules();
    const rule = rules.find((item) => item.id === message.ruleId);
    if (
      url.protocol !== "https:" ||
      !rule ||
      url.hostname !== rule.host ||
      rule.text !== message.text ||
      rule.delay !== message.delay
    ) {
      return;
    }
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== sender.url) {
      return;
    }
    await chrome.tabs.remove(tabId);
  })().catch((error) => {
    console.error("Could not close the confirmation tab:", error);
  });
});
