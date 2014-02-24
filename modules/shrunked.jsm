var EXPORTED_SYMBOLS = ['Shrunked'];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

const ID = 'shrunked@darktrojan.net';
const XHTMLNS = 'http://www.w3.org/1999/xhtml';

Cu.import('resource://gre/modules/FileUtils.jsm');
Cu.import('resource://gre/modules/NetUtil.jsm');
Cu.import('resource://gre/modules/Promise.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

XPCOMUtils.defineLazyGetter(this, 'tempDir', function() {
	return Services.dirsvc.get('TmpD', Ci.nsIFile);
});
var temporaryFiles = [];
var worker = new Worker('resource://shrunked/worker.js');

var Shrunked = {
	fileLargerThanThreshold: function(aPath) {
		var minimum = Shrunked.prefs.getIntPref('fileSizeMinimum') * 1024;

		var file = new FileUtils.File(aPath);
		return file.fileSize >= minimum;
	},
	imageIsJPEG: function(aImage) {
		var request = aImage.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
		return !!request && request.mimeType == 'image/jpeg';
	},
	imageLargerThanThreshold: function(aSrc) {
		var minimum = Shrunked.prefs.getIntPref('fileSizeMinimum') * 1024;
		var minimumData = Math.floor(4 * minimum / 3);

		try {
			var uri = Shrunked.newURI(aSrc);
			if (uri.schemeIs('file')) {
				var file = uri.QueryInterface(Ci.nsIFileURL).file;
				return file.fileSize >= minimum;
			}
			if (uri.schemeIs('data')) {
				var dataTypeLength = aSrc.indexOf(',') + 1;
				if (aSrc.substr(dataTypeLength - 8, 8) == ';base64,') {
					return aSrc.length - dataTypeLength >= minimumData;
				} else {
					return aSrc.length - dataTypeLength >= minimum;
				}
			}
		} catch(e) {
			Cu.reportError(e);
		}
		return false;
	},

	document: null,
	queue: [],
	enqueue: function(document, sourceFile, maxWidth, maxHeight, quality, callback) {
		if (this.busy) {
			this.queue.push([document, sourceFile, maxWidth, maxHeight, quality, callback]);
		} else {
			try {
				this.resizeAsync(document, sourceFile, maxWidth, maxHeight, quality, callback);
			} catch (e) {
				Cu.reportError(e);
				callback(null);
			}
		}
	},
	dequeue: function() {
		if (this.queue.length == 0) {
			return;
		}

		var [document, sourceFile, maxWidth, maxHeight, quality, callback] = this.queue.shift();
		try {
			this.resizeAsync(document, sourceFile, maxWidth, maxHeight, quality, callback);
		} catch (e) {
			Cu.reportError(e);
			callback(null);
		}
	},

	resizeAsync: function(document, sourceFile, maxWidth, maxHeight, quality, callback) {
		this.busy = true;

		var sourceURI;
		var filename = null;
		if (typeof sourceFile == 'string') {
			sourceURI = sourceFile;
			if (/^file:/.test(sourceURI)) {
				sourceFile = Services.io.newURI(sourceFile, null, null).QueryInterface(Ci.nsIFileURL).file;
				filename = sourceFile.leafName;
			} else {
				sourceFile = null;
				var match;
				if (match = /[?&]filename=([\w.-]+)/.exec(sourceURI)) {
					filename = match[1];
				}
			}
		} else if (sourceFile instanceof Ci.nsIFile) {
			sourceURI = Services.io.newFileURI(sourceFile).spec;
			filename = sourceFile.leafName;
		} else {
			Services.console.logStringMessage('Unexpected sourceFile passed to Shrunked.resizeAsync');
			return callback(null);
		}

		this.document = document;
		var image = this.document.createElementNS(XHTMLNS, 'img');
		image.onload = (function() {
			// https://bugzilla.mozilla.org/show_bug.cgi?id=574330#c54
			if (!image.complete) {
				image.src = image.src;
				return;
			}

			var onloadOnReady = (function() {
				Shrunked.resize(image, filename,
					maxWidth, maxHeight, quality, (function(destFile) {
						this.document = null;
						if (callback) {
							callback(destFile);
						}
						this.busy = false;
						this.dequeue();
					}).bind(this));
			}).bind(this);

			Exif.orientation = 0;
			Exif.ready = false;
			if (Shrunked.prefs.getBoolPref('options.exif')) {
				Exif.read(sourceURI, onloadOnReady);
			} else {
				onloadOnReady();
			}
		}).bind(this);
		image.onerror = (function() {
			this.document = null;
			if (callback) {
				callback(null);
			}
			this.busy = false;
			this.dequeue();
		}).bind(this);
		image.src = sourceURI;
	},
	resize: function(image, filename, maxWidth, maxHeight, quality, callback) {
		var destFile;
		try {
			this.createCanvas(image, maxWidth, maxHeight, (function(canvas) {
				if (canvas == image) {
					return callback(null);
				}

				destFile = this.saveCanvas(canvas, filename, quality);
				callback(destFile);
			}).bind(this));
		} catch (e) {
			Cu.reportError(e);
		}
	},
	createCanvas: function(image, maxWidth, maxHeight, callback) {
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
		var ratio = Math.max(1, Math.max(w / maxWidth, h / maxHeight));
		if (ratio <= 1) {
			if (Exif.orientation == 0) {
				callback(image);
			} else {
				callback(this.rotateUnscaled(image));
			}
		} else if (!Shrunked.prefs.getBoolPref('options.resample')) {
			callback(this.resizeUnresampled(image, 1 / ratio));
		} else if (ratio >= 3) {
			this.nineResample(image, 1 / ratio, callback);
		} else if (ratio >= 2) {
			this.fourResample(image, 1 / ratio, callback);
		} else {
			this.floatResample(image, ratio, callback);
		}
	},
	rotateUnscaled: function(image) {
		var canvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var context = canvas.getContext('2d');

		switch (Exif.orientation) {
		case 90:
			canvas.width = image.height;
			canvas.height = image.width;
			context.translate(0, image.width);
			context.rotate(-0.5 * Math.PI);
			break;
		case 180:
			canvas.width = image.width;
			canvas.height = image.height;
			context.translate(image.width, image.height);
			context.rotate(Math.PI);
			break;
		case 270:
			canvas.width = image.height;
			canvas.height = image.width;
			context.translate(image.height, 0);
			context.rotate(0.5 * Math.PI);
			break;
		}
		context.drawImage(image, 0, 0);
		return canvas;
	},
	resizeUnresampled: function(image, ratio) {
		var canvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var context = canvas.getContext('2d');
		canvas.width = Math.floor(image.width * ratio + 0.025);
		canvas.height = Math.floor(image.height * ratio + 0.025);
		context.drawImage(image, 0, 0, image.width * ratio, image.height * ratio);

		return canvas;
	},
	nineResample: function(image, ratio, callback) {
		var newWidth = Math.floor(image.width * ratio + 0.025);
		var newHeight = Math.floor(image.height * ratio + 0.025);
		var oldWidth = newWidth * 3;
		var oldHeight = newHeight * 3;

		var oldCanvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var oldContext = oldCanvas.getContext('2d');

		switch (Exif.orientation) {
		case 0:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.drawImage(image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 90:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate(0, oldWidth);
			oldContext.rotate(-0.5 * Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		case 180:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.translate(oldWidth, oldHeight);
			oldContext.rotate(Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 270:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate(oldHeight, 0);
			oldContext.rotate(0.5 * Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		}

		var oldData = oldContext.getImageData(0, 0, oldCanvas.width, oldCanvas.height);

		var newCanvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var newContext = newCanvas.getContext('2d');
		newCanvas.width = newWidth;
		newCanvas.height = newHeight;
		var newData = newContext.createImageData(newWidth, newHeight);

		worker.onmessage = function(event) {
			newContext.putImageData(event.data, 0, 0);
			callback(newCanvas);
		}
		worker.postMessage({
			oldData: oldData,
			newData: newData,
			func: 'nineResample'
		});
	},
	fourResample: function(image, ratio, callback) {
		var newWidth = Math.floor(image.width * ratio + 0.025);
		var newHeight = Math.floor(image.height * ratio + 0.025);
		var oldWidth = newWidth * 2;
		var oldHeight = newHeight * 2;

		var oldCanvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var oldContext = oldCanvas.getContext('2d');

		switch (Exif.orientation) {
		case 0:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.drawImage(image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 90:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate(0, oldWidth);
			oldContext.rotate(-0.5 * Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		case 180:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.translate(oldWidth, oldHeight);
			oldContext.rotate(Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 270:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate(oldHeight, 0);
			oldContext.rotate(0.5 * Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		}

		var oldData = oldContext.getImageData(0, 0, oldCanvas.width, oldCanvas.height);

		var newCanvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var newContext = newCanvas.getContext('2d');
		newCanvas.width = newWidth;
		newCanvas.height = newHeight;
		var newData = newContext.createImageData(newWidth, newHeight);

		worker.onmessage = function(event) {
			newContext.putImageData(event.data, 0, 0);
			callback(newCanvas);
		}
		worker.postMessage({
			oldData: oldData,
			newData: newData,
			func: 'fourResample'
		});
	},
	floatResample: function(image, ratio, callback) {
		var newWidth = Math.floor(image.width / ratio + 0.025);
		var newHeight = Math.floor(image.height / ratio + 0.025);
		var oldWidth = image.width;
		var oldHeight = image.height;

		var oldCanvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var oldContext = oldCanvas.getContext('2d');

		switch (Exif.orientation) {
		case 0:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.drawImage(image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 90:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate(0, oldWidth);
			oldContext.rotate(-0.5 * Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		case 180:
			oldCanvas.width = oldWidth;
			oldCanvas.height = oldHeight;
			oldContext.translate(oldWidth, oldHeight);
			oldContext.rotate(Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.width, oldCanvas.height);
			break;
		case 270:
			oldCanvas.width = oldHeight;
			oldCanvas.height = oldWidth;
			oldContext.translate(oldHeight, 0);
			oldContext.rotate(0.5 * Math.PI);
			oldContext.drawImage(image, 0, 0, oldCanvas.height, oldCanvas.width);
			var temp = newWidth;
			newWidth = newHeight;
			newHeight = temp;
			oldWidth = oldHeight;
			break;
		}

		var oldData = oldContext.getImageData(0, 0, oldCanvas.width, oldCanvas.height);

		var newCanvas = this.document.createElementNS(XHTMLNS, 'canvas');
		var newContext = newCanvas.getContext('2d');
		newCanvas.width = newWidth;
		newCanvas.height = newHeight;
		var newData = newContext.createImageData(newWidth, newHeight);

		worker.onmessage = function(event) {
			newContext.putImageData(event.data, 0, 0);
			callback(newCanvas);
		}
		worker.postMessage({
			oldData: oldData,
			newData: newData,
			ratio: ratio,
			func: 'floatResample'
		});
	},
	saveCanvas: function(canvas, filename, quality) {
		var destFile = tempDir.clone();
		if (filename) {
			destFile.append(filename);
		} else {
			destFile.append('shrunked-image.jpg');
			destFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);
		}

		var stream = Cc['@mozilla.org/network/safe-file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
		stream.init(destFile, 0x04 | 0x08 | 0x20, 0600, 0); // write, create, truncate
		var bStream = Cc['@mozilla.org/binaryoutputstream;1'].createInstance(Ci.nsIBinaryOutputStream);
		bStream.setOutputStream(stream);

		var source = canvas.toDataURL('image/jpeg', 'quality=' + quality);
		source = source.substring(source.indexOf(',') + 1);
		source = atob(source);

		if (Shrunked.prefs.getBoolPref('options.exif') && Exif.ready) {
			try {
				if ('a002' in Exif.exif2) {
					Exif.exif2['a002'].data = Exif.bytesFromInt(canvas.width);
					Exif.exif2['a003'].data = Exif.bytesFromInt(canvas.height);
				}
				Exif.write();
				bStream.writeByteArray(Exif.wBytes, Exif.wBytes.length);
				var offset = source.charCodeAt(4) * 256 + source.charCodeAt(5) + 4;
				source = source.substring(offset);
			} catch (e) {
				Cu.reportError(e);
			}
		}

		bStream.writeBytes(source, source.length);
		if (stream instanceof Ci.nsISafeOutputStream) {
			stream.finish();
		} else {
			stream.close();
		}

		temporaryFiles.push(destFile);
		Exif.cleanup();

		return destFile;
	},
	newURI: function(uri) {
		return Services.io.newURI(uri, null, null);
	},
	showStartupNotification: function(aNotificationBox, aCallback) {
		function parseVersion(aVersion) {
			let match = /^\d+(\.\d+)?/.exec(aVersion);
			return match ? match[0] : aVersion;
		}

		let currentVersion = 0;
		let oldVersion = 0;

		if (Shrunked.prefs.getPrefType('version') == Ci.nsIPrefBranch.PREF_STRING) {
			oldVersion = Shrunked.prefs.getCharPref('version');
		}
		Cu.import('resource://gre/modules/AddonManager.jsm');
		AddonManager.getAddonByID(ID, function(addon) {
			currentVersion = addon.version;
			Shrunked.prefs.setCharPref('version', currentVersion);

			let comparator = Cc['@mozilla.org/xpcom/version-comparator;1'].createInstance(Ci.nsIVersionComparator);
			if (oldVersion == 0 || comparator.compare(parseVersion(oldVersion), parseVersion(currentVersion)) >= 0) {
				return;
			}

			let strings = Services.strings.createBundle('chrome://shrunked/locale/shrunked.properties');
			let label = strings.formatStringFromName('donate_notification', [currentVersion], 1);
			let value = 'shrunked-donate';
			let buttons = [{
				label: strings.GetStringFromName('donate_button_label'),
				accessKey: strings.GetStringFromName('donate_button_accesskey'),
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
					let property = enumerator.getNext().QueryInterface(Ci.nsIProperty);
					allPrefs.set(property.name, property.value);
				}
				deferred.resolve(allPrefs);
			} catch (e) {
				deferred.reject(e);
			}
		}

		return deferred.promise;
	}
};
XPCOMUtils.defineLazyGetter(Shrunked, 'prefs', function() {
	return Services.prefs.getBranch('extensions.shrunked.');
});
XPCOMUtils.defineLazyGetter(Shrunked, 'contentPrefs2', function() {
	return Services.contentPrefs.QueryInterface(Components.interfaces.nsIContentPrefService2);
});

var Exif = {
	fieldLengths: [null, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8],
	rBaseAddress: 12,

	cleanup: function() {
		delete this.rBytes;
		delete this.wBytes;
	},
	read: function(source, callback) {
		this.rIndex = 0;
		this.rBigEndian = true;
		this.orientation = 0;
		this.wBytes = [];
		this.wIndex = 0;
		this.wDataAddress = 0;

		NetUtil.asyncFetch(source, (function(inputStream, status) {
			if (!Components.isSuccessCode(status)) {
				// abort
				callback();
				return;
			}

			this.rBytes = NetUtil.readInputStreamToString(inputStream, inputStream.available());
			this.readOnReady(callback);
		}).bind(this));
	},
	readOnReady: function(callback) {
		try {
			if (this.read2Bytes() != 0xffd8) {
				Services.console.logStringMessage('File is not a JPEG');
				return;
			}
			var current = this.read2Bytes();
			if (current == 0xffe0) {
				var sectionLength = this.read2Bytes();
				this.rIndex = sectionLength + 2;
				current = this.read2Bytes();
			}
			if (current != 0xffe1) {
				Services.console.logStringMessage('No valid EXIF data');
				return;
			}
			this.rIndex += 8;
			this.rBigEndian = this.read2Bytes() == 0x4d4d;
			this.rIndex += 6;

			var exif1Count = this.read2Bytes();
			var exif1 = this.readSection(exif1Count);

			this.rIndex = this.intFromBytes(exif1['8769'].data) + this.rBaseAddress;
			var exif2Count = this.read2Bytes();
			var exif2 = this.readSection(exif2Count);

			var gps = null;
			if (Shrunked.prefs.getBoolPref('options.gps') && '8825' in exif1) {
				this.rIndex = this.intFromBytes(exif1['8825'].data) + this.rBaseAddress;
				var gpsCount = this.read2Bytes();
				gps = this.readSection(gpsCount);
			}

			if (Shrunked.prefs.getBoolPref('options.orientation') && '112' in exif1) {
				switch (this.shortFromBytes(exif1['112'].data)) {
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

			var blacklist = JSON.parse(Shrunked.prefs.getCharPref('exif.blacklist'));
			blacklist.forEach(function(key) {
				delete exif1[key];
				delete exif2[key];
			});

			this.exif1 = exif1;
			this.exif2 = exif2;
			this.gps = gps;

			this.ready = true;
		} catch (e) {
			Cu.reportError(e);
		} finally {
			callback();
		}
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
			if ('8825' in this.exif1) {
				this.exif1['8825'].data = this.bytesFromInt(gpsAddress);
			}
		} else if ('8825' in this.exif1) {
			delete this.exif1['8825'];
			exif2Address -= 12;
		}

		this.exif1['8769'].data = this.bytesFromInt(exif2Address);

		this.writeSection(this.exif1);
		this.wIndex = this.wDataAddress;
		this.writeSection(this.exif2);
		if (this.gps) {
			this.wIndex = this.wDataAddress;
			this.writeSection(this.gps);
		}

		var length = this.wBytes.length - 4;
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
		};

		if (code == '927c') {
			field.count = 4;
			field.size = 4;
			field.data = '****';
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
			this.write4Bytes(this.wDataAddress - this.rBaseAddress);
			for (var i = 0; i < field.data.length; i++) {
				this.wBytes[this.wDataAddress++] = (field.data.charCodeAt(i));
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
	observe: function(aSubject, aTopic, aData) {
		switch (aTopic) {
			case 'quit-application-granted':
				Services.obs.removeObserver(this, 'last-pb-context-exited');
				Services.obs.removeObserver(this, 'quit-application-granted');
				Services.obs.removeObserver(this, 'browser:purge-session-history');
				// no break
			case 'last-pb-context-exited':
			case 'browser:purge-session-history':
				this.removeTempFiles();
				return;
		}
	},

	removeTempFiles: function() {
		let file = temporaryFiles.pop();
		while (file) {
			if (file.exists()) {
				file.remove(false);
			}
			file = temporaryFiles.pop();
		}
	}
};

Services.obs.addObserver(observer, 'last-pb-context-exited', false);
Services.obs.addObserver(observer, 'quit-application-granted', false);
Services.obs.addObserver(observer, 'browser:purge-session-history', false);
