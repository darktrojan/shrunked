var EXPORTED_SYMBOLS = ['Shrunked'];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const ID = 'shrunked@darktrojan.net';
const XHTMLNS = 'http://www.w3.org/1999/xhtml';

Cu.import ('resource://gre/modules/Services.jsm');

var tempDir = null;
var prefs = null;
var temporaryFiles = [];

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

			Exif.orientation = 0;
			Exif.ready = false;
			if (self.prefs.getBoolPref ('options.exif')) {
				try {
					Exif.read (!!sourceFile ? sourceFile : sourceURI);
					Exif.ready = true;
				} catch (e) {
					Cu.reportError(e);
				}
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

		if (this.prefs.getBoolPref ('options.exif') && Exif.ready) {
			try {
				if ('a002' in Exif.exif2) {
					Exif.exif2 ['a002'].data = Exif.bytesFromInt(canvas.width);
					Exif.exif2 ['a003'].data = Exif.bytesFromInt(canvas.height);
				}
				Exif.write ();
				bStream.writeByteArray (Exif.wBytes, Exif.wBytes.length);
				var offset = source.charCodeAt (4) * 256 + source.charCodeAt (5) + 4;
				source = source.substring (offset);
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

		temporaryFiles.push (destFile);

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
	fieldLengths: [null, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8],
	rBaseAddress: 12,

	read: function(source) {
		this.rIndex = 0;
		this.rBigEndian = true;
		this.orientation = 0;
		this.wBytes = [];
		this.wIndex = 0;
		this.wDataAddress = 0;

		if (source instanceof Ci.nsIFile) {
			istream = Cc ["@mozilla.org/network/file-input-stream;1"].createInstance (Ci.nsIFileInputStream);
			istream.init (source, -1, -1, false);
			bstream = Cc ["@mozilla.org/binaryinputstream;1"].createInstance (Ci.nsIBinaryInputStream);
			bstream.setInputStream (istream);
			this.rBytes = bstream.readBytes(bstream.available());
			bstream.close ();
			istream.close ();
		} else if (source.constructor.name == "String" && /^data:image\/jpeg;base64,/.test (source)) {
			this.rBytes = atob(source.substring(23));
		} else {
			throw "not a file";
		}

		if (this.read2Bytes() != 0xffd8) {
			throw "not a jpeg";
		}
		var current = this.read2Bytes();
		if (current == 0xffe0) {
			var sectionLength = this.read2Bytes();
			this.rIndex = sectionLength + 2;
			current = this.read2Bytes();
		}
		if (current != 0xffe1) {
			throw "no valid exif data";
		}
		this.rIndex += 8;
		this.rBigEndian = this.read2Bytes() == 0x4d4d;
		this.rIndex += 6;

		var exif1Count = this.read2Bytes();
		var exif1 = this.readSection(exif1Count)

		this.rIndex = this.intFromBytes(exif1["8769"].data) + this.rBaseAddress;
		var exif2Count = this.read2Bytes();
		var exif2 = this.readSection(exif2Count);

		var gps = null;
		if (Shrunked.prefs.getBoolPref("options.gps") && "8825" in exif1) {
			this.rIndex = this.intFromBytes(exif1["8825"].data) + this.rBaseAddress;
			var gpsCount = this.read2Bytes();
			gps = this.readSection(gpsCount);
		}

		if ("112" in exif1) {
			switch (this.shortFromBytes(exif1["112"].data)) {
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

		var blacklist = JSON.parse(Shrunked.prefs.getCharPref("exif.blacklist"));
		blacklist.forEach(function(key) {
			delete exif1[key];
			delete exif2[key];
		});

		this.exif1 = exif1;
		this.exif2 = exif2;
		this.gps = gps;
	},
	write: function() {
		this.write2Bytes(0xD8FF); // SOI marker, big endian
		this.write2Bytes(0xE1FF); // APP1 marker, big endian
		this.write2Bytes(0x0000); // APP1 size, corrected later
		this.write4Bytes(0x66697845); // Exif, big endian
		this.write2Bytes(0x0000);
		this.write2Bytes(0x4949);
		this.write2Bytes(0x002A);
		this.write4Bytes(0x00000008);

		var exif1Address = this.wIndex - this.rBaseAddress;
		var exif2Address = exif1Address + this.getSectionSize(this.exif1);

		if (this.gps) {
			var gpsAddress = exif2Address + this.getSectionSize(this.exif2);
			if ("8825" in this.exif1) {
				this.exif1["8825"].data = this.bytesFromInt(gpsAddress);
			}
		} else if ("8825" in this.exif1){
			delete this.exif1["8825"];
			exif2Address -= 12;
		}

		this.exif1["8769"].data = this.bytesFromInt(exif2Address);

		this.writeSection(this.exif1);
		this.wIndex = this.wDataAddress;
		this.writeSection(this.exif2);
		if (this.gps) {
			this.wIndex = this.wDataAddress;
			this.writeSection(this.gps);
		}

		var length = this.wDataAddress - 4;
		this.wBytes[4] = (length & 0xff00) >> 8;
		this.wBytes[5] = length & 0x00ff;
	},
	shortFromBytes: function(bytes) {
		if (this.rBigEndian) {
			return bytes.charCodeAt(0) * 0x0100 +
				bytes.charCodeAt(1);
		} else {
			return bytes.charCodeAt(0) +
				bytes.charCodeAt(1) * 0x0100;
		}
	},
	intFromBytes: function(bytes) {
		if (this.rBigEndian) {
			return bytes.charCodeAt(0) * 0x01000000 +
				bytes.charCodeAt(1) * 0x010000 +
				bytes.charCodeAt(2) * 0x0100 +
				bytes.charCodeAt(3);
		} else {
			return bytes.charCodeAt(0) +
				bytes.charCodeAt(1) * 0x0100 +
				bytes.charCodeAt(2) * 0x010000 +
				bytes.charCodeAt(3) * 0x01000000;
		}
	},
	bytesFromInt: function(aInt) {
		return String.fromCharCode(aInt & 0x000000ff, (aInt & 0x0000ff00) >> 8, (aInt & 0x00ff0000) >> 16, (aInt & 0xff000000) >> 24);
	},
	read2Bytes: function() {
		if (this.rBigEndian) {
			return this.rBytes.charCodeAt(this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt(this.rIndex++);
		} else {
			return this.rBytes.charCodeAt(this.rIndex++) +
				this.rBytes.charCodeAt(this.rIndex++) * 0x0100;
		}
	},
	read4Bytes: function() {
		if (this.rBigEndian) {
			return this.rBytes.charCodeAt(this.rIndex++) * 0x01000000 +
				this.rBytes.charCodeAt(this.rIndex++) * 0x010000 +
				this.rBytes.charCodeAt(this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt(this.rIndex++);
		} else {
			return this.rBytes.charCodeAt(this.rIndex++) +
				this.rBytes.charCodeAt(this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt(this.rIndex++) * 0x010000 +
				this.rBytes.charCodeAt(this.rIndex++) * 0x01000000;
		}
	},
	readField: function() {
		var code = this.read2Bytes().toString(16);
		var type = this.read2Bytes();
		var count = this.read4Bytes();
		var value = this.read4Bytes();
		var size = count * this.fieldLengths[type];

		var field = {
			code: code,
			type: type,
			count: count,
			size: size
		}

		if (code == "927c") {
			field.count = 4;
			field.size = 4;
			field.data = "****";
			return field;
		}

		if (size <= 4) {
			field.data = this.rBytes.substr(this.rIndex - 4, size);
		} else {
			field.data = this.rBytes.substr(value + this.rBaseAddress, size);
		}
		return field;
	},
	readSection: function(count) {
		var section = {};
		for (var i = 0; i < count; i++) {
			var field = this.readField();
			section[field.code] = field;
		}
		return section;
	},
	getSectionSize: function(data) {
		var size = 6;
		for (var e in data) {
			size += 12;
			if (data[e].size > 4) {
				size += data[e].size;
			}
		}
		return size;
	},
	write2Bytes: function(s) {
		this.wBytes[this.wIndex++] = (s & 0x00ff);
		this.wBytes[this.wIndex++] = ((s & 0xff00) >> 8);
	},
	write4Bytes: function(s) {
		this.wBytes[this.wIndex++] = (s & 0x000000ff);
		this.wBytes[this.wIndex++] = ((s & 0x0000ff00) >> 8);
		this.wBytes[this.wIndex++] = ((s & 0x00ff0000) >> 16);
		this.wBytes[this.wIndex++] = ((s & 0xff000000) >> 24);
	},
	writeField: function(field) {
		this.write2Bytes(parseInt(field.code, 16));
		this.write2Bytes(field.type);
		this.write4Bytes(field.count);
		if (field.size <= 4) {
			for (var i = 0; i < 4; i++) {
				this.wBytes[this.wIndex++] = (field.data.charCodeAt(i) || 0);
			}
		} else {
			var start = this.wDataAddress;
			this.write4Bytes(start - 12);
			this.wDataAddress += field.size;
			for (var i = 0; i < field.data.length; i++) {
				this.wBytes[start++] = (field.data.charCodeAt(i));
			}
		}
	},
	writeSection: function(data) {
		var count = 0;
		this.wDataAddress = this.wIndex + 6;
		for (var e in data) {
			count++;
			this.wDataAddress += 12;
		}

		this.write2Bytes(count);
		for (var e in data) {
			this.writeField(data[e]);
		}
	}
};

var observer = {
	observe: function (aSubject, aTopic, aData) {
		switch (aTopic) {
			case "private-browsing":
				if (aData == "exit")
					this.removeTempFiles ();
				return;
			case "quit-application-granted":
				Services.obs.removeObserver (this, "private-browsing");
				Services.obs.removeObserver (this, "quit-application-granted");
				Services.obs.removeObserver (this, "browser:purge-session-history");
				// no break
			case "browser:purge-session-history":
				this.removeTempFiles ();
				return;
		}
	},

	removeTempFiles: function () {
		let file = temporaryFiles.pop ();
		while (file) {
			if (file.exists ()) {
				file.remove (false);
			}
			file = temporaryFiles.pop ();
		}
	}
}

Services.obs.addObserver (observer, "private-browsing", false);
Services.obs.addObserver (observer, "quit-application-granted", false);
Services.obs.addObserver (observer, "browser:purge-session-history", false);
