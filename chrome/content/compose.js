var ShrunkedCompose = {

	onLoad: function () {
		window.removeEventListener ("load", ShrunkedCompose.onLoad, false);
		ShrunkedCompose.init ();
	},

	init: function () {
		const Cc = Components.classes;
		const Ci = Components.interfaces;
		const Cu = Components.utils;

		Cu.import ('resource://gre/modules/Services.jsm');
		Cu.import ('resource://shrunked/shrunked.jsm');

		this.oldGenericSendMessage = window.GenericSendMessage;
		window.GenericSendMessage = this.newGenericSendMessage;

		// the editor's document isn't available immediately
		setTimeout (function () {
			document.getElementById ('content-frame').contentDocument.body
				.addEventListener ('DOMNodeInserted', ShrunkedCompose.resizeInline, false);
		}, 500);
	},

	inlineImages: [],
	timeout: null,
	resizeInline: function (event) {
		const Ci = Components.interfaces;
		const Cu = Components.utils;

		if (event.target.nodeName == 'IMG') {
			ShrunkedCompose.inlineImages.push (event.target);
			if (ShrunkedCompose.timeout) {
				clearTimeout (ShrunkedCompose.timeout);
			}

			ShrunkedCompose.timeout = setTimeout (function () {
				var minimum = Shrunked.prefs.getIntPref ('fileSizeMinimum') * 1024;
				var minimumData = 4 * minimum / 3;

				for (var i = 0; i < ShrunkedCompose.inlineImages.length; i++) {
					var img = ShrunkedCompose.inlineImages [i];
					var keep = false;
					if (/^file:.*\.jpe?g/i.test (img.src)) {
						var file = Services.io.newURI (img.src, null, null).QueryInterface (Ci.nsIFileURL).file;
						if (file.fileSize >= minimum && img.width >= 100 && img.height >= 100 && !img.hasAttribute ('shrunked:resized')) {
							keep = true;
						}
					} else if (/^data:application\/x-moz-file;base64,\/9j\//.test(img.src) && img.src.length - 35 >= minimumData) {
						keep = true;
					} else if (/^data:image\/jpeg;base64,/.test(img.src) && img.src.length - 23 >= minimumData) {
						keep = true;
					}
					if (!keep) {
						ShrunkedCompose.inlineImages.splice (i, 1);
						i--;
					}
				}
				if (ShrunkedCompose.inlineImages.length == 0) {
					return;
				}
				var returnValues = { cancelDialog: true };
				window.openDialog ('chrome://shrunked/content/options.xul',
						'options', 'chrome,centerscreen,modal', returnValues);
				if (returnValues.cancelDialog) {
					return;
				}
				if (returnValues.maxWidth > 0) {
					if (typeof window.Shrunked == 'undefined') {
						Cu.import ('resource://shrunked/shrunked.jsm', window);
					}
					var quality = Shrunked.prefs.getIntPref ('default.quality');
					for (var i = 0; i < ShrunkedCompose.inlineImages.length; i++) {
						var img = ShrunkedCompose.inlineImages [i];
						ShrunkedCompose.doResizeInline (img, returnValues.maxWidth, returnValues.maxHeight, quality);
					}
				} else {
					for (var i = 0; i < ShrunkedCompose.inlineImages.length; i++) {
						var img = ShrunkedCompose.inlineImages [i];
						img.setAttribute ('shrunked:resized', 'false');
					}
				}
				ShrunkedCompose.inlineImages = [];
				ShrunkedCompose.timeout = null;
			}, 500);
		}
	},
	doResizeInline: function (img, maxWidth, maxHeight, quality) {
		Shrunked.enqueue (document, img.src, maxWidth, maxHeight, quality, function (destFile) {
			if (destFile) {
				img.src = Services.io.newFileURI (destFile).spec;
				img.removeAttribute ('width');
				img.removeAttribute ('height');
				img.setAttribute ('shrunked:resized', 'true');
			}
		});
	},

	newGenericSendMessage: function (msgType) {
		const Cu = Components.utils;

		var doResize = msgType == nsIMsgCompDeliverMode.Now || msgType == nsIMsgCompDeliverMode.Later;
		var bucket = document.getElementById ('attachmentBucket');
		var images = [];
		var minimum = Shrunked.prefs.getIntPref ('fileSizeMinimum') * 1024;

		if (doResize) {
			try {
				for (var index = 0; index < bucket.getRowCount (); index++) {
					var item = bucket.getItemAtIndex (index);
					if (/\.jpe?g$/i.test (item.attachment.url) && (item.attachment.size == -1 || item.attachment.size >= minimum)) {
						images.push ({ url: item.attachment.url, item: item });
					}
				}

				if (images.length > 0) {
					var returnValues = { cancelDialog: true };
					window.openDialog ('chrome://shrunked/content/options.xul',
							'options', 'chrome,centerscreen,modal', returnValues);
					if (returnValues.cancelDialog) {
						return;
					}
					if (returnValues.maxWidth > 0) {
						returnValues.cancelDialog = true;
						window.openDialog ('chrome://shrunked/content/progress.xul',
								'progress', 'chrome,centerscreen,modal', images, returnValues);
						if (returnValues.cancelDialog) {
							return;
						}
						for (var i = 0; i < images.length; i++) {
							var item = images [i].item;
							item.attachment.contentLocation = item.attachment.url;
							if (images [i].destFile) {
								item.attachment.url = Services.io.newFileURI (images [i].destFile).spec;
							}
						}
					}
				}
			} catch (e) {
				Cu.reportError (e);
			}
		}

		ShrunkedCompose.oldGenericSendMessage (msgType);

		// undo, in case send failed
		if (doResize) {
			for (var i = 0; i < images.length; i++) {
				var item = images [i].item;
				var contentLocation = item.attachment.contentLocation;
				if (contentLocation && /\.jpe?g$/i.test (contentLocation)) {
					item.attachment.url = contentLocation;
					item.attachment.contentLocation = null;
				}
			}
		}
	}
}

window.addEventListener ("load", ShrunkedCompose.onLoad, false);
