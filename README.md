# Auto Close Snowflake dbt Login Confirmation

Chrome extension that automatically closes the external browser authentication tab after dbt/Snowflake confirms login.

It closes a tab only when the page body contains this exact message:

```text
Your identity was confirmed and propagated to Snowflake dbt. You can close this window now and go back where you started from.
```

## Install in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

```text
C:\Users\hmamoun\OneDrive - GardaWorld\Documents\Auto-Close-Snowflake-Login-Confirmation
```

After that, keep the extension enabled. The next dbt/Snowflake login confirmation tab should close automatically.

## How it works

- `content.js` runs on normal `http` and `https` pages.
- It checks the page text for the dbt/Snowflake confirmation message.
- When the message is found, it asks `background.js` to close the current tab.

## Used files

- `manifest.json`: Defines the Chrome extension metadata, content script, and background service worker.
- `content.js`: Runs inside web pages, checks the body text for the dbt/Snowflake confirmation message, and sends a close request when it finds a match.
- `background.js`: Receives the close request from `content.js` and closes the current Chrome tab.
- `README.md`: Documents how to install, use, and understand this extension.

## Disable

Go back to `chrome://extensions` and turn off or remove **Auto Close Snowflake dbt Login Confirmation**.
