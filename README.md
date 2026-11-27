# Auto Close Confirmation Tabs

Chrome extension that automatically closes an HTTPS authentication tab after configured confirmation text appears and a countdown finishes.

## Configure

1. Install the extension and open its options.
2. Add a rule by entering the exact hostname (without `https://`, a path, or a wildcard) and the confirmation text.
3. Choose a delay from 3 to 20 seconds and save the rule. Chrome asks for access to that HTTPS hostname.
4. Add as many rules as needed. Edit or remove individual rules from the list.

Alternatively, select confirmation text on an open HTTPS page. In the options, click **Load open tabs**, choose that tab, and click **Use tab and selected text**. Review the populated form and save it. Chrome asks for temporary access to tab titles and URLs to list the tabs, and site access to read the selected text. If that hostname has no saved rule, site access is revoked after reading the selection and requested again when saving.

After saving, open or refresh the authentication tab. The extension watches for the text for up to 60 seconds after the page loads. When the text appears, the page displays the countdown before it closes. If several rules match the same page, the first saved matching rule determines the delay. Removing the last rule for a hostname revokes its site access.

An existing single-host configuration is migrated to a rule with a 3-second delay.

## How it works

- `options.html` and `options.js` manage rules and optionally read selected text from a chosen tab.
- `background.js` registers a content script only for configured hostnames and closes the matching tab.
- `content.js` checks visible page text locally, shows the countdown, and sends only an internal close request.
- `PRIVACY.md` explains the extension's data handling.

## Load unpacked for testing

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this repository folder.
4. Open the extension's details, then **Extension options**, to configure it.

Run the automated checks with `node --test tests/extension.test.js`.

## Chrome Web Store submission checklist

- Suggested single-purpose statement: “Close configured HTTPS authentication tabs after their confirmation text appears.”
- Suggested listing description: “Automatically close browser authentication tabs after a confirmation message and a countdown. Configure hostnames, text, and delays, or select text from an open tab. Site access is requested only for chosen hostnames; page text is checked locally and is not sent to the developer or third parties.”
- Create the listing in the Chrome Web Store Developer Dashboard and fill out the single-purpose, privacy, and data-use disclosures accurately.
- After publishing this repository publicly, use `https://github.com/HayanAtWork/auto-close-confirmation-tabs/blob/main/PRIVACY.md` in the privacy-policy field.
- Provide listing screenshots, a support contact/URL, and any required promotional images in the dashboard.
- Test the packaged extension in Chrome, then upload a ZIP with `manifest.json` and the extension files at its root.
- Explain the `scripting` and `storage` permissions, optional temporary `tabs` access for the tab picker, and site access requested only for chosen hostnames.
