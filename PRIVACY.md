# Privacy policy

Auto Close Confirmation Tabs processes page text and tab information locally.
It does not send this information to the developer or any third party.

The extension accesses only HTTPS hostnames that the user selects or enters and grants permission
for. On those hostnames, it reads visible page text locally to look for user-provided confirmation
text. When the text is found, it shows a countdown and sends an internal message to its own service
worker to close that tab.

If the user chooses the open-tab picker, the extension temporarily requests permission to read open
tab titles and URLs to display the available HTTPS tabs. It then accesses the selected site's page
to read only the user's selected text. Tab-list permission is revoked after the list is loaded.
Site access for a selection is revoked after reading it if that hostname has no saved rule.

The configured hostnames, confirmation texts, and delays are stored locally in Chrome extension
storage and can be edited or removed in the options page. Removing the last rule for a hostname
revokes its site permission. The user can also revoke permissions in Chrome's extension settings or
remove the extension. This policy does not cover the privacy practices of websites the user visits.
