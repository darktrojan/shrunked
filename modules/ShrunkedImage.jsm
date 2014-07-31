let EXPORTED_SYMBOLS = ['ShrunkedImage'];

Components.utils.import('resource://gre/modules/NetUtil.jsm');
Components.utils.import('resource://gre/modules/Promise.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/Task.jsm');
Components.utils.import('resource://gre/modules/osfile.jsm');

Components.utils.import('resource://shrunked/ExifData.jsm');

const XHTMLNS = 'http://www.w3.org/1999/xhtml';

let worker = new Worker('resource://shrunked/worker.js');

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
		let deferred = Promise.defer();

		Task.spawn((function() {
			try {
				// if (exif enabled) {
					yield this.readExifData();
				// }
				let image = yield this.loadImage();
				let canvas = yield this.drawOnCanvas(image);
				let bytes = yield this.getBytes(canvas);
				let newPath = yield this.save(bytes);

				deferred.resolve(newPath);
			} catch (ex) {
				Components.utils.reportError(ex);
				deferred.reject(ex);
			}
		}).bind(this));

		return deferred.promise;
	},

	readExifData: function ShrunkedImage_readExifData() {
		let deferred = Promise.defer();

		Task.spawn((function() {
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
			deferred.resolve();
		}).bind(this));

		return deferred.promise;
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
		let deferred = Promise.defer();
		let ratio = Math.max(1, image.width / this.maxWidth, image.height / this.maxHeight);
		let resampleRatio = Math.min(ratio, 3);
		if (resampleRatio > 2 && resampleRatio < 3) {
			resampleRatio = 2;
		}

		let width = image.width / ratio;
		let height = image.height / ratio;

		let canvas = getWindow().document.createElementNS(XHTMLNS, 'canvas');
		canvas.width = Math.floor(width * resampleRatio);
		canvas.height = Math.floor(height * resampleRatio);

		let context = canvas.getContext('2d');
		context.drawImage(image, 0, 0, width * resampleRatio, height * resampleRatio);

		if (resampleRatio > 1) {
			let oldData = context.getImageData(0, 0, canvas.width, canvas.height);
			canvas.width = Math.floor(width);
			canvas.height = Math.floor(height);
			let newData = context.createImageData(canvas.width, canvas.height);

			worker.onmessage = function(event) {
				context.putImageData(event.data, 0, 0);
				deferred.resolve(canvas);
			};
			worker.postMessage({
				oldData: oldData,
				newData: newData,
				func: (resampleRatio == 3 ? 'nineResample' : (resampleRatio == 2 ? 'fourResample' : 'floatResample')),
				ratio: resampleRatio // only for floatResample
			});
		} else {
			deferred.resolve(canvas);
		}

		return deferred.promise;
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
