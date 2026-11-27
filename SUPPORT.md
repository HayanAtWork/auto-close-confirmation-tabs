# Support

For setup help, troubleshooting, bugs, or feature requests, open a
[GitHub issue](https://github.com/HayanAtWork/auto-close-confirmation-tabs/issues/new/choose).

## Setup

1. Open the extension options.
2. Enter an exact HTTPS hostname, without `https://`, a path, port, or wildcard.
3. Enter the confirmation text that should trigger closing.
4. Choose a countdown between 3 and 20 seconds.
5. Save the rule, then open or refresh the matching page.

## Troubleshooting

- **The tab does not close:** Confirm that the hostname matches exactly and the text is still
  present on the page. Refresh the page after changing a rule.
- **Site access was denied:** Open the extension options and save the rule again to request the
  hostname permission.
- **The text is not found:** Select text on an open HTTPS page, then use the open-tab picker.
- **Another tab closes unexpectedly:** Review the saved text and keep it specific to the desired
  confirmation page.
- **You want to stop monitoring:** Remove the affected rule in the options page. Removing the last
  rule for a hostname also removes that hostname permission.

For privacy questions, read the [privacy policy](PRIVACY.md).
