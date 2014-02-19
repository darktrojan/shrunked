let ShrunkedCompose = {

	init: function() {
		Components.utils.import('resource://gre/modules/Services.jsm');
		Components.utils.import('resource://shrunked/shrunked.jsm');

		this.oldGenericSendMessage = window.GenericSendMessage;
		window.GenericSendMessage = this.newGenericSendMessage;

		// the editor's document isn't available immediately
		let editFrame = document.getElementById('content-frame');
		editFrame.addEventListener('pageshow', function addObserver(aEvent) {
			editFrame.removeEventListener('pageshow', addObserver, false);
			let target = editFrame.contentDocument.body;
			let config = { attributes: false, childList: true, characterData: false };
			let observer = new MutationObserver(function(mutations) {
				for (let mutation of mutations) {
					if (mutation.addedNodes) {
						for (let target of mutation.addedNodes) {
							ShrunkedCompose.maybeResizeInline(target);
						}
					}
				}
			});
			observer.observe(target, config);
		});
		editFrame.addEventListener('drop', (aEvent) => {
			for (let file of aEvent.dataTransfer.files) {
				ShrunkedCompose.droppedCache.set(file.name, file.size);
			}
		});
	},

	droppedCache: new Map(),
	inlineImages: [],
	timeout: null,
	asking: false,
	maybeResizeInline: function(target) {
		if (target.nodeName == 'IMG') {
			let parent = target.parentNode;
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
					ShrunkedCompose.maybeResizeInline(target);
				});
				return;
			}

			if (target.hasAttribute('shrunked:resized') ||
					!Shrunked.imageIsJPEG(target) || !Shrunked.imageLargerThanThreshold(target.src)) {
				return;
			}

			let src = target.getAttribute('src');
			if (/^data:/.test(src)) {
				src = src.substring(src.indexOf(',') + 1);
				let srcSize = src.length * 3 / 4;
				if (src.substr(-1) == '=') {
					srcSize--;
					if (src.substr(-2, 1) == '=') {
						srcSize--;
					}
				}
				for (let [name, size] of this.droppedCache) {
					if (srcSize == size) {
						target.maybesrc = name;
						break;
					}
				}
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
				this.timeout = null;
				this.droppedCache.clear();

				let strings = document.getElementById('shrunked-strings');
				let buttons = [{
					accessKey: strings.getString('yes_accesskey'),
					callback: ShrunkedCompose.showOptionsDialog.bind(this),
					label: strings.getString('yes_label')
				}, {
					accessKey: strings.getString('no_accesskey'),
					callback: () => { this.asking = false; },
					label: strings.getString('no_label')
				}];

				let notifyBox = document.getElementById('shrunked-notification-box');
				let notification = notifyBox.appendNotification(
					strings.getString('question'), 'shrunked-notification', null, notifyBox.PRIORITY_INFO_HIGH, buttons
				);
			}, 500);
		} else if (target.nodeType == Node.ELEMENT_NODE) {
			for (let child of target.children) {
				this.maybeResizeInline(child);
			}
		}
	},

	showOptionsDialog: function() {
		let returnValues = { cancelDialog: true };
		let imageURLs = [];
		let imageNames = [];
		for (let img of this.inlineImages) {
			imageURLs.push(img.src);
			imageNames.push(img.maybesrc);
		}

		window.openDialog('chrome://shrunked/content/options.xul', 'options', 'chrome,centerscreen,modal', returnValues, imageURLs, imageNames);
		this.asking = false;

		if (returnValues.cancelDialog) {
			return;
		}

		let quality = Shrunked.prefs.getIntPref('default.quality');
		for (let img of this.inlineImages) {
			this.doResizeInline(img, returnValues.maxWidth, returnValues.maxHeight, quality);
		}

		this.inlineImages = [];
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
		let doResize = msgType == nsIMsgCompDeliverMode.Now || msgType == nsIMsgCompDeliverMode.Later;
		let bucket = document.getElementById('attachmentBucket');
		let images = [];
		let minimum = Shrunked.prefs.getIntPref('fileSizeMinimum') * 1024;

		if (doResize) {
			try {
				for (let index = 0; index < bucket.getRowCount(); index++) {
					let item = bucket.getItemAtIndex(index);
					if (/\.jpe?g$/i.test(item.attachment.url) && (item.attachment.size == -1 || item.attachment.size >= minimum)) {
						images.push({ url: item.attachment.url, item: item });
					}
				}

				if (images.length > 0) {
					let returnValues = { cancelDialog: true };
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
						for (let i = 0; i < images.length; i++) {
							let item = images[i].item;
							item.attachment.contentLocation = item.attachment.url;
							if (images[i].destFile) {
								item.attachment.url = Services.io.newFileURI(images[i].destFile).spec;
							}
						}
					}
				}
			} catch (e) {
				Components.utils.reportError(e);
			}
		}

		ShrunkedCompose.oldGenericSendMessage(msgType);

		// undo, in case send failed
		if (doResize) {
			for (let i = 0; i < images.length; i++) {
				let item = images[i].item;
				let contentLocation = item.attachment.contentLocation;
				if (contentLocation && /\.jpe?g$/i.test(contentLocation)) {
					item.attachment.url = contentLocation;
					item.attachment.contentLocation = null;
				}
			}
		}
	}
};

window.addEventListener('load', ShrunkedCompose.init.bind(ShrunkedCompose));
