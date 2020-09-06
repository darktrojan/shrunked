browser.composeScripts.register({
	js: [
		{
			file: 'compose_script.js',
		}
	],
});

var fileStore = new Map();
var nextStoreKey = 1;

async function showOptionsDialog(sourceFile) {
	let storeKey = nextStoreKey++;
	fileStore.set(storeKey, sourceFile);

	let { tabs: [tab1] } = await browser.windows.create({
		url: `content/options.xhtml?keys=${storeKey}`,
		type: 'popup',
		width: 800,
		height: 500
	});
	await new Promise(r => setTimeout(r, 500));

	let returnValues = await browser.tabs.executeScript(tab1.id, { code: `getResponse()` });
	fileStore.delete(storeKey);
	return returnValues[0];
}

// Attachment added to message. Just update the attachment.
browser.compose.onAttachmentAdded.addListener(async (tab, attachment) => {
	// if (attachment.name.toLowerCase().endsWith('.jpg')) {
	// }

	await browser.shrunked.showNotification(tab);
	let sourceFile = await attachment.getFile();

	let { maxWidth, maxHeight } = await showOptionsDialog(sourceFile);

	let destFile = await browser.shrunked.resizeFile(sourceFile, maxWidth, maxHeight);
	await browser.compose.updateAttachment(tab.id, attachment.id, { file: destFile });
});

// Image added to body of message. Return a promise to the sender.
browser.runtime.onMessage.addListener((message, sender, callback) => {
	console.log(message);
	if (message.type == "resizeURL") {
		return resizeURL(sender.tab, message.src);
	}
	if (message.type == "fetchFile") {
		return Promise.resolve(fileStore.get(message.key));
	}
	return undefined;
});

async function resizeURL(tab, src) {
	await browser.shrunked.showNotification(tab);
	let response = await fetch(src);
	let sourceFile = await response.blob();

	let { maxWidth, maxHeight } = await showOptionsDialog(sourceFile);

	return browser.shrunked.resizeURL(src, maxWidth, maxHeight);
}

// Message sending.
browser.compose.onBeforeSend.addListener(async (tab, details) => {
	await browser.shrunked.showNotification(tab);

	return browser.shrunked.handleSend(tab);
});
