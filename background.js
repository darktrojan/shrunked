browser.composeScripts.register({
	js: [
		{
			file: 'compose_script.js',
		}
	],
});

var tabMap = new Map();

function showOptionsDialog(tab) {
	let sourceFiles = tabMap.get(tab.id);

	browser.windows.create({
		url: `content/options.xhtml?tabId=${tab.id}&count=${sourceFiles.length}`,
		type: 'popup',
		width: 800,
		height: 500
	});
}

browser.shrunked.onNotificationAccepted.addListener(tab => showOptionsDialog(tab));
browser.shrunked.onNotificationCancelled.addListener(tab => tabMap.delete(tab.id));

// Attachment added to message. Just update the attachment.
browser.compose.onAttachmentAdded.addListener(async (tab, attachment) => {
	if (!attachment.name.toLowerCase().endsWith(".jpg")) {
		return;
	}

	if (!tabMap.has(tab.id)) {
		tabMap.set(tab.id, []);
	}
	let sourceFiles = tabMap.get(tab.id);
	let file = await attachment.getFile();
	sourceFiles.push({ attachment, file });

	browser.shrunked.showNotification(tab, sourceFiles.length);
});

// Image added to body of message. Return a promise to the sender.
browser.runtime.onMessage.addListener(async (message, sender, callback) => {
	console.log(message);
	if (message.type == "resizeURL") {
		return resizeURL(sender.tab, message.src);
	}
	if (message.type == "fetchFile") {
		return Promise.resolve(tabMap.get(message.tabId)[message.index].file);
	}
	if (message.type == "doResize") {
		let { maxWidth, maxHeight, tabId } = message;
		let sourceFiles = tabMap.get(tabId);

		for (let { attachment, file } of sourceFiles) {
			let destFile = await browser.shrunked.resizeFile(file, maxWidth, maxHeight);
			await browser.compose.updateAttachment(tabId, attachment.id, { file: destFile });
		}
		tabMap.delete(tabId);
	}
	return undefined;
});

async function resizeURL(tab, src) {
	await browser.shrunked.showNotification(tab);
	let response = await fetch(src);
	let sourceFile = await response.blob();

	let { maxWidth, maxHeight } = await showOptionsDialog([sourceFile]);

	return browser.shrunked.resizeURL(src, maxWidth, maxHeight);
}

// Message sending.
browser.compose.onBeforeSend.addListener(async (tab, details) => {
	await browser.shrunked.showNotification(tab);

	return browser.shrunked.handleSend(tab);
});

browser.tabs.onRemoved.addListener(tabId => {
	tabMap.delete(tabId);
});
