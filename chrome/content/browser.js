let ShrunkedBrowser = {
	init: function ShrunkedBrowser_init() {
		messageManager.addMessageListener('Shrunked:PromptAndResize', {
			receiveMessage: function(message) {
				ShrunkedBrowser.doPromptAndResize(message);
			}
		});
		messageManager.loadFrameScript('chrome://shrunked/content/browser-content.js', true);

		setTimeout(function() {
			Shrunked.showStartupNotification(gBrowser.getNotificationBox(), function(url) {
				gBrowser.selectedTab = gBrowser.addTab(url);
			});
		}, 1000);
	},
	doPromptAndResize: function ShrunkedBrowser_doPromptAndResize(message) {
		Task.spawn(function*() {
			let uri = message.target.currentURI;

			let callbackObject = {};
			let buttons = [];
			buttons.push({
				accessKey: Shrunked.strings.GetStringFromName('yes_accesskey'),
				callback: function() { callbackObject.resolve('yes'); },
				label: Shrunked.strings.GetStringFromName('yes_label'),
			});
			if (!PrivateBrowsingUtils.isWindowPrivate(window) &&
					(uri.schemeIs('http') || uri.schemeIs('https'))) {
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
			let question = Shrunked.getPluralForm(message.data.length, questions);

			let action = yield ShrunkedBrowser.showNotificationBar(question, buttons, callbackObject);
			if (action == 'no') {
				return;
			}
			let context = PrivateBrowsingUtils.privacyContextFromWindow(window);
			if (action == 'never') {
				Shrunked.contentPrefs2.set(uri.host, 'extensions.shrunked.disabled', true, context);
				return;
			}

			let returnValues = { cancelDialog: true };
			let imageURLs = [];
			for (let file of message.data) {
				let sourceFile = new FileUtils.File(file);
				let sourceURL = Services.io.newFileURI(sourceFile);
				imageURLs.push(sourceURL.spec);
			}

			window.openDialog('chrome://shrunked/content/options.xul', 'options', 'chrome,centerscreen,modal', returnValues, imageURLs);
			if (returnValues.cancelDialog) {
				return;
			}

			let quality = Shrunked.prefs.getIntPref('default.quality');
			let newPaths = new Map();
			for (let file of message.data) {
				if (/\.jpe?g$/i.test(file) && Shrunked.fileLargerThanThreshold(file)) {
					let destFile = yield Shrunked.resize(new FileUtils.File(file), returnValues.maxWidth, returnValues.maxHeight, quality);
					newPaths.set(file, destFile);
				}
			}
			message.target.messageManager.sendAsyncMessage('Shrunked:Resized', newPaths);

			if (returnValues.rememberSite && (uri.schemeIs('http') || uri.schemeIs('https'))) {
				Shrunked.contentPrefs2.set(uri.host, 'extensions.shrunked.maxWidth', returnValues.maxWidth, context);
				Shrunked.contentPrefs2.set(uri.host, 'extensions.shrunked.maxHeight', returnValues.maxHeight, context);
			}
		});
	},
	showNotificationBar: function ShrunkedBrowser_showNotificationBar(question, buttons, callbackObject) {
		return new Promise(function(resolve, reject) {
			callbackObject.resolve = resolve;

			let notifyBox = gBrowser.getNotificationBox();
			notifyBox.removeAllNotifications(true);
			notifyBox.appendNotification(
				question, 'shrunked-notification', null, notifyBox.PRIORITY_INFO_HIGH, buttons
			);
		});
	}
};

Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(window, 'FileUtils', 'resource://gre/modules/FileUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(window, 'Services', 'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(window, 'Shrunked', 'resource://shrunked/Shrunked.jsm');
XPCOMUtils.defineLazyModuleGetter(window, 'Task', 'resource://gre/modules/Task.jsm');

window.addEventListener('load', ShrunkedBrowser.init);
