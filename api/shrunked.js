const { ExtensionCommon } = ChromeUtils.import('resource://gre/modules/ExtensionCommon.jsm');
const { ExtensionUtils: { ExtensionError } } = ChromeUtils.import('resource://gre/modules/ExtensionUtils.jsm');
const { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');

const resProto = Cc['@mozilla.org/network/protocol;1?name=resource'].getService(Ci.nsISubstitutingProtocolHandler);

var shrunked = class extends ExtensionCommon.ExtensionAPI {
	getAPI(context) {
		resProto.setSubstitution('shrunked', Services.io.newURI('modules/', null, this.extension.rootURI));
		resProto.setSubstitution('shrunkedcontent', Services.io.newURI('content/', null, this.extension.rootURI));

		let { Shrunked } = ChromeUtils.import('resource://shrunked/Shrunked.jsm');
		let { ShrunkedImage } = ChromeUtils.import('resource://shrunked/ShrunkedImage.jsm');
		// context.callOnClose(this);

		let { tabManager } = context.extension;

		return {
			shrunked: {
				onNotificationAccepted: new ExtensionCommon.EventManager({
					context,
					name: "myapi.onNotificationAccepted",
					register(fire) {
						function callback(event, tab) {
							return fire.async(tab);
						}

						context.extension.on('shrunked-accepted', callback);
						return function() {
							context.extension.off('shrunked-accepted', callback);
						};
					},
				}).api(),
				onNotificationCancelled: new ExtensionCommon.EventManager({
					context,
					name: "myapi.onNotificationCancelled",
					register(fire) {
						function callback(event, tab) {
							return fire.async(tab);
						}

						context.extension.on('shrunked-cancelled', callback);
						return function() {
							context.extension.off('shrunked-cancelled', callback);
						};
					},
				}).api(),

				migrateSettings() {
					let prefsToStore = { version: context.extension.version };
					let branch = Services.prefs.getBranch("extensions.shrunked.");

					if (Services.vc.compare(branch.getCharPref("version", "5"), "5") >= 0) {
						return prefsToStore;
					}

					let defaultPrefs = {
						'default.maxWidth': 500,
						'default.maxHeight': 500,
						'default.quality': 75,
						'default.saveDefault': true,
						'fileSizeMinimum': 100,
						'log.enabled': false,
						'options.exif': true,
						'options.orientation': true,
						'options.gps': true,
						'options.resample': true,
						'resizeAttachmentsOnSend': false,
					};

					for (let [key, defaultValue] of Object.entries(defaultPrefs)) {
						if (!branch.prefHasUserValue(key)) {
							continue;
						}

						let value;
						if (typeof defaultValue == "boolean") {
							value = branch.getBoolPref(key);
						} else if (typeof defaultValue == "number") {
							value = branch.getIntPref(key);
						} else {
							value = branch.getCharPref(key);
						}
						if (value != defaultValue) {
							prefsToStore[key] = value;
						}
					}

					branch.setCharPref("version", context.extension.version);
					return prefsToStore;
				},
				showNotification(tab, imageCount) {
					return new Promise((resolve, reject) => {
						console.log('Showing resize notification');

						// let questions = Shrunked.strings.GetStringFromName('questions');
						// let question = Shrunked.getPluralForm(callbackObject.images.length, questions);
						let question = imageCount == 1 ? 'wanna resize this shit?' : 'wanna resize these shits?';

						let nativeTab = tabManager.get(tab.id).nativeTab;
						let notifyBox = nativeTab.gNotification.notificationbox;
						let notification = notifyBox.getNotificationWithValue('shrunked-notification');
						if (notification) {
							console.log('Notification already visible');
							notification._promises.push({ resolve, reject });
							notification.label = question;
							return;
						}

						let buttons = [{
							// accessKey: Shrunked.strings.GetStringFromName('yes_accesskey'),
							accessKey: 'Y',
							callback: () => {
								console.log('Resizing started');
								// for (let promise of notification._promises) {
								// 	promise.resolve();
								// }
								context.extension.emit('shrunked-accepted', tab);
							},
							// label: Shrunked.strings.GetStringFromName('yes_label')
							label: 'Yeah',
						}, {
							// accessKey: Shrunked.strings.GetStringFromName('no_accesskey'),
							accessKey: 'N',
							callback() {
								console.log('Resizing cancelled');
								// for (let promise of notification._promises) {
								// 	promise.reject();
								// }
								// callbackObject.onResizeCancelled();
								context.extension.emit('shrunked-cancelled', tab);
							},
							// label: Shrunked.strings.GetStringFromName('no_label')
							label: 'Nah',
						}];

						notification = notifyBox.appendNotification(
							question, 'shrunked-notification', null, notifyBox.PRIORITY_INFO_HIGH, buttons
						);
						notification._promises = [{ resolve, reject }];
					});
				},
				async resizeFile(file, maxWidth, maxHeight, quality, options) {
					return Shrunked.resize(file, maxWidth, maxHeight, quality, options);
				},
				async estimateSize(file, maxWidth, maxHeight, quality) {
					return new ShrunkedImage(file, maxWidth, maxHeight, quality).estimateSize();
				},

				async handleSend(tab) {
					let { nativeTab } = tabManager.get(tab.id);
					let { attachments } = nativeTab.gMsgCompose.compFields;

					for (let attachment of attachments) {
						if (attachment.sendViaCloud) {
							continue;
						}

						if (attachment.url.toLowerCase().endsWith('.jpg')) {
							let destFile = await Shrunked.resize(attachment.url, 500, 500, 85);
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

	// close() {
	// 	console.log(Components.stack.formattedStack)
	// 	Cu.unload('resource://shrunked/Shrunked.jsm');
	// 	resProto.setSubstitution('shrunked', null);
	// 	resProto.setSubstitution('shrunkedcontent', null);
	// }
};
