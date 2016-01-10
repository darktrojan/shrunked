/* globals Components, Shrunked, XPCOMUtils, gBrowser, messageManager, PrivateBrowsingUtils, File */
Components.utils.import('resource://shrunked/Shrunked.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

/* globals FileUtils, Services, Task */
XPCOMUtils.defineLazyModuleGetter(window, 'FileUtils', 'resource://gre/modules/FileUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(window, 'Services', 'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(window, 'Task', 'resource://gre/modules/Task.jsm');

var ShrunkedBrowser = {
	init: function ShrunkedBrowser_init() {
		messageManager.addMessageListener('Shrunked:Resize', ShrunkedBrowser);
		messageManager.addMessageListener('Shrunked:PromptAndResize', ShrunkedBrowser);
		messageManager.loadFrameScript('chrome://shrunked/content/browser-content.js', true);
	},
	receiveMessage: function ShrunkedBrowser_receiveMessage(message) {
		Shrunked.log(message.name + ': ' + JSON.stringify(message.json));
		Task.spawn(function*() {
			let { files, maxWidth, maxHeight } = message.data;
			if (!maxWidth || !maxHeight) {
				let size = yield ShrunkedBrowser.promptForSize(message);
				if (!size) {
					message.target.messageManager.sendAsyncMessage('Shrunked:Cancelled', {
						index: message.data.index
					});
					return;
				}
				[ maxWidth, maxHeight ] = size;
			}
			let [ newPaths, newFiles ] = yield ShrunkedBrowser.resize(files, maxWidth, maxHeight);
			message.target.messageManager.sendAsyncMessage('Shrunked:Resized', {
				index: message.data.index,
				replacementPaths: newPaths,
				replacementFiles: newFiles,
				maxWidth: maxWidth,
				maxHeight: maxHeight
			});
		}).catch(function(error) {
			Components.utils.reportError(error);
		});
	},
	promptForSize: function ShrunkedBrowser_promptForSize(message) {
		return Task.spawn(function*() {
			let files = message.data.files;
			let maxWidth, maxHeight;

			let uri = message.target.currentURI;
			let context = PrivateBrowsingUtils.privacyContextFromWindow(window);
			let isHTTP = uri.schemeIs('http') || uri.schemeIs('https');
			let isPrivate = PrivateBrowsingUtils.isWindowPrivate(window);
			if (isHTTP) {
				if (yield Shrunked.getContentPref(uri, 'extensions.shrunked.disabled', context)) {
					return;
				}
				maxWidth = yield Shrunked.getContentPref(uri, 'extensions.shrunked.maxWidth', context);
				maxHeight = yield Shrunked.getContentPref(uri, 'extensions.shrunked.maxHeight', context);
			}

			if (!maxWidth || !maxHeight) {
				let callbackObject = {};
				let buttons = [];
				buttons.push({
					accessKey: Shrunked.strings.GetStringFromName('yes_accesskey'),
					callback: function() { callbackObject.resolve('yes'); },
					label: Shrunked.strings.GetStringFromName('yes_label'),
				});
				if (isHTTP && !isPrivate) {
					buttons.push({
						accessKey: Shrunked.strings.GetStringFromName('never_accesskey'),
						callback: function() { callbackObject.resolve('never'); },
						label: Shrunked.strings.GetStringFromName('never_label'),
					});
				}
				buttons.push({
					accessKey: Shrunked.strings.GetStringFromName('no_accesskey'),
					callback: function() { callbackObject.resolve('no'); },
					label: Shrunked.strings.GetStringFromName('no_label'),
				});

				let questions = Shrunked.strings.GetStringFromName('questions');
				let question = Shrunked.getPluralForm(files.length, questions);

				let action = yield ShrunkedBrowser.showNotificationBar(question, buttons, callbackObject);
				if (action == 'no') {
					return;
				}
				if (action == 'never') {
					Shrunked.contentPrefs2.set(uri.host, 'extensions.shrunked.disabled', true, context);
					return;
				}

				let returnValues = {
					cancelDialog: true,
					canRemember: isHTTP && !isPrivate
				};
				let imageURLs = [];
				for (let file of files) {
					let sourceFile = new FileUtils.File(file);
					let sourceURL = Services.io.newFileURI(sourceFile);
					imageURLs.push(sourceURL.spec);
				}

				window.openDialog('chrome://shrunked/content/options.xul', 'options', 'chrome,centerscreen,modal', returnValues, imageURLs);
				if (returnValues.cancelDialog) {
					return;
				}

				maxWidth = returnValues.maxWidth;
				maxHeight = returnValues.maxHeight;

				if (returnValues.rememberSite) {
					Shrunked.contentPrefs2.set(uri.host, 'extensions.shrunked.maxWidth', maxWidth, context);
					Shrunked.contentPrefs2.set(uri.host, 'extensions.shrunked.maxHeight', maxHeight, context);
				}
			}

			return [maxWidth, maxHeight];
		});
	},
	resize: function ShrunkedBrowser_resize(files, maxWidth, maxHeight, quality) {
		if (!quality) {
			quality = Shrunked.prefs.getIntPref('default.quality');
		}

		return Task.spawn(function*() {
			let newPaths = new Map();
			let newFiles = new Map();
			for (let file of files) {
				if (/\.jpe?g$/i.test(file) && Shrunked.fileLargerThanThreshold(file)) {
					let destFile = yield Shrunked.resize(new FileUtils.File(file), maxWidth, maxHeight, quality);
					newPaths.set(file, destFile);
					newFiles.set(file, new File(destFile, { type: 'image/jpeg' }));
				}
			}
			return [newPaths, newFiles];
		});
	},
	showNotificationBar: function ShrunkedBrowser_showNotificationBar(text, buttons, callbackObject) {
		return new Promise(function(resolve) {
			callbackObject.resolve = resolve;

			let notifyBox = document.getElementById('global-notificationbox') || gBrowser.getNotificationBox();
			notifyBox.removeAllNotifications(true);
			notifyBox.appendNotification(
				text, 'shrunked-notification', Shrunked.icon16, notifyBox.PRIORITY_INFO_HIGH, buttons
			);
		});
	},
	donateCallback: function(url) {
		gBrowser.selectedTab = gBrowser.addTab(url);
	}
};

window.addEventListener('load', ShrunkedBrowser.init);
