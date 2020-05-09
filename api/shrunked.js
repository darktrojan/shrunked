const { ExtensionCommon } = ChromeUtils.import('resource://gre/modules/ExtensionCommon.jsm');
const { ExtensionUtils: { ExtensionError } } = ChromeUtils.import('resource://gre/modules/ExtensionUtils.jsm');
const { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');

const resProto = Cc['@mozilla.org/network/protocol;1?name=resource'].getService(Ci.nsISubstitutingProtocolHandler);

function showNotification(tab) {
	return new Promise((resolve, reject) => {
		console.log('Showing resize notification');
		let notifyBox = tab.gNotification.notificationbox;
		let notification = notifyBox.getNotificationWithValue('shrunked-notification');
		if (notification) {
			console.log('Notification already visible');
			notification._promises.push({ resolve, reject });
			return;
		}

		let buttons = [{
			// accessKey: Shrunked.strings.GetStringFromName('yes_accesskey'),
			accessKey: 'Y',
			callback: () => {
				console.log('Resizing started');
				for (let promise of notification._promises) {
					promise.resolve();
				}
			},
			// label: Shrunked.strings.GetStringFromName('yes_label')
			label: 'Yeah',
		}, {
			// accessKey: Shrunked.strings.GetStringFromName('no_accesskey'),
			accessKey: 'N',
			callback() {
				console.log('Resizing cancelled');
				for (let promise of notification._promises) {
					promise.reject();
				}
				// callbackObject.onResizeCancelled();
			},
			// label: Shrunked.strings.GetStringFromName('no_label')
			label: 'Nah',
		}];

		// let questions = Shrunked.strings.GetStringFromName('questions');
		// let question = Shrunked.getPluralForm(callbackObject.images.length, questions);
		let question = 'wanna resize this shit?';

		notification = notifyBox.appendNotification(
			question, 'shrunked-notification', null, notifyBox.PRIORITY_INFO_HIGH, buttons
		);
		notification._promises = [{ resolve, reject }];
	});
}

var shrunked = class extends ExtensionCommon.ExtensionAPI {
	getAPI(context) {
		resProto.setSubstitution('shrunked', Services.io.newURI('modules/', null, this.extension.rootURI));

		let { Shrunked } = ChromeUtils.import('resource://shrunked/Shrunked.jsm');
		context.callOnClose(this);

		let { tabManager } = context.extension;

		return {
			shrunked: {
				async resizeURL(tab, url) {
					try {
						await showNotification(tabManager.get(tab.id).nativeTab);
					} catch (ex) {
						throw new ExtensionError('resizing cancelled');
					}

					let destFile = await Shrunked.resize(url, 500, 500, 85, 'test.jpg');
					return Shrunked.getURLFromFile(destFile, true);
				},
				async resizeFile(tab, file) {
					try {
						await showNotification(tabManager.get(tab.id).nativeTab);
					} catch (ex) {
						throw new ExtensionError('resizing cancelled');
					}

					let sourceFile = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
					sourceFile.initWithPath(file.mozFullPath);
					let destFile = await Shrunked.resize(sourceFile, 500, 500, 85, sourceFile.leafName);
					return destFile;
				},
				async handleSend(tab) {
					let { nativeTab } = tabManager.get(tab.id);
					let { attachments } = nativeTab.gMsgCompose.compFields;

					for (let attachment of attachments) {
						if (attachment.sendViaCloud) {
							continue;
						}

						if (attachment.url.toLowerCase().endsWith('.jpg')) {
							let destFile = await Shrunked.resize(attachment.url, 500, 500, 85, 'test.jpg');
							attachment.url = await Shrunked.getURLFromFile(destFile, true);
						}
					}
				},
				async fileSizeMinimum() {
					console.log('fileSizeMinimum called');
					return Shrunked.fileSizeMinimum;
				},
				async imageIsJPEG(image) {
					console.log('imageIsJPEG called');
					let src = image.src.toLowerCase();
					return src.startsWith('data:image/jpeg') || src.endsWith('.jpg');
				},
			},
		};
	}

	close() {
		Cu.unload('resource://shrunked/Shrunked.jsm');
		resProto.setSubstitution('shrunked', null);
	}
};
