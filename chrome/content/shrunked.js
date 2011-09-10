var Shrunked = {

	ID: 'shrunked@darktrojan.net',

	onload: function () {
		window.removeEventListener ('load', Shrunked.onload, false);
		Shrunked.init ();
	},

	init: function () {
		const Cc = Components.classes;
		const Ci = Components.interfaces;

		this.prefService = Cc ['@mozilla.org/preferences-service;1'].getService (Ci.nsIPrefService);
		this.prefs = this.prefService.getBranch ('extensions.shrunked.');
		this.ioService = Cc ['@mozilla.org/network/io-service;1'].getService (Ci.nsIIOService);
		this.directoryService = Cc ['@mozilla.org/file/directory_service;1'].getService (Ci.nsIProperties);

		var em = Cc ['@mozilla.org/extensions/manager;1'].getService (Ci.nsIExtensionManager);
		this.oldVersion = 0;
		this.currentVersion = em.getItemForID (this.ID).version;
		if (this.prefs.getPrefType ('version') == Ci.nsIPrefBranch.PREF_STRING) {
			this.oldVersion = this.prefs.getCharPref ('version');
		}
		this.prefs.setCharPref ('version', this.currentVersion);
	},

	resize: function (image, filename, maxWidth, maxHeight, quality) {
		const Ci = Components.interfaces;
//var s = Date.now ();
		var canvas = this.createCanvas (image, maxWidth, maxHeight);
		if (canvas == image) {
			return null;
		}

		var destFile = Shrunked.directoryService.get ('TmpD', Ci.nsIFile);
		destFile.append (filename);
		Shrunked.saveCanvas (canvas, destFile, quality);
//alert ('write to file took ' + (Date.now () - s) + 'ms');
		return destFile;
	},

	resizeAsync: function (sourceFile, maxWidth, maxHeight, quality, callback) {
		const Ci = Components.interfaces;

		var sourceURI;
		if (typeof sourceFile == 'string') {
			sourceURI = sourceFile;
			sourceFile = Shrunked.ioService.newURI (sourceFile, null, null).QueryInterface (Ci.nsIFileURL).file;
		} else {
			sourceURI = Shrunked.ioService.newFileURI (sourceFile).spec;
		}
		var image = new Image ();
		image.onload = function () {
			var destFile = Shrunked.resize (image, sourceFile.leafName, maxWidth, maxHeight, quality);
			if (callback) {
				callback (destFile);
			}
		};
		image.onerror = function () {
			if (callback) {
				callback ();
			}
		};
		image.src = sourceURI;
	},

	createCanvas: function (image, maxWidth, maxHeight) {
		var ratio = Math.max (1, Math.max (image.width / maxWidth, image.height / maxHeight));
		if (ratio <= 1) {
			var canvas = document.createElementNS ('http://www.w3.org/1999/xhtml', 'canvas');
			var context = canvas.getContext ('2d');
			canvas.width = image.width;
			canvas.height = image.height;
			context.drawImage (image, 0, 0, image.width, image.height);
			return canvas;
		}
		if (ratio >= 3) {
			return this.nineResample (image, 1 / ratio);
		}
		if (ratio >= 2) {
			return this.fourResample (image, 1 / ratio);
		}
		return this.floatResample (image, ratio);
	},

	saveCanvas: function (canvas, destFile, quality) {
		const Cc = Components.classes;
		const Ci = Components.interfaces;

		var source = Shrunked.ioService.newURI (canvas.toDataURL ('image/jpeg', 'quality=' + quality), null, null);

		var persist = Cc ['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance (Ci.nsIWebBrowserPersist);
		persist.persistFlags = Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
		persist.persistFlags |= Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
		persist.saveURI (source, null, null, null, null, destFile);
	},

	nineResample: function (image, ratio) {
		const Cc = Components.classes;
		const Ci = Components.interfaces;

		var newWidth = Math.floor (image.width * ratio + 0.025);
		var newHeight = Math.floor (image.height * ratio + 0.025);
		var oldWidth = newWidth * 3;
		var oldHeight = newHeight * 3;

		image.width = oldWidth;
		image.height = oldHeight;

		var oldCanvas = document.createElementNS ('http://www.w3.org/1999/xhtml', 'canvas');
		var oldContext = oldCanvas.getContext ('2d');
		oldCanvas.width = oldWidth;
		oldCanvas.height = oldHeight;
		oldContext.drawImage (image, 0, 0, oldWidth, oldHeight);
		var oldData = oldContext.getImageData (0, 0, oldWidth, oldHeight);
		var oldPix = oldData.data;

		var newCanvas = document.createElementNS ('http://www.w3.org/1999/xhtml', 'canvas');
		var newContext = newCanvas.getContext ('2d');
		newCanvas.width = newWidth;
		newCanvas.height = newHeight;
		var newData = newContext.createImageData (newWidth, newHeight);
		var newPix = newData.data;
		var newLength = newPix.length;

/*		var waiting = true;
		var tm = Cc ['@mozilla.org/thread-manager;1'].getService (Ci.nsIThreadManager);
		var bgThread = tm.newThread (0);
		bgThread.dispatch ({
			run: function () {
*/				var rowLength = oldWidth * 4;
				var rowLengthTimes2 = rowLength * 2;
				var row0 = 0;
				var row1 = rowLength;
				var row2 = rowLengthTimes2;
				var r, g, b, nextRow;
				var offset = 0;

				while (offset < newLength) {
					nextRow = row1;
					while (row0 < nextRow) {
						r = g = b = 0;

						r += oldPix [row0++];
						g += oldPix [row0++];
						b += oldPix [row0++];
						row0++;
						r += oldPix [row0++];
						g += oldPix [row0++];
						b += oldPix [row0++];
						row0++;
						r += oldPix [row0++];
						g += oldPix [row0++];
						b += oldPix [row0++];
						row0++;

						r += oldPix [row1++];
						g += oldPix [row1++];
						b += oldPix [row1++];
						row1++;
						r += oldPix [row1++];
						g += oldPix [row1++];
						b += oldPix [row1++];
						row1++;
						r += oldPix [row1++];
						g += oldPix [row1++];
						b += oldPix [row1++];
						row1++;

						r += oldPix [row2++];
						g += oldPix [row2++];
						b += oldPix [row2++];
						row2++;
						r += oldPix [row2++];
						g += oldPix [row2++];
						b += oldPix [row2++];
						row2++;
						r += oldPix [row2++];
						g += oldPix [row2++];
						b += oldPix [row2++];
						row2++;

						newPix [offset++] = r * 0.11111;
						newPix [offset++] = g * 0.11111;
						newPix [offset++] = b * 0.11111;
						newPix [offset++] = 255;
					}
					row0 += rowLengthTimes2;
					row1 += rowLengthTimes2;
					row2 += rowLengthTimes2;
				}
/*				waiting = false;
			}
		}, bgThread.DISPATCH_NORMAL);

		var mainThread = tm.currentThread;
		while (waiting)
			mainThread.processNextEvent (true);
*/
		newContext.putImageData (newData, 0, 0);
		return newCanvas;
	},

	fourResample: function (image, ratio) {
		var newWidth = Math.floor (image.width * ratio + 0.025);
		var newHeight = Math.floor (image.height * ratio + 0.025);
		var oldWidth = newWidth * 2;
		var oldHeight = newHeight * 2;

		image.width = oldWidth;
		image.height = oldHeight;

		var oldCanvas = document.createElementNS ('http://www.w3.org/1999/xhtml', 'canvas');
		var oldContext = oldCanvas.getContext ('2d');
		oldCanvas.width = oldWidth;
		oldCanvas.height = oldHeight;
		oldContext.drawImage (image, 0, 0, oldWidth, oldHeight);
		var oldData = oldContext.getImageData (0, 0, oldWidth, oldHeight);
		var oldPix = oldData.data;

		var newCanvas = document.createElementNS ('http://www.w3.org/1999/xhtml', 'canvas');
		var newContext = newCanvas.getContext ('2d');
		newCanvas.width = newWidth;
		newCanvas.height = newHeight;
		var newData = newContext.createImageData (newWidth, newHeight);
		var newPix = newData.data;
		var newLength = newPix.length;

		var rowLength = oldWidth * 4;
		var row0 = 0;
		var row1 = rowLength;
		var r, g, b, nextRow;
		var offset = 0;

		while (offset < newLength) {
			nextRow = row1;
			while (row0 < nextRow) {
				r = g = b = 0;

				r += oldPix [row0++];
				g += oldPix [row0++];
				b += oldPix [row0++];
				row0++;
				r += oldPix [row0++];
				g += oldPix [row0++];
				b += oldPix [row0++];
				row0++;

				r += oldPix [row1++];
				g += oldPix [row1++];
				b += oldPix [row1++];
				row1++;
				r += oldPix [row1++];
				g += oldPix [row1++];
				b += oldPix [row1++];
				row1++;

				newPix [offset++] = r * 0.25;
				newPix [offset++] = g * 0.25;
				newPix [offset++] = b * 0.25;
				newPix [offset++] = 255;
			}
			row0 += rowLength;
			row1 += rowLength;
		}

		newContext.putImageData (newData, 0, 0);
		return newCanvas;
	},

	floatResample: function (image, ratio) {
		var newWidth = Math.floor (image.width / ratio + 0.025);
		var newHeight = Math.floor (image.height / ratio + 0.025);
		var oldWidth = image.width;
		var oldHeight = image.height;

		var oldCanvas = document.createElementNS ('http://www.w3.org/1999/xhtml', 'canvas');
		var oldContext = oldCanvas.getContext ('2d');
		oldCanvas.width = oldWidth;
		oldCanvas.height = oldHeight;
		oldContext.drawImage (image, 0, 0, oldWidth, oldHeight);
		var oldData = oldContext.getImageData (0, 0, oldWidth, oldHeight);
		var oldPix = oldData.data;

		var newCanvas = document.createElementNS ('http://www.w3.org/1999/xhtml', 'canvas');
		var newContext = newCanvas.getContext ('2d');
		newCanvas.width = newWidth;
		newCanvas.height = newHeight;
		var newData = newContext.createImageData (newWidth, newHeight);
		var newPix = newData.data;

		var y, startY, endY, oldY;
		var x, startX, endX, oldX;
		var r, g, b, count, i, offset;
		var newIndex = 0;

		endY = 0;
		for (y = 1; y <= newHeight; ++y) {
			startY = endY;
			endY = Math.floor (y * ratio);

			endX = 0;
			for (x = 1; x <= newWidth; ++x) {
				startX = endX;
				endX = Math.floor (x * ratio);

				r = 0;
				g = 0;
				b = 0;
				count = (endX - startX) * (endY - startY);
				i = startY * oldWidth;

				for (oldY = startY; oldY < endY; ++oldY) {
					for (oldX = startX; oldX < endX; ++oldX) {
						offset = (i + oldX) * 4;
						r += oldPix [offset++];
						g += oldPix [offset++];
						b += oldPix [offset++];
					}
					i += oldWidth;
				}

				newPix [newIndex++] = r / count;
				newPix [newIndex++] = g / count;
				newPix [newIndex++] = b / count;
				newPix [newIndex++] = 255;
			}
		}
		newContext.putImageData (newData, 0, 0);
		return newCanvas;
	}
};

window.addEventListener ('load', Shrunked.onload, false);
