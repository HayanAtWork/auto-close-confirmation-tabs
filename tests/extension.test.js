const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const rule = (id, host, text, delay = 3) => ({ id, host, text, delay });
const flush = () => new Promise(setImmediate);

function contentHarness(rules, text = "") {
  let now = 0;
  let nextTimer = 0;
  let observer;
  let changeListener;
  const timers = new Map();
  const messages = [];
  const notices = [];
  const document = {
    body: { innerText: text },
    documentElement: { innerText: text, appendChild(element) { element.attached = true; } },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        attachShadow() { return { appendChild(element) { notices.push(element); } }; },
        remove() { this.attached = false; }
      };
    }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const window = {
    location: { hostname: "auth.example.com" },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  const chrome = {
    storage: {
      local: { get: async () => ({ rules }) },
      onChanged: { addListener: (listener) => { changeListener = listener; } }
    },
    runtime: { sendMessage: async (message) => { messages.push(message); } }
  };
  const clock = class extends Date { static now() { return now; } };
  vm.runInNewContext(fs.readFileSync("content.js", "utf8"), {
    chrome, window, document, MutationObserver, Date: clock, console
  });
  return {
    document, messages, notices,
    changeRules(newRules) { changeListener({ rules: { newValue: newRules } }, "local"); },
    mutate() { observer.callback(); },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = end;
    }
  };
}

test("matching rules show the selected delay and close only after the countdown", async () => {
  for (const delay of [3, 20]) {
    const rules = [
      rule("other", "other.example.com", "success", 3),
      rule("match", "auth.example.com", "login success", delay)
    ];
    const page = contentHarness(rules, "login \n success");
    await flush();
    assert.match(page.notices[0].textContent, new RegExp(`in ${delay} seconds`));
    page.advance((delay - 1) * 1000);
    assert.match(page.notices[0].textContent, /in 1 second/);
    assert.equal(page.messages.length, 0);
    page.advance(1000);
    assert.equal(page.messages.length, 1);
    assert.equal(page.messages[0].ruleId, "match");
  }
});

test("rule removal cancels a countdown and dynamic content can trigger it", async () => {
  const rules = [rule("one", "auth.example.com", "done")];
  const page = contentHarness(rules, "loading");
  await flush();
  page.document.body.innerText = "done";
  page.mutate();
  page.advance(100);
  assert.equal(page.notices.length, 1);
  page.changeRules([]);
  page.advance(5000);
  assert.equal(page.messages.length, 0);
});

test("removed confirmation text prevents closing and the page resumes watching", async () => {
  const rules = [rule("one", "auth.example.com", "done")];
  const page = contentHarness(rules, "done");
  await flush();
  page.document.body.innerText = "not yet";
  page.advance(3000);
  assert.equal(page.messages.length, 0);
  page.document.body.innerText = "done";
  page.mutate();
  page.advance(3100);
  assert.equal(page.messages.length, 1);
});

function backgroundHarness(initialStorage, permittedHosts) {
  const storage = { ...initialStorage };
  const listeners = {};
  const scripts = [];
  const closed = [];
  const chrome = {
    storage: { local: {
      async get() { return { ...storage }; },
      async set(value) { Object.assign(storage, value); },
      async remove(key) { delete storage[key]; }
    } },
    permissions: { async contains({ origins }) { return permittedHosts.includes(origins[0]); } },
    scripting: {
      async getRegisteredContentScripts() { return [...scripts]; },
      async unregisterContentScripts() { scripts.length = 0; },
      async registerContentScripts(items) { scripts.push(...items); }
    },
    tabs: {
      async get() { return { url: "https://auth.example.com/done" }; },
      async remove(id) { closed.push(id); }
    },
    runtime: {
      onInstalled: { addListener(fn) { listeners.install = fn; } },
      onMessage: { addListener(fn) { listeners.message = fn; } }
    }
  };
  vm.runInNewContext(fs.readFileSync("background.js", "utf8"), {
    chrome, URL, crypto: { randomUUID: () => "migrated" }, console
  });
  const configure = () => new Promise((resolve) => {
    listeners.message({ type: "configure-confirmation-monitor" }, {}, resolve);
  });
  return { storage, scripts, closed, listeners, configure };
}

test("migration preserves the previous rule and registers each permitted host once", async () => {
  const app = backgroundHarness(
    { settings: { host: "auth.example.com", text: "done" } },
    ["https://auth.example.com/*"]
  );
  assert.equal((await app.configure()).ok, true);
  assert.equal(app.storage.rules[0].text, "done");
  assert.equal(app.storage.rules[0].delay, 3);
  assert.equal(app.storage.settings, undefined);
  app.storage.rules.push(rule("two", "auth.example.com", "another"));
  await app.configure();
  assert.equal(app.scripts[0].matches.length, 1);
});

test("registration monitors all permitted hosts and reports missing access", async () => {
  const app = backgroundHarness({
    rules: [
      rule("one", "auth.example.com", "first"),
      rule("two", "other.example.com", "second")
    ]
  }, ["https://auth.example.com/*"]);
  const result = await app.configure();
  assert.equal(result.ok, false);
  assert.match(result.error, /lack site access/);
  assert.equal(app.scripts[0].matches.length, 1);
  assert.equal(app.scripts[0].matches[0], "https://auth.example.com/*");
});

test("background rejects stale or wrong-host close requests", async () => {
  const app = backgroundHarness(
    { rules: [rule("one", "auth.example.com", "done", 3)] },
    ["https://auth.example.com/*"]
  );
  const sender = { frameId: 0, tab: { id: 8 }, url: "https://auth.example.com/done" };
  const message = {
    type: "close-snowflake-dbt-confirmation-tab", ruleId: "one", text: "done", delay: 3
  };
  app.listeners.message({ ...message, delay: 4 }, sender);
  app.listeners.message(message, { ...sender, url: "https://other.example.com/done" });
  await flush();
  assert.equal(app.closed.length, 0);
  app.listeners.message(message, sender);
  await flush();
  assert.deepEqual(app.closed, [8]);
});

function optionsHarness() {
  class Element {
    constructor() {
      this.value = "";
      this.textContent = "";
      this.children = [];
      this.listeners = {};
      this.style = {};
    }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() {}
    reset() {
      elements.get("#host").value = "";
      elements.get("#text").value = "";
      elements.get("#delay").value = "3";
    }
  }
  const selectors = [
    "#settings-form", "#host", "#text", "#delay", "#delay-value", "#status",
    "#rules", "#empty-rules", "#tabs", "#load-tabs", "#use-tab", "#save",
    "#cancel-edit", "#form-heading"
  ];
  const elements = new Map(selectors.map((selector) => [selector, new Element()]));
  elements.get("#delay").value = "3";
  const document = {
    querySelector: (selector) => elements.get(selector),
    createElement: () => new Element()
  };
  let rules = [];
  let changeListener;
  const grants = new Set();
  const calls = [];
  let nextId = 0;
  const chrome = {
    storage: {
      local: {
        async get() { return { rules }; },
        async set(value) {
          rules = value.rules;
          changeListener({ rules: { newValue: rules } }, "local");
        }
      },
      onChanged: { addListener(listener) { changeListener = listener; } }
    },
    permissions: {
      async request(value) {
        calls.push(["request", value.origins?.[0] ?? value.permissions[0]]);
        grants.add(value.origins?.[0] ?? value.permissions[0]);
        return true;
      },
      async contains({ origins }) { return grants.has(origins[0]); },
      async remove(value) {
        const permission = value.origins?.[0] ?? value.permissions[0];
        calls.push(["remove", permission]);
        grants.delete(permission);
        return true;
      }
    },
    tabs: { async query() {
      return [{ id: 1, title: "Confirmation", url: "https://auth.example.com/complete" }];
    } },
    scripting: { async executeScript() {
      return [{ result: { host: "auth.example.com", text: "Login\nconfirmed" } }];
    } },
    runtime: { async sendMessage() { return { ok: true }; } }
  };
  vm.runInNewContext(fs.readFileSync("options.js", "utf8"), {
    chrome, document, URL, crypto: { randomUUID: () => String(++nextId) }, console
  });
  return { elements, calls, grants, getRules: () => rules };
}

test("tab picker reads selected text and releases temporary permissions", async () => {
  const app = optionsHarness();
  await flush();
  const load = app.elements.get("#load-tabs").listeners.click();
  assert.deepEqual(app.calls[0], ["request", "tabs"]);
  await load;
  assert.equal(app.grants.has("tabs"), false);
  app.elements.get("#tabs").value = "1";
  const use = app.elements.get("#use-tab").listeners.click();
  assert.deepEqual(app.calls.at(-1), ["request", "https://auth.example.com/*"]);
  await use;
  assert.equal(app.elements.get("#host").value, "auth.example.com");
  assert.equal(app.elements.get("#text").value, "Login confirmed");
  assert.equal(app.grants.has("https://auth.example.com/*"), false);
});

test("multiple rules sharing a host retain permission until the final removal", async () => {
  const app = optionsHarness();
  await flush();
  const save = app.elements.get("#settings-form").listeners.submit;
  for (const text of ["first", "second"]) {
    app.elements.get("#host").value = "auth.example.com";
    app.elements.get("#text").value = text;
    await save({ preventDefault() {} });
  }
  assert.equal(app.getRules().length, 2);
  const firstItem = app.elements.get("#rules").children[0];
  await firstItem.children[2].listeners.click();
  assert.equal(app.getRules().length, 1);
  assert.equal(app.grants.has("https://auth.example.com/*"), true);
  const lastItem = app.elements.get("#rules").children[0];
  await lastItem.children[2].listeners.click();
  assert.equal(app.getRules().length, 0);
  assert.equal(app.grants.has("https://auth.example.com/*"), false);
});

test("editing a rule updates its delay and releases its former host", async () => {
  const app = optionsHarness();
  await flush();
  const save = app.elements.get("#settings-form").listeners.submit;
  app.elements.get("#host").value = "auth.example.com";
  app.elements.get("#text").value = "done";
  await save({ preventDefault() {} });
  app.elements.get("#rules").children[0].children[1].listeners.click();
  app.elements.get("#host").value = "other.example.com";
  app.elements.get("#delay").value = "20";
  await save({ preventDefault() {} });
  assert.equal(app.getRules().length, 1);
  assert.equal(app.getRules()[0].delay, 20);
  assert.equal(app.getRules()[0].host, "other.example.com");
  assert.equal(app.grants.has("https://auth.example.com/*"), false);
  assert.equal(app.grants.has("https://other.example.com/*"), true);
});
