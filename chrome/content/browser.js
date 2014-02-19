let ShrunkedBrowser = {

	strings: null,

	init: function() {
		Components.utils.import('resource://gre/modules/FileUtils.jsm');
		Components.utils.import('resource://shrunked/shrunked.jsm');

		this.strings = document.getElementById('shrunked-strings');
		let appcontent = document.getElementById('appcontent');
		if (appcontent) {
			appcontent.addEventListener('change', this.onActivate.bind(this), true);
		}

		setTimeout(function() {
			Shrunked.showDonateNotification(gBrowser.getNotificationBox(), function(aNotificationBar, aButton) {
				let url = 'https://addons.mozilla.org/addon/11005/about';
				gBrowser.selectedTab = gBrowser.addTab(url);
			});
		}, 1000);
	},

	onActivate: function(aEvent) {
		if (aEvent.target.localName != 'input' || aEvent.target.type != 'file') {
			return;
		}

		let inputTag = aEvent.target;
		let form = inputTag.form;
		let context = PrivateBrowsingUtils.privacyContextFromWindow(window);
		let uri = inputTag.ownerDocument.documentURIObject;

		if (uri.schemeIs('http') || uri.schemeIs('https')) {
			if (Services.contentPrefs.hasPref(uri, 'extensions.shrunked.disabled', context)) {
				return;
			}
			let maxWidth = Services.contentPrefs.getPref(uri, 'extensions.shrunked.maxWidth', context);
			let maxHeight = Services.contentPrefs.getPref(uri, 'extensions.shrunked.maxHeight', context);
			if (maxWidth && maxHeight) {
				ShrunkedBrowser.resize(inputTag, maxWidth, maxHeight,
					Shrunked.prefs.getIntPref('default.quality'));
				return;
			}
		}

		let form = inputTag.form;
		if (form) {
			let maxWidth = form.getAttribute('shrunkedmaxwidth');
			let maxHeight = form.getAttribute('shrunkedmaxheight');
			if (maxWidth && maxHeight) {
				ShrunkedBrowser.resize(inputTag, parseInt(maxWidth), parseInt(maxHeight),
					Shrunked.prefs.getIntPref('default.quality'));
				return;
			}
		}

		if (form) {
			this.imageURLs = [];
			for (let input of form.querySelectorAll('input[type="file"]')) {
				this.imageURLs = this.imageURLs.concat(ShrunkedBrowser.getURLsFromInputTag(input));
			}
		} else {
			this.imageURLs = ShrunkedBrowser.getURLsFromInputTag(inputTag);
		}

		if (!this.imageURLs.length) {
			return;
		}

		let notifyBox = gBrowser.getNotificationBox();
		if (notifyBox.getNotificationWithValue('shrunked-notification')) {
			return;
		}

		let buttons = [];

		buttons.push({
			accessKey: this.strings.getString('yes_accesskey'),
			callback: ShrunkedBrowser.showOptionsDialog,
			label: this.strings.getString('yes_label'),
			inputTag: inputTag,
			form: form,
			context: context,
			uri: uri
		});

		if (!PrivateBrowsingUtils.isWindowPrivate(window) &&
				(uri.schemeIs('http') || uri.schemeIs('https'))) {
			buttons.push({
				accessKey: this.strings.getString('never_accesskey'),
				callback: ShrunkedBrowser.disableForSite,
				label: this.strings.getString('never_label'),
				context: context,
				uri: uri
			});
		}
		buttons.push({
			accessKey: this.strings.getString('no_accesskey'),
			callback: function() {},
			label: this.strings.getString('no_label'),
		});

		notifyBox = gBrowser.getNotificationBox();
		notifyBox.removeAllNotifications(true);
		let notification = notifyBox.appendNotification(
			this.strings.getString('question'),
			'shrunked-notification',
			null,
			notifyBox.PRIORITY_INFO_HIGH, buttons
		);

		inputTag.ownerDocument.addEventListener('unload', function() {
			notifyBox.removeNotification(notification);
		});
	},

	showOptionsDialog: function(aNotification, aButtonObject) {
		let {inputTag, form, context, uri} = aButtonObject;
		let returnValues = { cancelDialog: true, inputTag: inputTag };

		window.openDialog('chrome://shrunked/content/options.xul', 'options',
			'chrome,centerscreen,modal', returnValues, ShrunkedBrowser.imageURLs);

		if (returnValues.cancelDialog) {
			return;
		}

		if (form) {
			form.setAttribute('shrunkedmaxwidth', returnValues.maxWidth);
			form.setAttribute('shrunkedmaxheight', returnValues.maxHeight);

			for (let input of form.querySelectorAll('input[type="file"]')) {
				ShrunkedBrowser.resize(input, returnValues.maxWidth, returnValues.maxHeight, Shrunked.prefs.getIntPref('default.quality'));
			}
		} else {
			ShrunkedBrowser.resize(inputTag, returnValues.maxWidth, returnValues.maxHeight, Shrunked.prefs.getIntPref('default.quality'));
		}

		if (returnValues.rememberSite && (uri.schemeIs('http') || uri.schemeIs('https'))) {
			Services.contentPrefs.setPref(uri, 'extensions.shrunked.maxWidth', returnValues.maxWidth, context);
			Services.contentPrefs.setPref(uri, 'extensions.shrunked.maxHeight', returnValues.maxHeight, context);
		}
	},

	disableForSite: function(aNotification, aButtonObject) {
		let {context, uri} = aButtonObject;
		Services.contentPrefs.setPref(uri, 'extensions.shrunked.disabled', true, context);
	},

	getURLsFromInputTag: function(aInputTag) {
		let paths = aInputTag.mozGetFileNameArray();
		let URLs = [];

		for (let path of paths) {
			if (/\.jpe?g$/i.test(path) && Shrunked.fileLargerThanThreshold(path)) {
				let sourceFile = new FileUtils.File(path);
				let sourceURL = Services.io.newFileURI(sourceFile);
				URLs.push(sourceURL.spec);
			}
		}
		return URLs;
	},

	resize: function(aInputTag, aMaxWidth, aMaxHeight, aQuality) {
		let paths = aInputTag.mozGetFileNameArray();
		let newPaths = [];

		aInputTag.originalValue = paths;
		aInputTag.addEventListener('click', ShrunkedBrowser.resetInputTag, true);

		for (let path of paths) {
			if (/\.jpe?g$/i.test(path) && Shrunked.fileLargerThanThreshold(path)) {
				let sourceFile = new FileUtils.File(path);
				Shrunked.enqueue(document, sourceFile, aMaxWidth, aMaxHeight, aQuality, function(destFile) {
					if (destFile) {
						// this is async, we need to wait for it
						newPaths.push(destFile.path);
						if (newPaths.length == paths.length) {
							aInputTag.mozSetFileNameArray(newPaths, newPaths.length);
						}
					}
				});
			} else {
				newPaths.push(path);
			}
		}
	},

	resetInputTag: function(aEvent) {
		let inputTag = aEvent.target;
		let paths = inputTag.originalValue;
		inputTag.mozSetFileNameArray(paths, paths.length);
		inputTag.originalValue = null;
	}
};

window.addEventListener('load', ShrunkedBrowser.init.bind(ShrunkedBrowser));
