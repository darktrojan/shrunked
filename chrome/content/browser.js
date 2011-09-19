var ShrunkedBrowser = {

	strings: null,

	onLoad: function () {
		window.removeEventListener ("load", ShrunkedBrowser.onLoad, false);
		ShrunkedBrowser.init ();
	},

	init: function () {
		const Cc = Components.classes;
		const Ci = Components.interfaces;
		const Cu = Components.utils;

		Cu.import ('resource://shrunked/shrunked.jsm');

		this.contentPrefs = Cc ["@mozilla.org/content-pref/service;1"].getService (Ci.nsIContentPrefService);

		var pb = Cc ["@mozilla.org/privatebrowsing;1"];
		if (typeof (pb) == 'undefined') {
			this.pbService = { privateBrowsingEnabled: false };
		} else {
			this.pbService = pb.getService (Ci.nsIPrivateBrowsingService);
		}

		this.strings = document.getElementById ('shrunked-strings');
		var appcontent = document.getElementById ("appcontent");
		if (appcontent) {
			appcontent.addEventListener ("change", this.onActivate, true);
		}

		setTimeout (function () {
			Shrunked.showDonateNotification (gBrowser.getNotificationBox (), function (aNotificationBar, aButton) {
				var url = 'https://addons.mozilla.org/addon/11005/about';
				gBrowser.selectedTab = gBrowser.addTab (url);
			});
		}, 1000);
	},

	resetInputTag: function (event) {
		var inputTag = event.target;
		var paths = inputTag.originalValue;
		if (typeof paths == "object") {
			if (paths.length == 1) {
				inputTag.value = paths [0];
			} else {
				inputTag.mozSetFileNameArray (paths, paths.length);
			}
			inputTag.originalValue = null;
		}
		inputTag.removeAttribute ('shrunkedClick');
	},

	onActivate: function (event) {
		const Cc = Components.classes;
		const Ci = Components.interfaces;

		if (event.target.nodeName.toLowerCase () == 'input', event.target.type == 'file') {

			var inputTag = event.target;
			if (!inputTag.value || !(/\.jpe?g/i.test (inputTag.value)) || inputTag.getAttribute ('shrunkedclick')) {
				return;
			}

			var shouldAsk = false;
			var minimum = Shrunked.prefs.getIntPref ('fileSizeMinimum') * 1024;
			var paths = inputTag.mozGetFileNameArray ();
			for (var i = 0; i < paths.length; i++) {
				if (/\.jpe?g$/i.test (paths [i])) {
					var localFile = Cc ['@mozilla.org/file/local;1'].createInstance (Ci.nsILocalFile);
					localFile.initWithPath (paths [i]);
					if (localFile.fileSize >= minimum) {
						shouldAsk = true;
						break;
					}
				}
			}
			if (!shouldAsk) {
				return;
			}

			inputTag.setAttribute ('shrunkedclick', 'true');
			inputTag.addEventListener ('click', ShrunkedBrowser.resetInputTag, true);

			var uri = inputTag.ownerDocument.documentURIObject;
			if (!ShrunkedBrowser.pbService.privateBrowsingEnabled &&
					(uri.schemeIs ('http') || uri.schemeIs ('https'))) {
				if (ShrunkedBrowser.contentPrefs.hasPref (uri, 'extensions.shrunked.disabled')) {
					return;
				}
				var maxWidth = ShrunkedBrowser.contentPrefs.getPref (uri, 'extensions.shrunked.maxWidth');
				var maxHeight = ShrunkedBrowser.contentPrefs.getPref (uri, 'extensions.shrunked.maxHeight');
				if (maxWidth && maxHeight) {
					ShrunkedBrowser.resize (inputTag, maxWidth, maxHeight,
						Shrunked.prefs.getIntPref ('default.quality'));
					return;
				}
			}

			var form = inputTag.form;
			if (form) {
				var maxWidth = form.getAttribute ('shrunkedmaxwidth');
				var maxHeight = form.getAttribute ('shrunkedmaxheight');
				if (maxWidth && maxHeight) {
					ShrunkedBrowser.resize (inputTag, parseInt (maxWidth), parseInt (maxHeight),
						Shrunked.prefs.getIntPref ('default.quality'));
					return;
				}
			}
			ShrunkedBrowser.showNotification (inputTag);
		}
	},

	showNotification: function (inputTag) {
		var notifyBox = gBrowser.getNotificationBox ();
		if (notifyBox.getNotificationWithValue ('shrunked-notification')) {
			return;
		}

		var buttons = [];
		buttons.push ({
			accessKey: this.strings.getString ('yes_accesskey'),
			callback: ShrunkedBrowser.showOptionsDialog,
			label: this.strings.getString ('yes_label'),
			popup: null,
			inputTag: inputTag
		});
		
		var uri = inputTag.ownerDocument.documentURIObject;
		if (!ShrunkedBrowser.pbService.privateBrowsingEnabled &&
				(uri.schemeIs ('http') || uri.schemeIs ('https'))) {
			buttons.push ({
				accessKey: this.strings.getString ('never_accesskey'),
				callback: ShrunkedBrowser.disableForSite,
				label: this.strings.getString ('never_label'),
				popup: null,
				uri: uri
			});
		}
		buttons.push ({
			accessKey: this.strings.getString ('no_accesskey'),
			callback: function () {},
			label: this.strings.getString ('no_label'),
			popup: null
		});

		notifyBox = gBrowser.getNotificationBox ();
		notifyBox.removeAllNotifications (true);
		var notification = notifyBox.appendNotification (
			this.strings.getString ('question'),
			"shrunked-notification",
			"chrome://shrunked/content/shrunked.png",
			notifyBox.PRIORITY_INFO_HIGH, buttons
		);

		inputTag.ownerDocument.addEventListener ('unload', function () {
			notifyBox.removeNotification (notification);
		}, false);
	},

	disableForSite: function (notification, buttonObject) {
		var uri = buttonObject.uri;
		ShrunkedBrowser.contentPrefs.setPref (uri, 'extensions.shrunked.disabled', true);
	},

	showOptionsDialog: function (notification, buttonObject) {
		var inputTag = buttonObject.inputTag;
		var form = inputTag.form;
		var returnValues = { cancelDialog: true, inputTag: inputTag };
		window.openDialog ('chrome://shrunked/content/options.xul', 'options',
			'chrome,centerscreen,modal', returnValues);

		if (returnValues.cancelDialog) {
			return;
		}

		if (form) {
			form.setAttribute ('shrunkedmaxwidth', returnValues.maxWidth);
			form.setAttribute ('shrunkedmaxheight', returnValues.maxHeight);

			var inputs = form.getElementsByTagName ('input');
			for (var i = 0; i < inputs.length; i++) {
				var input = inputs [i];
				if (input.type == 'file') {
					ShrunkedBrowser.resize (input, returnValues.maxWidth, returnValues.maxHeight,
						Shrunked.prefs.getIntPref ('default.quality'));
				}
			}
		} else {
			ShrunkedBrowser.resize (inputTag, returnValues.maxWidth, returnValues.maxHeight,
				Shrunked.prefs.getIntPref ('default.quality'));
		}

		var uri = inputTag.ownerDocument.documentURIObject;
		if (returnValues.rememberSite && !ShrunkedBrowser.pbService.privateBrowsingEnabled &&
				(uri.schemeIs ('http') || uri.schemeIs ('https'))) {

			ShrunkedBrowser.contentPrefs.setPref (uri, 'extensions.shrunked.maxWidth', returnValues.maxWidth);
			ShrunkedBrowser.contentPrefs.setPref (uri, 'extensions.shrunked.maxHeight', returnValues.maxHeight);
		}
	},

	resize: function (inputTag, maxWidth, maxHeight, quality) {
		const Cc = Components.classes;
		const Ci = Components.interfaces;

		var paths = inputTag.mozGetFileNameArray ();
		var newPaths = [];

		inputTag.originalValue = paths;

		for (var i = 0; i < paths.length; i++) {
			if (/\.jpe?g$/i.test (paths [i])) {
				var sourceFile = Cc ["@mozilla.org/file/local;1"].createInstance (Ci.nsILocalFile);
				sourceFile.initWithPath (paths [i]);
				Shrunked.enqueue (document, sourceFile, maxWidth, maxHeight, quality, function (destFile) {
					if (destFile) {
						// this is async, we need to wait for it
						newPaths.push (destFile.path);
						if (newPaths.length == paths.length) {
							inputTag.mozSetFileNameArray (newPaths, newPaths.length);
						}
					}
				});
			} else {
				newPaths.push (paths [i]);
			}
		}
	}
};

window.addEventListener ("load", ShrunkedBrowser.onLoad, false);
