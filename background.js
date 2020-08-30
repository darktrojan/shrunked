browser.composeScripts.register({
	js: [
		{
			file: 'compose_script.js',
		}
	],
});

async function showOptionsDialog(sourceFile) {
	let { tabs: [tab1] } = await browser.windows.create({ url: 'content/options.xhtml', type: 'popup', width: 800, height: 500 });

	await new Promise(r => setTimeout(r, 500));
	let returnValues = await browser.tabs.executeScript(tab1.id, { code: `setImageURLs(["${sourceFile.name}"]);`});
	return returnValues[0];
}

// Attachment added to message. Just update the attachment.
browser.compose.onAttachmentAdded.addListener(async (tab, attachment) => {
	// if (attachment.name.toLowerCase().endsWith('.jpg')) {
	// }

	await browser.shrunked.showNotification(tab);
	let sourceFile = await attachment.getFile();

	let { maxWidth, maxHeight } = await showOptionsDialog(sourceFile);

	let destFile = await browser.shrunked.resizeFile(tab, sourceFile, maxWidth, maxHeight);
	await browser.compose.updateAttachment(tab.id, attachment.id, { file: destFile });
});

// Image added to body of message. Return a promise to the sender.
browser.runtime.onMessage.addListener(async (message, sender, callback) => {
	await browser.shrunked.showNotification(sender.tab);
	let response = await fetch(message);
	let sourceFile = await response.blob();

	let { maxWidth, maxHeight } = await showOptionsDialog(sourceFile);

	return browser.shrunked.resizeURL(sender.tab, message, maxWidth, maxHeight);
});

// Message sending.
browser.compose.onBeforeSend.addListener(async (tab, details) => {
	await browser.shrunked.showNotification(tab);

	return browser.shrunked.handleSend(tab);
});
