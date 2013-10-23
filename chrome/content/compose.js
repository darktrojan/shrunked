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
		let editFrame = document.getElementById('content-frame');
		editFrame.addEventListener('pageshow', function addObserver(aEvent) {
			editFrame.removeEventListener('pageshow', addObserver, false);
			var target = editFrame.contentDocument.body;
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
		}, false);
	},

	inlineImages: [],
	timeout: null,
	asking: false,
	resizeInline: function(target) {
		const Ci = Components.interfaces;
		const Cu = Components.utils;

		if (target.nodeName == 'IMG') {
			var parent = target.parentNode;
			while (parent && 'classList' in parent) {
				if (parent.classList.contains('moz-signature') ||
					(parent.getAttribute('type') == 'cite') ||
					parent.classList.contains('moz-forward-container')) {
					return;
				}
				parent = parent.parentNode;
			}

			if (!target.complete) {
				target.addEventListener('load', function targetOnLoad() {
					target.removeEventListener('load', targetOnLoad, false);
					ShrunkedCompose.resizeInline(target);
				}, false);
				return;
			}

			if (target.hasAttribute('shrunked:resized') ||
					!Shrunked.imageIsJPEG(target) || !Shrunked.imageLargerThanThreshold(target.src)) {
				return;
			}

			this.inlineImages.push(target);
			if (this.timeout) {
				clearTimeout(this.timeout);
			}

			if (this.asking) {
				return;
			}

			this.timeout = setTimeout(() => {
				this.asking = true;
				var returnValues = { cancelDialog: true };
				window.openDialog('chrome://shrunked/content/options.xul',
						'options', 'chrome,centerscreen,modal', returnValues);
				this.asking = false;
				if (returnValues.cancelDialog) {
					return;
				}
				if (returnValues.maxWidth > 0) {
					if (typeof window.Shrunked == 'undefined') {
						Cu.import('resource://shrunked/shrunked.jsm', window);
					}
					var quality = Shrunked.prefs.getIntPref('default.quality');
					for (var i = 0; i < this.inlineImages.length; i++) {
						var img = this.inlineImages[i];
						this.doResizeInline(img, returnValues.maxWidth, returnValues.maxHeight, quality);
					}
				} else {
					for (var i = 0; i < this.inlineImages.length; i++) {
						var img = this.inlineImages[i];
						img.setAttribute('shrunked:resized', 'false');
					}
				}
				this.inlineImages = [];
				this.timeout = null;
			}, 500);
		} else if (target.nodeType == Node.ELEMENT_NODE) {
			for (var child of target.children) {
				this.resizeInline(child);
			}
		}
	},
	doResizeInline: function(img, maxWidth, maxHeight, quality) {
		Shrunked.enqueue(document, img.src, maxWidth, maxHeight, quality, function(destFile) {
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
