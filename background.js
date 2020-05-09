browser.composeScripts.register({
	js: [
		{
			file: 'compose_script.js',
		}
	],
});

browser.compose.onAttachmentAdded.addListener(async (tab, attachment) => {
  if (attachment.name.toLowerCase().endsWith('.jpg')) {
    let sourceFile = await attachment.getFile();
    let destFile = await browser.shrunked.resizeFile(sourceFile);
    await browser.compose.updateAttachment(tab.id, attachment.id, { file: destFile });
  }
});

browser.runtime.onMessage.addListener((message, sender, callback) => {
	return browser.shrunked.resizeURL(message);
});

browser.compose.onBeforeSend.addListener((tab, details) => {
  return browser.shrunked.handleSend(tab);
});
