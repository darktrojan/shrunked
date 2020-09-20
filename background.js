browser.shrunked.migrateSettings().then(prefsToStore => {
	if (prefsToStore) {
		browser.storage.local.set(prefsToStore);
	}
});

browser.composeScripts.register({
	js: [
		{
			file: 'compose_script.js',
		}
	],
});

var tabMap = new Map();

browser.runtime.onMessage.addListener(async (message, sender, callback) => {
	console.log(message);
	// Image added to body of message. Return a promise to the sender.
	if (message.type == "resizeFile") {
		return beginResize(sender.tab, message.file);
	}
	// Options window requesting a file.
	if (message.type == "fetchFile") {
		return Promise.resolve(tabMap.get(message.tabId)[message.index].file);
	}
	// Options window starting resize.
	if (message.type == "doResize") {
		doResize(message.tabId, message.maxWidth, message.maxHeight, message.quality);
	}
	return undefined;
});

// Attachment added to message. Just update the attachment.
browser.compose.onAttachmentAdded.addListener(async (tab, attachment) => {
	if (!attachment.name.toLowerCase().endsWith(".jpg")) {
		return;
	}

	let file = await attachment.getFile();
	let destFile = await beginResize(tab, file);
	await browser.compose.updateAttachment(tab.id, attachment.id, { file: destFile });
});

// Message sending.
browser.compose.onBeforeSend.addListener(async (tab, details) => {
	// await browser.shrunked.showNotification(tab);

	// return browser.shrunked.handleSend(tab);
});

// Notification response.
browser.shrunked.onNotificationAccepted.addListener(tab => showOptionsDialog(tab));
browser.shrunked.onNotificationCancelled.addListener(tab => tabMap.delete(tab.id));

function showOptionsDialog(tab) {
	let sourceFiles = tabMap.get(tab.id);

	browser.windows.create({
		url: `content/options.xhtml?tabId=${tab.id}&count=${sourceFiles.length}`,
		type: 'popup',
		width: 800,
		height: 500
	});
}

// Called by options dialog OK button.
function beginResize(tab, file) {
	return new Promise((resolve, reject) => {
		if (!tabMap.has(tab.id)) {
			tabMap.set(tab.id, []);
		}
		let sourceFiles = tabMap.get(tab.id);
		sourceFiles.push({ promise: { resolve, reject }, file });
		browser.shrunked.showNotification(tab, sourceFiles.length);
	});
}

// Actual resize operation.
async function doResize(tabId, maxWidth, maxHeight, quality) {
	let options = await browser.storage.local.get({
		'options.exif': true,
		'options.orientation': true,
		'options.gps': true,
		'options.resample': true,
	});
	options = {
		exif: options.exif,
		orientation: options.orientation,
		gps: options.gps,
		resample: options.resample,
	};

	for (let source of tabMap.get(tabId)) {
		let destFile = await browser.shrunked.resizeFile(source.file, maxWidth, maxHeight, quality, options);
		source.promise.resolve(destFile);
	}
	tabMap.delete(tabId);
}

// Clean up.
browser.tabs.onRemoved.addListener(tabId => {
	tabMap.delete(tabId);
});
