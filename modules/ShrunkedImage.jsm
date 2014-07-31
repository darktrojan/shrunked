let EXPORTED_SYMBOLS = ['ShrunkedImage'];

Components.utils.import('resource://gre/modules/NetUtil.jsm');
Components.utils.import('resource://gre/modules/Promise.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/Task.jsm');
Components.utils.import('resource://gre/modules/osfile.jsm');

Components.utils.import('resource://shrunked/ExifData.jsm');

const XHTMLNS = 'http://www.w3.org/1999/xhtml';

function ShrunkedImage(source, maxWidth, maxHeight, quality) {
	this.maxWidth = maxWidth;
	this.maxHeight = maxHeight;
	this.quality = quality;

	if (typeof source == 'string') {
		try {
			this.sourceURI = Services.io.newURI(source, null, null);
			if (this.sourceURI.schemeIs('file')) {
				let file = this.sourceURI.QueryInterface(Components.interfaces.nsIFileURL).file;
				this.path = file.path;
				this.basename = file.leafName;
			} else {
				let match;
				if (match = /[?&]filename=([\w.-]+)/.exec(this.sourceURI.spec)) {
					this.basename = match[1];
				} else if (match = /\/([\w.-]+\.jpg)$/i.exec(this.sourceURI.spec)) {
					this.basename = match[1];
				}
			}
		} catch (ex) {
			Components.utils.reportError(ex);
		}
	} else if (source instanceof Components.interfaces.nsIFile) {
		this.sourceURI = Services.io.newFileURI(source);
		this.path = source.path;
		this.basename = source.leafName;
	}
}
ShrunkedImage.prototype = {
	doEverything: function ShrunkedImage_doEverything() {
		Task.spawn((function() {
			// if (exif enabled) {
				try {
					let readable;
					if (this.sourceURI.schemeIs('file')) {
						readable = yield OS.File.open(this.path, { read: true });
					} else {
						readable = yield Readable(this.sourceURI.spec);
					}

					this.exifData = new ExifData();
					yield this.exifData.read(readable);
				} catch (ex) {
					Components.utils.reportError(ex);
					delete this.exifData;
				}
			// }
			try {
				let image = yield this.loadImage();
				let canvas = this.drawOnCanvas(image);
				let bytes = yield this.getBytes(canvas);
				this.save(bytes);
			} catch (ex) {
				Components.utils.reportError(ex);
			}
		}).bind(this));
	},

	loadImage: function ShrunkedImage_load() {
		let deferred = Promise.defer();

		let image = getWindow().document.createElementNS(XHTMLNS, 'img');
		image.onload = function() {
			// https://bugzilla.mozilla.org/show_bug.cgi?id=574330#c54
			if (!image.complete) {
				image.src = image.src;
				return;
			}
			deferred.resolve(image);
		};
		image.onerror = deferred.reject;
		image.src = this.sourceURI.spec;

		return deferred.promise;
	},

	drawOnCanvas: function ShrunkedImage_drawOnCanvas(image) {
		let ratio = Math.min(1, this.maxWidth / image.width, this.maxHeight / image.height);

		let canvas = getWindow().document.createElementNS(XHTMLNS, 'canvas');
		canvas.width = Math.floor(image.width * ratio);
		canvas.height = Math.floor(image.height * ratio);

		let context = canvas.getContext('2d');
		context.drawImage(image, 0, 0, image.width * ratio, image.height * ratio);

		return canvas;
	},

	getBytes: function ShrunkedImage_getBytes(canvas) {
		let deferred = Promise.defer();
		canvas.toBlob(function(blob) {
			try {
				let reader = getFileReader();
				reader.onloadend = function () {
					deferred.resolve(new Uint8Array(reader.result));
				};
				reader.readAsArrayBuffer(blob);
			} catch (ex) {
				deferred.reject(ex);
			}
		}, 'image/jpeg', 'quality=' + this.quality);
		return deferred.promise;
	},

	save: function ShrunkedImage_save(bytes) {
		let destFile;
		let tempDir = OS.Constants.Path.tmpDir;
		if (this.basename) {
			destFile = OS.Path.join(tempDir, this.basename);
		} else {
			destFile = OS.Path.join(tempDir, 'shrunked-image.jpg');
		}

		let deferred = Promise.defer();
		Task.spawn((function() {
			let output = yield OS.File.openUnique(destFile);
			let { path: outputPath, file: outputFile } = output;
			try {
				if (this.exifData) {
					yield this.exifData.write(outputFile);
					let offset = (bytes[4] << 8) + bytes[5] + 4;
					yield outputFile.write(bytes.subarray(offset));
				} else {
					yield outputFile.write(bytes);
				}
				deferred.resolve(outputPath);
			} catch (ex) {
				deferred.reject(ex);
			} finally {
				outputFile.close();
			}
		}).bind(this));
		return deferred.promise;
	}
};

function Readable(url) {
	let deferred = Promise.defer();
	NetUtil.asyncFetch(url, function(stream) {
		try {
			let binaryStream = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
			binaryStream.setInputStream(stream);
			let bytes = binaryStream.readByteArray(stream.available());
			binaryStream.close();
			stream.close();
			let data = new Uint8Array(bytes);

			let readable = {
				data: data,
				pointer: 0,
				read: function(count) {
					let result;
					if (count) {
						result = this.data.subarray(this.pointer, this.pointer + count);
						this.pointer += count;
					} else {
						result = this.data.subarray(this.pointer);
						this.pointer = this.data.length;
					}
					return result;
				},
				setPosition: function(position) {
					this.pointer = position;
				},
				close: function() {
					delete this.data;
				}
			};
			deferred.resolve(readable);
		} catch (ex) {
			deferred.reject(ex);
		}
	});
	return deferred.promise;
}

function getWindow() {
	return Services.wm.getMostRecentWindow('mail:3pane') || Services.wm.getMostRecentWindow('navigator:browser');
}

function getFileReader() {
	let FileReader = getWindow().FileReader;
	return new FileReader();
}
