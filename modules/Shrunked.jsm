/* exported EXPORTED_SYMBOLS, Shrunked */
var EXPORTED_SYMBOLS = ['Shrunked'];

var ID = 'shrunked@darktrojan.net';
var CHANGELOG_URL = 'https://addons.mozilla.org/addon/shrunked-image-resizer/versions/';
var DONATE_URL = 'https://addons.mozilla.org/addon/shrunked-image-resizer/contribute/installed/';

/* globals Components, Services, XPCOMUtils, dump */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

/* globals AddonManager, FileUtils, OS, PluralForm, ShrunkedImage */
XPCOMUtils.defineLazyModuleGetter(this, 'AddonManager', 'resource://gre/modules/AddonManager.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'FileUtils', 'resource://gre/modules/FileUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'OS', 'resource://gre/modules/osfile.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'PluralForm', 'resource://gre/modules/PluralForm.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'ShrunkedImage', 'resource://shrunked/ShrunkedImage.jsm');

/* globals idleService */
XPCOMUtils.defineLazyServiceGetter(this, 'idleService', '@mozilla.org/widget/idleservice;1', 'nsIIdleService');

var temporaryFiles = [];

var Shrunked = {
	get fileSizeMinimum() {
		return Shrunked.prefs.getIntPref('fileSizeMinimum') * 1000;
	},
	fileLargerThanThreshold: function Shrunked_fileLargerThanThreshold(path) {
		let file;
		if (/^file:/.test(path)) {
			let uri = Services.io.newURI(path, null, null);
			file = uri.QueryInterface(Components.interfaces.nsIFileURL).file;
		} else {
			file = new FileUtils.File(path);
		}
		return file.fileSize >= this.fileSizeMinimum;
	},
	imageIsJPEG: function Shrunked_imageIsJPEG(image) {
		let request = image.getRequest(Components.interfaces.nsIImageLoadingContent.CURRENT_REQUEST);
		return !!request && request.mimeType == 'image/jpeg';
	},
	resize: function Shrunked_resize(sourceFile, maxWidth, maxHeight, quality, name) {
		let image = new ShrunkedImage(sourceFile, maxWidth, maxHeight, quality);
		if (!!name) {
			image.basename = name;
		}
		return image.resize().then(function(destFile) {
			temporaryFiles.push(destFile);
			return destFile;
		});
	},
	cleanup: function Shrunked_cleanup() {
		let promises = [];
		for (let path of temporaryFiles) {
			promises.push(OS.File.remove(path));
		}
		return Promise.all(promises);
	},
	versionUpgrade: function Shrunked_versionUpgrade() {
		function parseVersion(version) {
			let match = /^\d+(\.\d+)?/.exec(version);
			return match ? match[0] : version;
		}

		let currentVersion = 0;
		let oldVersion = 0;
		let shouldRemind = true;

		if (Shrunked.prefs.getPrefType('version') == Components.interfaces.nsIPrefBranch.PREF_STRING) {
			oldVersion = parseVersion(Shrunked.prefs.getCharPref('version'));
		}
		if (Shrunked.prefs.getPrefType('donationreminder') == Components.interfaces.nsIPrefBranch.PREF_INT) {
			let lastReminder = Shrunked.prefs.getIntPref('donationreminder') * 1000;
			shouldRemind = Date.now() - lastReminder > 604800000;
		}

		AddonManager.getAddonByID(ID, function(addon) {
			currentVersion = parseVersion(addon.version);
			Shrunked.prefs.setCharPref('version', addon.version);

			if (!shouldRemind || oldVersion === 0 || Services.vc.compare(oldVersion, currentVersion) >= 0) {
				return;
			}

			idleService.addIdleObserver({
				observe: function(service, state) {
					if (state != 'idle') {
						return;
					}

					idleService.removeIdleObserver(this, 10);
					Shrunked.showNotification(currentVersion);
				}
			}, 10);
		});
	},
	showNotification: function Shrunked_showNotification(currentVersion) {
		let callbackObject = {};
		let label = Shrunked.strings.formatStringFromName('donate_notification', [currentVersion], 1);
		let buttons = [{
			label: Shrunked.strings.GetStringFromName('changelog_button_label'),
			accessKey: Shrunked.strings.GetStringFromName('changelog_button_accesskey'),
			callback: function() {
				callbackObject.resolve('changelog');
			}
		}, {
			label: Shrunked.strings.GetStringFromName('donate_button_label'),
			accessKey: Shrunked.strings.GetStringFromName('donate_button_accesskey'),
			popup: null,
			callback: function() {
				callbackObject.resolve('donate');
			}
		}];

		let recentWindow = Services.wm.getMostRecentWindow('navigator:browser');
		let shrunkedWindow;

		if (recentWindow) {
			shrunkedWindow = recentWindow.ShrunkedBrowser;
		} else {
			recentWindow = Services.wm.getMostRecentWindow('mail:3pane');
			if (recentWindow) {
				shrunkedWindow = recentWindow.ShrunkedMessenger;
			} else {
				return;
			}
		}

		shrunkedWindow.showNotificationBar(label, buttons, callbackObject).then(function(which) {
			switch (which) {
			case 'changelog':
				let version = Shrunked.prefs.getCharPref('version');
				shrunkedWindow.notificationCallback(CHANGELOG_URL + version);
				break;
			case 'donate':
				shrunkedWindow.notificationCallback(DONATE_URL);
				break;
			}
		});

		Shrunked.prefs.setIntPref('donationreminder', Date.now() / 1000);
	},
	getContentPref: function Shrunked_getContentPref(uri, name, context) {
		return new Promise((resolve, reject) => {
			this.contentPrefs2.getByDomainAndName(uri.host, name, context, {
				handleCompletion: function() {
					// If we get here without calling handleError or handleResult, there is no pref.
					resolve(null);
				},
				handleError: function(error) {
					reject(error);
				},
				handleResult: function(pref) {
					resolve(pref.value);
				}
			});
		});
	},
	getAllContentPrefs: function Shrunked_getAllContentPrefs(name) {
		return new Promise((resolve, reject) => {
			let allPrefs = new Map();

			if ('getByName' in this.contentPrefs2) {
				this.contentPrefs2.getByName(name, null, {
					handleCompletion: function() {
						resolve(allPrefs);
					},
					handleError: function(error) {
						reject(error);
					},
					handleResult: function(pref) {
						allPrefs.set(pref.domain, pref.value);
					}
				});
			} else {
				try {
					let prefs = Services.contentPrefs.getPrefsByName(name, null);
					let enumerator = prefs.enumerator;
					while (enumerator.hasMoreElements()) {
						let property = enumerator.getNext().QueryInterface(Components.interfaces.nsIProperty);
						allPrefs.set(property.name, property.value);
					}
					resolve(allPrefs);
				} catch (e) {
					reject(e);
				}
			}
		});
	},
	log: function Shrunked_log(message) {
		if (this.logEnabled) {
			if ('infoFlag' in Components.interfaces.nsIScriptError) {
				let frame = Components.stack.caller;
				let filename = frame.filename ? frame.filename.split(' -> ').pop() : null;
				let scriptError = Components.classes['@mozilla.org/scripterror;1'].createInstance(Components.interfaces.nsIScriptError);
				scriptError.init(
					message, filename, null, frame.lineNumber, frame.columnNumber,
					Components.interfaces.nsIScriptError.infoFlag, 'component javascript'
				);
				Services.console.logMessage(scriptError);
			} else {
				Services.console.logStringMessage(message);
			}
			dump(message + '\n');
		}
	},
	warn: function Shrunked_log(message) {
		if (this.logEnabled) {
			let caller = Components.stack.caller;
			let filename = caller.filename ? caller.filename.split(' -> ').pop() : null;
			let scriptError = Components.classes['@mozilla.org/scripterror;1']
				.createInstance(Components.interfaces.nsIScriptError);
			scriptError.init(
				message, filename, null, caller.lineNumber, caller.columnNumber,
				Components.interfaces.nsIScriptError.warningFlag, 'component javascript'
			);
			Services.console.logMessage(scriptError);
		}
	},
	options: {
		get exif() {
			return Shrunked.prefs.getBoolPref('options.exif');
		},
		get orientation() {
			return Shrunked.prefs.getBoolPref('options.orientation');
		},
		get gps() {
			return Shrunked.prefs.getBoolPref('options.gps');
		},
		get resample() {
			return Shrunked.prefs.getBoolPref('options.resample');
		}
	},
	get icon16() {
		return 'chrome://shrunked/content/icon16.png';
	}
};
XPCOMUtils.defineLazyGetter(Shrunked, 'prefs', function() {
	return Services.prefs.getBranch('extensions.shrunked.');
});
XPCOMUtils.defineLazyGetter(Shrunked, 'contentPrefs2', function() {
	return Services.contentPrefs.QueryInterface(Components.interfaces.nsIContentPrefService2);
});
XPCOMUtils.defineLazyGetter(Shrunked, 'logEnabled', function() {
	this.prefs.addObserver('log.enabled', {
		observe: function() {
			Shrunked.logEnabled = Shrunked.prefs.getBoolPref('log.enabled');
		}
	}, false);
	return this.prefs.getBoolPref('log.enabled');
});
XPCOMUtils.defineLazyGetter(Shrunked, 'strings', function() {
	return Services.strings.createBundle('chrome://shrunked/locale/shrunked.properties');
});
XPCOMUtils.defineLazyGetter(Shrunked, 'getPluralForm', function() {
	let pluralForm = Shrunked.strings.GetStringFromName('question_pluralform');
	let [getPlural, ] = PluralForm.makeGetter(pluralForm);
	return getPlural;
});

if (Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_DEFAULT) {
	/* globals AsyncShutdown */
	Components.utils.import('resource://gre/modules/AsyncShutdown.jsm');
	AsyncShutdown.profileBeforeChange.addBlocker('Shrunked: clean up temporary files', Shrunked.cleanup);

	var observer = {
		observe: function(subject, topic) {
			switch (topic) {
				case 'quit-application-granted':
					Services.obs.removeObserver(this, 'last-pb-context-exited');
					Services.obs.removeObserver(this, 'quit-application-granted');
					Services.obs.removeObserver(this, 'browser:purge-session-history');
					return;
				case 'last-pb-context-exited':
				case 'browser:purge-session-history':
					Shrunked.cleanup();
					return;
			}
		}
	};

	Shrunked.versionUpgrade();

	Services.obs.addObserver(observer, 'last-pb-context-exited', false);
	Services.obs.addObserver(observer, 'quit-application-granted', false);
	Services.obs.addObserver(observer, 'browser:purge-session-history', false);
}
