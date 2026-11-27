(() => {
  let observer;
  let scheduledCheck;
  let stopWatchingTimer;
  let countdownTimer;
  let banner;
  let activeRule;
  let closeRequested = false;
  let latestRules = [];

  const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
  const pageText = () =>
    normalizeText(document.body?.innerText ?? document.documentElement?.innerText ?? "");

  const stop = () => {
    observer?.disconnect();
    observer = undefined;
    window.clearTimeout(scheduledCheck);
    window.clearTimeout(stopWatchingTimer);
    window.clearTimeout(countdownTimer);
    banner?.remove();
    banner = undefined;
    activeRule = undefined;
  };

  const startCountdown = (rule) => {
    observer?.disconnect();
    window.clearTimeout(scheduledCheck);
    window.clearTimeout(stopWatchingTimer);
    activeRule = rule;

    banner = document.createElement("div");
    const shadow = banner.attachShadow({ mode: "closed" });
    const notice = document.createElement("div");
    notice.setAttribute("role", "status");
    notice.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:2147483647;" +
      "padding:12px 16px;border-radius:6px;background:#202124;color:#fff;" +
      "font:14px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px #0006;";
    shadow.appendChild(notice);
    document.documentElement.appendChild(banner);

    const deadline = Date.now() + rule.delay * 1000;
    const tick = () => {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      if (remaining <= 0) {
        if (!pageText().includes(normalizeText(rule.text))) {
          stop();
          applyRules(latestRules);
          return;
        }
        closeRequested = true;
        stop();
        void chrome.runtime.sendMessage({
          type: "close-snowflake-dbt-confirmation-tab",
          ruleId: rule.id,
          text: rule.text,
          delay: rule.delay
        }).catch((error) => console.error("Could not request closing the confirmation tab:", error));
        return;
      }
      notice.textContent = `Closing this tab in ${remaining} second${remaining === 1 ? "" : "s"}...`;
      countdownTimer = window.setTimeout(tick, Math.min(1000, deadline - Date.now()));
    };
    tick();
  };

  const applyRules = (rules) => {
    latestRules = Array.isArray(rules) ? rules : [];
    if (closeRequested) {
      return;
    }
    const matchingRules = latestRules.filter((rule) =>
      rule.host === window.location.hostname.toLowerCase() &&
      typeof rule.text === "string" && normalizeText(rule.text) &&
      Number.isInteger(rule.delay) && rule.delay >= 3 && rule.delay <= 20
    );
    if (activeRule && matchingRules.some((rule) =>
      rule.id === activeRule.id && rule.text === activeRule.text && rule.delay === activeRule.delay
    )) {
      return;
    }
    stop();
    if (!matchingRules.length) {
      return;
    }

    const check = () => {
      const text = pageText();
      const rule = matchingRules.find((item) => text.includes(normalizeText(item.text)));
      if (rule) {
        startCountdown(rule);
      }
    };
    check();
    if (activeRule) {
      return;
    }
    observer = new MutationObserver(() => {
      window.clearTimeout(scheduledCheck);
      scheduledCheck = window.setTimeout(check, 100);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    stopWatchingTimer = window.setTimeout(() => {
      observer?.disconnect();
      window.clearTimeout(scheduledCheck);
    }, 60000);
  };

  let rulesChanged = false;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && Object.hasOwn(changes, "rules")) {
      rulesChanged = true;
      applyRules(changes.rules.newValue);
    }
  });
  void chrome.storage.local.get("rules").then(({ rules }) => {
    if (!rulesChanged) {
      applyRules(rules);
    }
  }).catch((error) => console.error("Could not load confirmation rules:", error));
})();
