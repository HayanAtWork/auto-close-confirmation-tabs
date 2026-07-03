(() => {
  const CONFIRMATION_TEXT =
    "Your identity was confirmed and propagated to Snowflake dbt. You can close this window now and go back where you started from.";

  let closeRequested = false;
  let observer;
  let scheduledCheck;
  let stopWatchingTimer;

  const normalizeText = (text) => text.replace(/\s+/g, " ").trim();

  const pageContainsConfirmation = () => {
    const bodyText = document.body?.innerText ?? document.documentElement?.innerText ?? "";
    return normalizeText(bodyText).includes(CONFIRMATION_TEXT);
  };

  const requestClose = () => {
    if (closeRequested) {
      return;
    }

    closeRequested = true;
    observer?.disconnect();
    window.clearTimeout(scheduledCheck);
    window.clearTimeout(stopWatchingTimer);
    chrome.runtime.sendMessage({ type: "close-snowflake-dbt-confirmation-tab" });
  };

  const checkPage = () => {
    if (pageContainsConfirmation()) {
      requestClose();
    }
  };

  const scheduleCheck = () => {
    window.clearTimeout(scheduledCheck);
    scheduledCheck = window.setTimeout(checkPage, 100);
  };

  checkPage();

  if (!closeRequested) {
    observer = new MutationObserver(scheduleCheck);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    stopWatchingTimer = window.setTimeout(() => observer.disconnect(), 60000);
  }
})();
