var EXPORTED_SYMBOLS = ['Shrunked'];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const ID = 'shrunked@darktrojan.net';
const XHTMLNS = 'http://www.w3.org/1999/xhtml';

Cu.import ('resource://gre/modules/Services.jsm');

var tempDir = null;
var prefs = null;

var Shrunked = {
	document: null,
	get prefs () {
		if (!prefs) {
			prefs = Services.prefs.getBranch ('extensions.shrunked.').QueryInterface (Ci.nsIPrefBranch2);
		}
		return prefs;
	},

	queue: [],
	enqueue: function (document, sourceFile, maxWidth, maxHeight, quality, callback) {
		if (this.busy) {
			this.queue.push ([document, sourceFile, maxWidth, maxHeight, quality, callback]);
		} else {
			try {
				this.resizeAsync (document, sourceFile, maxWidth, maxHeight, quality, callback);
			} catch (e) {
				Cu.reportError (e);
			}
		}
	},
	dequeue: function () {
		var args = this.queue.shift ();
		if (args) {
			try {
				this.resizeAsync (args [0], args [1], args [2], args [3], args [4], args [5]);
			} catch (e) {
				Cu.reportError (e);
			}
		}
	},

	resizeAsync: function (document, sourceFile, maxWidth, maxHeight, quality, callback) {
		var self = this;
		this.busy = true;
		var sourceURI;
		if (typeof sourceFile == 'string') {
			sourceURI = sourceFile;
			if (/^data/.test (sourceURI)) {
				sourceFile = null;
			} else {
				sourceFile = Services.io.newURI (sourceFile, null, null).QueryInterface (Ci.nsIFileURL).file;
			}
		} else {
			sourceURI = Services.io.newFileURI (sourceFile).spec;
		}
		this.document = document;
		var image = this.document.createElementNS (XHTMLNS, 'img');
		image.onload = function () {
			// https://bugzilla.mozilla.org/show_bug.cgi?id=574330#c54
			if (!image.complete) {
				image.src = image.src;
				return;
			}

			if (self.prefs.getBoolPref ('options.exif')) {
				Exif.read (!!sourceFile ? sourceFile : sourceURI);
			}

			var destFile = Shrunked.resize (this, sourceFile ? sourceFile.leafName : null, maxWidth, maxHeight, quality);
			self.document = null;
			if (callback) {
				callback (destFile);
			}
			self.busy = false;
			self.dequeue ();
		};
		image.onerror = function () {
			self.document = null;
			if (callback) {
				callback (null);
			}
			self.busy = false;
			self.dequeue ();
		};
		image.src = sourceURI;
	},
	resize: function (image, filename, maxWidth, maxHeight, quality) {
		var destFile;
		try {
			var canvas = this.createCanvas (image, maxWidth, maxHeight);
			if (canvas == image) {
				return null;
			}

			destFile = this.saveCanvas (canvas, filename, quality);
		} catch (e) {
			Cu.reportError (e);
		}
		return destFile;
	},
	createCanvas: function (image, maxWidth, maxHeight) {
		var w, h;
		switch (Exif.orientation) {
		case 0:
		case 180:
			w = image.width;
			h = image.height;
			break;
		case 90:
		case 270:
			w = image.height;
			h = image.width;
			break;
		}
		var ratio = Math.max (1, Math.max (w / maxWidth, h / maxHeight));
		if (ratio <= 1) {
			if (Exif.orientation == 0) {
				return image;
			}
			return this.rotateUnscaled (image);
		}
		if (!this.prefs.getBoolPref ('options.resample')) {
			return this.resizeUnresampled (image, 1 / ratio);
		}
		if (ratio >= 3) {
			return this.nineResample (image, 1 / ratio);
		}
		if (ratio >= 2) {
			return this.fourResample (image, 1 / ratio);
		}
		return this.floatResample (image, ratio);
	},
	rotateUnscaled: function (image) {
		var canvas = this.document.createElementNS (XHTMLNS, 'canvas');
		var context = canvas.getContext ('2d');

		switch (Exif.orientation) {
		case 90:
			canvas.width = image.height;
			canvas.height = image.width;
			context.translate (0, image.width);
			context.rotate (-0.5 * Math.PI);
			break;
		case 180:
			canvas.width = image.width;
			canvas.height = image.height;
			context.translate (image.width, image.height);
			context.rotate (Math.PI);
			break;
		case 270:
			canvas.width = image.height;
			canvas.height = image.width;
			context.translate (image.height, 0);
			context.rotate (0.5 * Math.PI);
			break;
		}
		context.drawImage (image, 0, 0);
		return canvas;
	},
	resizeUnresampled: function (image, ratio) {
		var canvas = this.document.createElementNS (XHTMLNS, 'canvas');
		var context = canvas.getContext ('2d');
		canvas.width = Math.floor (image.width * ratio + 0.025);
		canvas.height = Math.floor (image.height * ratio + 0.025);
		context.drawImage (image, 0, 0, image.width * ratio, image.height * ratio);

		return canvas;
	},
	nineResample: function (image, ratio) {
		var newWidth = Math.floor (image.width * ratio + 0.025);
		var newHeight = Math.floor (image.height * ratio + 0.025);
		var oldWidth = newWidth * 3;
		var oldHeight = newHeight * 3;

		var oldCanvas = this.document.createElementNS (XHTMLNS, 'canvas');
		var oldContext = oldCanvas.getContext ('2d');

		switch (Exif.orientation) {
		case 0:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.drawImage (image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 90:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate (0, oldWidth);
			oldContext.rotate (-0.5 * Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		case 180:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.translate (oldWidth, oldHeight);
			oldContext.rotate (Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 270:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate (oldHeight, 0);
			oldContext.rotate (0.5 * Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		}

		var oldData = oldContext.getImageData (0, 0, oldCanvas.width, oldCanvas.height);
		var oldPix = oldData.data;

		var newCanvas = this.document.createElementNS (XHTMLNS, 'canvas');
		var newContext = newCanvas.getContext ('2d');
		newCanvas.width = newWidth;
		newCanvas.height = newHeight;
		var newData = newContext.createImageData (newWidth, newHeight);
		var newPix = newData.data;
		var newLength = newPix.length;

		var rowLength = oldWidth * 4;
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

		newContext.putImageData (newData, 0, 0);
		return newCanvas;
	},
	fourResample: function (image, ratio) {
		var newWidth = Math.floor (image.width * ratio + 0.025);
		var newHeight = Math.floor (image.height * ratio + 0.025);
		var oldWidth = newWidth * 2;
		var oldHeight = newHeight * 2;

		var oldCanvas = this.document.createElementNS (XHTMLNS, 'canvas');
		var oldContext = oldCanvas.getContext ('2d');

		switch (Exif.orientation) {
		case 0:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.drawImage (image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 90:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate (0, oldWidth);
			oldContext.rotate (-0.5 * Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		case 180:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.translate (oldWidth, oldHeight);
			oldContext.rotate (Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 270:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate (oldHeight, 0);
			oldContext.rotate (0.5 * Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		}

		var oldData = oldContext.getImageData (0, 0, oldCanvas.width, oldCanvas.height);
		var oldPix = oldData.data;

		var newCanvas = this.document.createElementNS (XHTMLNS, 'canvas');
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

		var oldCanvas = this.document.createElementNS (XHTMLNS, 'canvas');
		var oldContext = oldCanvas.getContext ('2d');

		switch (Exif.orientation) {
		case 0:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.drawImage (image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 90:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate (0, oldWidth);
			oldContext.rotate (-0.5 * Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		case 180:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.translate (oldWidth, oldHeight);
			oldContext.rotate (Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 270:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate (oldHeight, 0);
			oldContext.rotate (0.5 * Math.PI);
			oldContext.drawImage (image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		}

		var oldData = oldContext.getImageData (0, 0, oldCanvas.width, oldCanvas.height);
		var oldPix = oldData.data;

		var newCanvas = this.document.createElementNS (XHTMLNS, 'canvas');
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

				r = g = b = 0;
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
	},
	saveCanvas: function (canvas, filename, quality) {
		if (!tempDir) {
			tempDir = Services.dirsvc.get ('TmpD', Ci.nsIFile);
		}
		var destFile = tempDir.clone ();
		if (filename) {
			destFile.append (filename);
		} else {
			destFile.append ('shrunked-image.jpg');
			destFile.createUnique (Ci.nsIFile.NORMAL_FILE_TYPE, 0600);
		}

		var stream = Cc ["@mozilla.org/network/safe-file-output-stream;1"].createInstance (Ci.nsIFileOutputStream);
		stream.init (destFile, 0x04 | 0x08 | 0x20, 0600, 0); // write, create, truncate
		var bStream = Cc ["@mozilla.org/binaryoutputstream;1"].createInstance (Ci.nsIBinaryOutputStream);
		bStream.setOutputStream (stream);

		var source = canvas.toDataURL ('image/jpeg', 'quality=' + quality);
		source = source.substring (source.indexOf (',') + 1);
		source = atob (source);

		if (this.prefs.getBoolPref ('options.exif')) {
			try {
				if (Exif.block1) {
					if ('a002' in Exif.block2) {
						Exif.block2 ['a002'].value = canvas.width;
						Exif.block2 ['a003'].value = canvas.height;
					}
					Exif.serialize ();
					bStream.writeByteArray (Exif.sBytes, Exif.sBytes.length);
					var offset = source.charCodeAt (4) * 256 + source.charCodeAt (5) + 4;
					source = source.substring (offset);
				}
			} catch (e) {
				Cu.reportError (e);
			}
		}

		bStream.writeBytes (source, source.length);
		if (stream instanceof Ci.nsISafeOutputStream) {
			stream.finish ();
		} else {
			stream.close ();
		}

		return destFile;
	},
	newURI: function (uri) {
		return Services.io.newURI (uri, null, null);
	},
	showDonateNotification: function (notifyBox, callback) {
		let currentVersion = 0;
		let oldVersion = 0;

		// prefs is defined after the first call to this.prefs
		if (this.prefs.getPrefType ('version') == Ci.nsIPrefBranch.PREF_STRING) {
			oldVersion = prefs.getCharPref ('version');
		}
		if ('@mozilla.org/extensions/manager;1' in Cc) {
			currentVersion = Cc ['@mozilla.org/extensions/manager;1']
					.getService (Ci.nsIExtensionManager).getItemForID (ID).version;
			prefs.setCharPref ('version', currentVersion);
			doShow ();
		} else {
			Cu.import ('resource://gre/modules/AddonManager.jsm');
			AddonManager.getAddonByID (ID, function (addon) {
				currentVersion = addon.version;
				prefs.setCharPref ('version', currentVersion);
				doShow ();
			});
		}

		function doShow () {
			if (oldVersion == 0 || parseFloat (oldVersion) >= parseFloat (currentVersion)) {
				return;
			}

			if (Cc ['@mozilla.org/chrome/chrome-registry;1']
					.getService (Ci.nsIXULChromeRegistry).getSelectedLocale ('shrunked') != 'en-US') {
				return;
			}

			let label = 'Shrunked Image Resizer has been updated to version ' + currentVersion +'. ' +
					'This update was made possible by donations.'
			let value = 'shrunked-donate';
			let buttons = [{
				label: 'Donate',
				accessKey: 'D',
				popup: null,
				callback: callback
			}];
			prefs.setIntPref ('donationreminder', Date.now () / 1000);
			notifyBox.appendNotification (label, value,
					'chrome://shrunked/content/shrunked.png', notifyBox.PRIORITY_INFO_LOW, buttons);
		}
	}
};

var Exif = {

	bigEndian: null,
	rIndex: 0,
	rBytes: null,
	sBytes: null,
	block1: null,
	block2: null,
	orientation: 0,

	read: function (sourceFile) {
		this.block1 = null;
		this.orientation = 0;

		try {
			var istream, bstream;
			if (sourceFile instanceof Ci.nsIFile) {
				istream = Cc ["@mozilla.org/network/file-input-stream;1"].createInstance (Ci.nsIFileInputStream);
				istream.init (sourceFile, -1, -1, false);
				bstream = Cc ["@mozilla.org/binaryinputstream;1"].createInstance (Ci.nsIBinaryInputStream);
				bstream.setInputStream (istream);
			} else if (sourceFile.constructor.name == "String" && /^data:image\/jpeg;base64,/.test (sourceFile)) {
				bstream = {
					data: atob (sourceFile.substring (23)),
					pointer: 0,
					readBytes: function (count) {
						var bytes = this.data.substring (this.pointer, count);
						this.pointer += count;
						return bytes;
					},
					close: function () {
					}
				};
			} else {
				throw "Unexpected type";
			}

			this.rBytes = bstream.readBytes (4);
			if (this.rBytes.charCodeAt (2) == 0xff && this.rBytes.charCodeAt (3) == 0xe0) {
				// JFIF header, try next block
				this.rBytes = bstream.readBytes (2);
				var sectionSize = this.rBytes.charCodeAt (0) * 0x0100 + this.rBytes.charCodeAt (1);
				bstream.readBytes (sectionSize - 4); // we do it this way so that we
				this.rBytes = bstream.readBytes (4); // still have 4 bytes for the next if
			}
			if (this.rBytes.charCodeAt (2) != 0xff || this.rBytes.charCodeAt (3) != 0xe1) {
				// not an EXIF header
				return;
			}
			this.rBytes = bstream.readBytes (10);
			var sectionSize = this.rBytes.charCodeAt (0) * 0x0100 + this.rBytes.charCodeAt (1);
			this.bigEndian = this.rBytes.charCodeAt (8) == 0x4d;
			this.rBytes = bstream.readBytes (sectionSize);

			this.rIndex = 6;
			this.block1 = this.readSection ();

			if (this.block1 ['112']) {
				switch (this.block1 ['112'].value) {
				case 8:
					this.orientation = 90;
					break;
				case 3:
					this.orientation = 180;
					break;
				case 6:
					this.orientation = 270;
					break;
				}
			}

			if ('112' in this.block1) {
				delete this.block1 ['112'];
				this.block1.length--;
			}
			if ('11a' in this.block1) {
				delete this.block1 ['11a'];
				this.block1.length--;
			}
			if ('11b' in this.block1) {
				delete this.block1 ['11b'];
				this.block1.length--;
			}
			if ('128' in this.block1) {
				delete this.block1 ['128'];
				this.block1.length--;
			}
			if ('213' in this.block1) {
				delete this.block1 ['213'];
				this.block1.length--;
			}

			this.rIndex = this.block1 ['8769'].value - 2;
			this.block2 = this.readSection ();
			
			if ('a210' in this.block2) {
				this.block2 ['a210'].value = 1;
			}
		} catch (e) {
			Cu.reportError (e);
			this.block1 = null;
			this.orientation = 0;
		} finally {
			this.rBytes = null;
			this.rIndex = 0;
			bstream.close ();
			if (istream) {
				istream.close ();
			}
		}
	},

	read2Bytes: function () {
		if (this.bigEndian) {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt (this.rIndex++);
		} else {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) +
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100;
		}
		return s;
	},

	read4Bytes: function () {
		if (this.bigEndian) {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) * 0x01000000 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x010000 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt (this.rIndex++);
		} else {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) +
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x010000 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x01000000;
		}
		return s;
	},

	readSection: function () {
		var itemCount = this.read2Bytes ();
		var data = {
			length: itemCount
		};
		for (var i = 0; i < itemCount; i++) {
			var code = this.read2Bytes ().toString (16);
			var type = this.read2Bytes ();
			var count = this.read4Bytes ();
			var value = this.read4Bytes ();
			data [code] = {
				type: type,
				count: count,
				value: value
			}
			switch (type) {
			case 2:
				var str = this.rBytes.substring (value - 2, value + count - 3);
				data [code].str = str;
				break;
			case 5:
			case 10:
			case 12:
				var str = this.rBytes.substring (value - 2, value + 6);
				data [code].str = str;
				break;
			}
		}
		return data;
	},

	serialize2Bytes: function (s, forceBigEndian) {
		var bE = this.bigEndian;
		if (typeof forceBigEndian == 'boolean') {
			bE = forceBigEndian;
		}
		if (bE) {
			this.sBytes.push ((s & 0xff00) >> 8);
			this.sBytes.push (s & 0x00ff);
		} else {
			this.sBytes.push (s & 0x00ff);
			this.sBytes.push ((s & 0xff00) >> 8);
		}
	},

	serialize4Bytes: function (s) {
		if (this.bigEndian) {
			this.sBytes.push ((s & 0xff000000) >> 24);
			this.sBytes.push ((s & 0x00ff0000) >> 16);
			this.sBytes.push ((s & 0x0000ff00) >> 8);
			this.sBytes.push (s & 0x000000ff);
		} else {
			this.sBytes.push (s & 0x000000ff);
			this.sBytes.push ((s & 0x0000ff00) >> 8);
			this.sBytes.push ((s & 0x00ff0000) >> 16);
			this.sBytes.push ((s & 0xff000000) >> 24);
		}
	},

	serializeAscii: function (s) {
		for (var i = 0; i < s.length; i++) {
			this.sBytes.push (s.charCodeAt (i));
		}
	},

	serialize: function () {
		this.sBytes = [];

		try {
			this.serialize2Bytes (0xFFD8, true); // SOI marker
			this.serialize2Bytes (0xFFE1, true); // APP1 marker
			this.serialize2Bytes (0x0000, true); // APP1 size FIXME
			this.serializeAscii ('Exif'); // Exif
			this.serialize2Bytes (0x0000, true);
			if (this.bigEndian) {
				this.serializeAscii ('MM');
			} else {
				this.serializeAscii ('II');
			}
			this.serialize2Bytes (0x2A);
			this.serialize4Bytes (0x08);

			var extraData = '';
			var extraDataCounter = this.block1.length * 12 + 14;

			this.serialize2Bytes (this.block1.length);
			for (var e in this.block1) {
				if (e == 'length') continue;

				this.serialize2Bytes (parseInt (e, 16));
				this.serialize2Bytes (this.block1 [e].type);
				this.serialize4Bytes (this.block1 [e].count);
				if (this.block1 [e].type == 2) {
					this.serialize4Bytes (extraDataCounter);
					extraData += this.block1 [e].str + '\0';
					extraDataCounter += this.block1 [e].count;
				} else if (e == '8769') {
					this.serialize4Bytes (extraDataCounter);
				} else {
					this.serialize4Bytes (this.block1 [e].value);
				}
			}
			this.serialize4Bytes (0);
			this.serializeAscii (extraData);

			extraData = '';
			extraDataCounter += this.block2.length * 12 + 6;

			this.serialize2Bytes (this.block2.length);
			for (var e in this.block2) {
				if (e == 'length') continue;

				this.serialize2Bytes (parseInt (e, 16));
				this.serialize2Bytes (this.block2 [e].type);
				this.serialize4Bytes (this.block2 [e].count);
				switch (this.block2 [e].type) {
				case 2:
					this.serialize4Bytes (extraDataCounter);
					extraData += this.block2 [e].str + '\0';
					extraDataCounter += this.block2 [e].count;
					break;
				case 5:
				case 10:
				case 12:
					this.serialize4Bytes (extraDataCounter);
					extraData += this.block2 [e].str;
					extraDataCounter += 8;
					break;
				default:
					this.serialize4Bytes (this.block2 [e].value);
					break;
				}
			}
			this.serialize4Bytes (0);
			this.serializeAscii (extraData);

			var length = this.sBytes.length - 4;
			this.sBytes [4] = (length & 0xff00) >> 8;
			this.sBytes [5] = length & 0x00ff;
		} catch (e) {
			Cu.reportError (e);
		}
	}
};
