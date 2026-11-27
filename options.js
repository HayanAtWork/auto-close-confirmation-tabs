const form = document.querySelector("#settings-form");
const hostInput = document.querySelector("#host");
const textInput = document.querySelector("#text");
const delayInput = document.querySelector("#delay");
const delayValue = document.querySelector("#delay-value");
const status = document.querySelector("#status");
const rulesList = document.querySelector("#rules");
const emptyRules = document.querySelector("#empty-rules");
const tabsSelect = document.querySelector("#tabs");
const loadTabsButton = document.querySelector("#load-tabs");
const useTabButton = document.querySelector("#use-tab");
const saveButton = document.querySelector("#save");
const cancelButton = document.querySelector("#cancel-edit");
const formHeading = document.querySelector("#form-heading");

let rules = [];
let editingId;
let openTabs = [];

const getOrigin = (host) => `https://${host}/*`;
const normalizeText = (text) => text.replace(/\s+/g, " ").trim();

const parseHost = (value) => {
  const host = value.trim().toLowerCase();
  const labels = host.split(".");
  if (
    !host || host.length > 253 ||
    labels.some((label) =>
      !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    throw new Error("Enter a hostname only, without a scheme, port, path, or wildcard.");
  }
  const parsed = new URL(`https://${host}`);
  if (parsed.hostname !== host || parsed.pathname !== "/") {
    throw new Error("Enter a valid hostname only.");
  }
  return host;
};

const resetForm = () => {
  editingId = undefined;
  form.reset();
  delayValue.textContent = delayInput.value;
  saveButton.textContent = "Add rule";
  formHeading.textContent = "Add a rule";
  cancelButton.hidden = true;
};

const configure = async () => {
  const result = await chrome.runtime.sendMessage({ type: "configure-confirmation-monitor" });
  if (!result?.ok) {
    throw new Error(result?.error ?? "The monitor could not be configured.");
  }
};

const releaseUnusedHost = async (host) => {
  if (host && !rules.some((rule) => rule.host === host)) {
    const origins = [getOrigin(host)];
    if (await chrome.permissions.contains({ origins })) {
      const removed = await chrome.permissions.remove({ origins });
      if (!removed) {
        throw new Error(`Could not revoke access to ${host}; remove it in Chrome's extension settings.`);
      }
    }
  }
};

const renderRules = () => {
  rulesList.replaceChildren();
  emptyRules.hidden = rules.length > 0;
  for (const rule of rules) {
    const item = document.createElement("li");
    const summary = document.createElement("p");
    summary.textContent = `${rule.host} — ${rule.delay} seconds — ${rule.text}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      editingId = rule.id;
      hostInput.value = rule.host;
      textInput.value = rule.text;
      delayInput.value = rule.delay;
      delayValue.textContent = rule.delay;
      saveButton.textContent = "Save changes";
      formHeading.textContent = "Edit rule";
      cancelButton.hidden = false;
      hostInput.focus();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      status.textContent = "";
      try {
        rules = rules.filter((item) => item.id !== rule.id);
        await chrome.storage.local.set({ rules });
        renderRules();
        if (editingId === rule.id) {
          resetForm();
        }
        try {
          await configure();
        } finally {
          await releaseUnusedHost(rule.host);
        }
        status.textContent = "Rule removed.";
      } catch (error) {
        status.textContent = `Could not finish removing the rule: ${error.message}`;
      }
    });
    item.append(summary, edit, remove);
    rulesList.appendChild(item);
  }
};

delayInput.addEventListener("input", () => {
  delayValue.textContent = delayInput.value;
});
cancelButton.addEventListener("click", resetForm);

loadTabsButton.addEventListener("click", async () => {
  status.textContent = "";
  openTabs = [];
  tabsSelect.replaceChildren();
  tabsSelect.disabled = true;
  useTabButton.disabled = true;
  try {
    const granted = await chrome.permissions.request({ permissions: ["tabs"] });
    if (!granted) {
      status.textContent = "Permission to list open tabs was not granted.";
      return;
    }
    try {
      const tabs = await chrome.tabs.query({});
      openTabs = tabs
        .filter((tab) => typeof tab.id === "number" && tab.url?.startsWith("https://"))
        .map((tab) => ({ id: tab.id, title: tab.title, host: new URL(tab.url).hostname }));
      tabsSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = openTabs.length ? "Choose a tab" : "No HTTPS tabs found";
      tabsSelect.appendChild(placeholder);
      for (const tab of openTabs) {
        const option = document.createElement("option");
        option.value = String(tab.id);
        option.textContent = `${tab.title || "Untitled"} — ${tab.host}`;
        tabsSelect.appendChild(option);
      }
      tabsSelect.disabled = openTabs.length === 0;
      useTabButton.disabled = openTabs.length === 0;
    } finally {
      if (!(await chrome.permissions.remove({ permissions: ["tabs"] }))) {
        throw new Error("Could not revoke temporary tab access; remove it in Chrome's extension settings.");
      }
    }
  } catch (error) {
    status.textContent = `Could not list tabs: ${error.message}`;
  }
});

useTabButton.addEventListener("click", async () => {
  status.textContent = "";
  const tab = openTabs.find((item) => String(item.id) === tabsSelect.value);
  if (!tab) {
    status.textContent = "Choose an open HTTPS tab first.";
    return;
  }

  const host = tab.host.toLowerCase();
  try {
    const granted = await chrome.permissions.request({ origins: [getOrigin(host)] });
    if (!granted) {
      status.textContent = "Site access was not granted.";
      return;
    }
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ host: location.hostname, text: window.getSelection().toString() })
      });
      if (injection?.result?.host !== host) {
        throw new Error("The tab navigated to a different site. Reload the tab list and try again.");
      }
      const text = normalizeText(injection.result.text);
      if (!text) {
        throw new Error("Select the confirmation text on that page first, then try again.");
      }
      hostInput.value = host;
      textInput.value = text;
      status.textContent = "Hostname and selected text added to the form. Review them and save the rule.";
    } finally {
      await releaseUnusedHost(host);
    }
  } catch (error) {
    status.textContent = `Could not read the selected text: ${error.message}`;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  let host;
  try {
    host = parseHost(hostInput.value);
  } catch (error) {
    status.textContent = error.message;
    return;
  }
  const text = normalizeText(textInput.value);
  const delay = Number(delayInput.value);
  if (!text || !Number.isInteger(delay) || delay < 3 || delay > 20) {
    status.textContent = "Enter confirmation text and a delay between 3 and 20 seconds.";
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins: [getOrigin(host)] });
    if (!granted) {
      status.textContent = "Site access was not granted; the existing rules were kept.";
      return;
    }
    const previous = rules.find((rule) => rule.id === editingId);
    if (editingId && !previous) {
      throw new Error("This rule no longer exists. Reload the options page.");
    }
    const rule = { id: editingId ?? crypto.randomUUID(), host, text, delay };
    const updated = previous
      ? rules.map((item) => item.id === editingId ? rule : item)
      : [...rules, rule];
    await chrome.storage.local.set({ rules: updated });
    rules = updated;
    renderRules();
    resetForm();
    try {
      await configure();
    } finally {
      if (previous?.host !== host) {
        await releaseUnusedHost(previous?.host);
      }
    }
    status.textContent = "Rule saved. Open or refresh the matching page to monitor it.";
  } catch (error) {
    status.textContent = `Could not finish saving the rule: ${error.message}`;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && Object.hasOwn(changes, "rules")) {
    rules = changes.rules.newValue ?? [];
    renderRules();
  }
});

void (async () => {
  let configurationError;
  try {
    await configure();
  } catch (error) {
    configurationError = error;
  }
  const result = await chrome.storage.local.get("rules");
  rules = result.rules ?? [];
  renderRules();
  if (configurationError) {
    status.textContent = `Some rules may not be active: ${configurationError.message}`;
  }
})().catch((error) => {
  status.textContent = `Could not load rules: ${error.message}`;
});
