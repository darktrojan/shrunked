var ShrunkedCompose = {

	onLoad: function() {
		window.removeEventListener('load', ShrunkedCompose.onLoad, false);
		ShrunkedCompose.init();
	},

	init: function() {
		const Cc = Components.classes;
		const Ci = Components.interfaces;
		const Cu = Components.utils;

		Cu.import('resource://gre/modules/Services.jsm');
		Cu.import('resource://shrunked/shrunked.jsm');

		this.oldGenericSendMessage = window.GenericSendMessage;
		window.GenericSendMessage = this.newGenericSendMessage;

		// the editor's document isn't available immediately
		setTimeout(function() {
			var target = document.getElementById('content-frame').contentDocument.body;
			var config = { attributes: false, childList: true, characterData: false };
			var observer = new MutationObserver(function(mutations) {
				mutations.forEach(function(mutation) {
					if (mutation.addedNodes) {
						for (var target of mutation.addedNodes) {
							ShrunkedCompose.resizeInline(target);
						}
					}
				});
			});
			observer.observe(target, config);
		}, 500);
	},

	inlineImages: [],
	timeout: null,
	resizeInline: function(target) {
		const Ci = Components.interfaces;
		const Cu = Components.utils;

		if (target.nodeName == 'IMG') {
			ShrunkedCompose.inlineImages.push(target);
			if (ShrunkedCompose.timeout) {
				clearTimeout(ShrunkedCompose.timeout);
			}

			ShrunkedCompose.timeout = setTimeout(function() {
				var minimum = Shrunked.prefs.getIntPref('fileSizeMinimum') * 1024;
				var minimumData = 4 * minimum / 3;

				for (var i = 0; i < ShrunkedCompose.inlineImages.length; i++) {
					var img = ShrunkedCompose.inlineImages[i];
					var keep = false;
					if (/^file:.*\.jpe?g/i.test(img.src)) {
						var file = Services.io.newURI(img.src, null, null).QueryInterface(Ci.nsIFileURL).file;
						if (file.fileSize >= minimum && img.width >= 100 && img.height >= 100 && !img.hasAttribute('shrunked:resized')) {
							keep = true;
						}
					} else if (/^data:application\/x-moz-file;base64,\/9j\//.test(img.src) && img.src.length - 35 >= minimumData) {
						keep = true;
					} else if (/^data:image\/jpeg;base64,/.test(img.src) && img.src.length - 23 >= minimumData) {
						keep = true;
					} else if (/type=image\/jpeg/.test(img.src) || /\.jpe?g$/i.test(img.src)) {
						keep = true;
					}
					if (!keep) {
						ShrunkedCompose.inlineImages.splice(i, 1);
						i--;
					}
				}
				if (ShrunkedCompose.inlineImages.length == 0) {
					return;
				}
				var returnValues = { cancelDialog: true };
				window.openDialog('chrome://shrunked/content/options.xul',
						'options', 'chrome,centerscreen,modal', returnValues);
				if (returnValues.cancelDialog) {
					return;
				}
				if (returnValues.maxWidth > 0) {
					if (typeof window.Shrunked == 'undefined') {
						Cu.import('resource://shrunked/shrunked.jsm', window);
					}
					var quality = Shrunked.prefs.getIntPref('default.quality');
					for (var i = 0; i < ShrunkedCompose.inlineImages.length; i++) {
						var img = ShrunkedCompose.inlineImages[i];
						ShrunkedCompose.doResizeInline(img, returnValues.maxWidth, returnValues.maxHeight, quality);
					}
				} else {
					for (var i = 0; i < ShrunkedCompose.inlineImages.length; i++) {
						var img = ShrunkedCompose.inlineImages[i];
						img.setAttribute('shrunked:resized', 'false');
					}
				}
				ShrunkedCompose.inlineImages = [];
				ShrunkedCompose.timeout = null;
			}, 500);
		} else {
			for (var child of target.children) {
				this.resizeInline(child);
			}
		}
	},
	doResizeInline: function(img, maxWidth, maxHeight, quality) {
		Shrunked.enqueue(img.src, maxWidth, maxHeight, quality, function(destFile) {
			if (destFile) {
				img.src = Services.io.newFileURI(destFile).spec;
				img.removeAttribute('width');
				img.removeAttribute('height');
				img.setAttribute('shrunked:resized', 'true');
			}
		});
	},

	newGenericSendMessage: function(msgType) {
		const Cu = Components.utils;

		var doResize = msgType == nsIMsgCompDeliverMode.Now || msgType == nsIMsgCompDeliverMode.Later;
		var bucket = document.getElementById('attachmentBucket');
		var images = [];
		var minimum = Shrunked.prefs.getIntPref('fileSizeMinimum') * 1024;

		if (doResize) {
			try {
				for (var index = 0; index < bucket.getRowCount(); index++) {
					var item = bucket.getItemAtIndex(index);
					if (/\.jpe?g$/i.test(item.attachment.url) && (item.attachment.size == -1 || item.attachment.size >= minimum)) {
						images.push({ url: item.attachment.url, item: item });
					}
				}

				if (images.length > 0) {
					var returnValues = { cancelDialog: true };
					window.openDialog('chrome://shrunked/content/options.xul',
							'options', 'chrome,centerscreen,modal', returnValues);
					if (returnValues.cancelDialog) {
						return;
					}
					if (returnValues.maxWidth > 0) {
						returnValues.cancelDialog = true;
						window.openDialog('chrome://shrunked/content/progress.xul',
								'progress', 'chrome,centerscreen,modal', images, returnValues);
						if (returnValues.cancelDialog) {
							return;
						}
						for (var i = 0; i < images.length; i++) {
							var item = images[i].item;
							item.attachment.contentLocation = item.attachment.url;
							if (images[i].destFile) {
								item.attachment.url = Services.io.newFileURI(images[i].destFile).spec;
							}
						}
					}
				}
			} catch (e) {
				Cu.reportError(e);
			}
		}

		ShrunkedCompose.oldGenericSendMessage(msgType);

		// undo, in case send failed
		if (doResize) {
			for (var i = 0; i < images.length; i++) {
				var item = images[i].item;
				var contentLocation = item.attachment.contentLocation;
				if (contentLocation && /\.jpe?g$/i.test(contentLocation)) {
					item.attachment.url = contentLocation;
					item.attachment.contentLocation = null;
				}
			}
		}
	}
};

window.addEventListener('load', ShrunkedCompose.onLoad, false);
