let EXPORTED_SYMBOLS = ['Shrunked'];

const ID = 'shrunked@darktrojan.net';
const XHTMLNS = 'http://www.w3.org/1999/xhtml';

Components.utils.import('resource://gre/modules/AsyncShutdown.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

XPCOMUtils.defineLazyModuleGetter(this, 'FileUtils', 'resource://gre/modules/FileUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'NetUtil', 'resource://gre/modules/NetUtil.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'OS', 'resource://gre/modules/osfile.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'PluralForm', 'resource://gre/modules/PluralForm.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Promise', 'resource://gre/modules/Promise.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'ShrunkedImage', 'resource://shrunked/ShrunkedImage.jsm');

let temporaryFiles = [];

let Shrunked = {
	fileLargerThanThreshold: function(aPath) {
		let minimum = Shrunked.prefs.getIntPref('fileSizeMinimum') * 1024;

		let file = new FileUtils.File(aPath);
		return file.fileSize >= minimum;
	},
	imageIsJPEG: function(aImage) {
		let request = aImage.getRequest(Components.interfaces.nsIImageLoadingContent.CURRENT_REQUEST);
		return !!request && request.mimeType == 'image/jpeg';
	},

	resize: function(sourceFile, maxWidth, maxHeight, quality) {
		let deferred = Promise.defer();
		new ShrunkedImage(sourceFile, maxWidth, maxHeight, quality).doEverything().then(function(destFile) {
			temporaryFiles.push(destFile);
			deferred.resolve(destFile);
		});
		return deferred.promise;
	},
	cleanup: function() {
		let promises = [];
		for (let path of temporaryFiles) {
			promises.push(OS.File.remove(path));
		}
		return Promise.all(promises);
	},
	showStartupNotification: function(aNotificationBox, aCallback) {
		function parseVersion(aVersion) {
			let match = /^\d+(\.\d+)?/.exec(aVersion);
			return match ? match[0] : aVersion;
		}

		let currentVersion = 0;
		let oldVersion = 0;

		if (Shrunked.prefs.getPrefType('version') == Components.interfaces.nsIPrefBranch.PREF_STRING) {
			oldVersion = Shrunked.prefs.getCharPref('version');
		}
		Components.utils.import('resource://gre/modules/AddonManager.jsm');
		AddonManager.getAddonByID(ID, function(addon) {
			currentVersion = addon.version;
			Shrunked.prefs.setCharPref('version', currentVersion);

			let comparator = Components.classes['@mozilla.org/xpcom/version-comparator;1'].createInstance(Components.interfaces.nsIVersionComparator);
			if (oldVersion == 0 || comparator.compare(parseVersion(oldVersion), parseVersion(currentVersion)) >= 0) {
				return;
			}

			let label = Shrunked.strings.formatStringFromName('donate_notification', [currentVersion], 1);
			let value = 'shrunked-donate';
			let buttons = [{
				label: Shrunked.strings.GetStringFromName('donate_button_label'),
				accessKey: Shrunked.strings.GetStringFromName('donate_button_accesskey'),
				popup: null,
				callback: function() {
					aCallback('https://addons.mozilla.org/addon/shrunked-image-resizer/contribute/installed/');
				}
			}];
			Shrunked.prefs.setIntPref('donationreminder', Date.now() / 1000);
			aNotificationBox.appendNotification(label, value, null, aNotificationBox.PRIORITY_INFO_LOW, buttons);
		});
	},
	getContentPref: function(aURI, aName, aContext) {
		let deferred = Promise.defer();

		this.contentPrefs2.getByDomainAndName(aURI.host, aName, aContext, {
			handleCompletion: function(aReason) {
				// If we get here without calling handleError or handleResult, there is no pref.
				deferred.resolve(null);
			},
			handleError: function(aError) {
				deferred.reject(aError);
			},
			handleResult: function(aPref) {
				deferred.resolve(aPref.value);
			}
		});

		return deferred.promise;
	},
	getAllContentPrefs: function(aName) {
		let deferred = Promise.defer();
		let allPrefs = new Map();

		if ('getByName' in this.contentPrefs2) {
			this.contentPrefs2.getByName(aName, null, {
				handleCompletion: function(aReason) {
					deferred.resolve(allPrefs);
				},
				handleError: function(aError) {
					deferred.reject(aError);
				},
				handleResult: function(aPref) {
					allPrefs.set(aPref.domain, aPref.value);
				}
			});
		} else {
			try {
				let prefs = Services.contentPrefs.getPrefsByName(aName, null);
				let enumerator = prefs.enumerator;
				while (enumerator.hasMoreElements()) {
					let property = enumerator.getNext().QueryInterface(Components.interfaces.nsIProperty);
					allPrefs.set(property.name, property.value);
				}
				deferred.resolve(allPrefs);
			} catch (e) {
				deferred.reject(e);
			}
		}

		return deferred.promise;
	},
	log: function(aMessage) {
		if (this.logEnabled) {
			let caller = Components.stack.caller;
			Services.console.logStringMessage('Shrunked: ' + aMessage + '\n' + caller.filename + ', line ' + caller.lineNumber);
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
		observe: function(aSubject, aTopic, aData) {
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
	let [getPlural,] = PluralForm.makeGetter(pluralForm);
	return getPlural;
});

AsyncShutdown.profileBeforeChange.addBlocker('Shrunked: clean up temporary files', Shrunked.cleanup);

let observer = {
	observe: function(aSubject, aTopic, aData) {
		switch (aTopic) {
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

Services.obs.addObserver(observer, 'last-pb-context-exited', false);
Services.obs.addObserver(observer, 'quit-application-granted', false);
Services.obs.addObserver(observer, 'browser:purge-session-history', false);