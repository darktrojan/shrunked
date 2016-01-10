/* exported EXPORTED_SYMBOLS, ShrunkedImage */
var EXPORTED_SYMBOLS = ['ShrunkedImage'];

/* globals Components, Services, Task, XPCOMUtils, ChromeWorker */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/Task.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

/* globals ExifData, NetUtil, OS, Shrunked */
XPCOMUtils.defineLazyModuleGetter(this, 'ExifData', 'resource://shrunked/ExifData.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'NetUtil', 'resource://gre/modules/NetUtil.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'OS', 'resource://gre/modules/osfile.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Shrunked', 'resource://shrunked/Shrunked.jsm');

var XHTMLNS = 'http://www.w3.org/1999/xhtml';

function ShrunkedImage(source, maxWidth, maxHeight, quality) {
	this.maxWidth = maxWidth;
	this.maxHeight = maxHeight;
	this.quality = quality;

	if (typeof source == 'string') {
		this.sourceURI = Services.io.newURI(source, null, null);
		if (this.sourceURI.schemeIs('file')) {
			let file = this.sourceURI.QueryInterface(Components.interfaces.nsIFileURL).file;
			this.path = file.path;
			this.basename = file.leafName;
		} else {
			let match;
			/* jshint -W084 */
			if (match = /[?&]filename=([\w.-]+)/.exec(this.sourceURI.spec)) {
				this.basename = match[1];
			} else if (match = /\/([\w.-]+\.jpg)$/i.exec(this.sourceURI.spec)) {
				this.basename = match[1];
			}
			/* jshint +W084 */
		}
	} else if (source instanceof Components.interfaces.nsIFile) {
		this.sourceURI = Services.io.newFileURI(source);
		this.path = source.path;
		this.basename = source.leafName;
	}

	if (!this.sourceURI) {
		throw new Error('Unexpected source passed to ShrunkedImage');
	}
}
ShrunkedImage.prototype = {
	resize: function ShrunkedImage_resize() {
		return Task.spawn((function*() {
			let orientation = 0;
			if (Shrunked.options.exif) {
				yield this.readExifData();
				if (Shrunked.options.orientation && this.exifData) {
					orientation = this.exifData.orientation;
				}
			}
			let image = yield this.loadImage();
			let canvas = yield this.drawOnCanvas(image, orientation);

			/* jshint -W069 */
			if (this.exifData && this.exifData.exif2['a002']) {
				this.exifData.exif2['a002'].value = canvas.width;
				this.exifData.exif2['a003'].value = canvas.height;
			}
			/* jshint +W069 */

			let bytes = yield this.getBytes(canvas);
			let newPath = yield this.save(bytes);

			return newPath;
		}).bind(this));
	},
	readExifData: function ShrunkedImage_readExifData() {
		return Task.spawn((function*() {
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
				Shrunked.warn(ex);
				delete this.exifData;
			}
		}).bind(this));
	},
	loadImage: function ShrunkedImage_load() {
		return new Promise((resolve, reject) => {
			let image = getWindow().document.createElementNS(XHTMLNS, 'img');
			image.onload = function() {
				// https://bugzilla.mozilla.org/show_bug.cgi?id=574330#c54
				if (!image.complete) {
					image.src = image.src;
					return;
				}
				resolve(image);
			};
			image.onerror = reject;
			image.src = this.sourceURI.spec;
		});
	},
	drawOnCanvas: function ShrunkedImage_drawOnCanvas(image, orientation, resample = true) {
		return new Promise((resolve) => {
			let ratio = Math.max(1, image.width / this.maxWidth, image.height / this.maxHeight);
			let resampleRatio = 1;
			if (resample && Shrunked.options.resample) {
				resampleRatio = Math.min(ratio, 3);
				if (resampleRatio > 2 && resampleRatio < 3) {
					resampleRatio = 2;
				}
			}

			let width = Math.floor(image.width / ratio);
			let height = Math.floor(image.height / ratio);

			if (orientation == 90 || orientation == 270) {
				[width, height] = [height, width];
			}

			let canvas = getWindow().document.createElementNS(XHTMLNS, 'canvas');
			canvas.width = Math.floor(width * resampleRatio);
			canvas.height = Math.floor(height * resampleRatio);

			let context = canvas.getContext('2d');
			if (orientation == 90) {
				context.translate(0, canvas.height);
				context.rotate(-0.5 * Math.PI);
			} else if (orientation == 180) {
				context.translate(canvas.width, canvas.height);
				context.rotate(Math.PI);
			} else if (orientation == 270) {
				context.translate(canvas.width, 0);
				context.rotate(0.5 * Math.PI);
			}
			context.drawImage(image, 0, 0, image.width / ratio * resampleRatio, image.height / ratio * resampleRatio);

			if (resampleRatio > 1) {
				let oldData = context.getImageData(0, 0, canvas.width, canvas.height);
				canvas.width = width;
				canvas.height = height;
				let newData = context.createImageData(canvas.width, canvas.height);

				let worker = new ChromeWorker('resource://shrunked/worker.js');
				worker.onmessage = function(event) {
					context.putImageData(event.data, 0, 0);
					resolve(canvas);
				};
				worker.postMessage({
					oldData: oldData,
					newData: newData,
					func: (resampleRatio == 3 ? 'nineResample' : (resampleRatio == 2 ? 'fourResample' : 'floatResample')),
					ratio: resampleRatio // only for floatResample
				});
			} else {
				resolve(canvas);
			}
		});
	},
	getBytes: function ShrunkedImage_getBytes(canvas) {
		return new Promise((resolve, reject) => {
			canvas.toBlob(function(blob) {
				try {
					let reader = getFileReader();
					reader.onloadend = function() {
						resolve(new Uint8Array(reader.result));
					};
					reader.readAsArrayBuffer(blob);
				} catch (ex) {
					reject(ex);
				}
			}, 'image/jpeg', 'quality=' + this.quality);
		});
	},
	save: function ShrunkedImage_save(bytes) {
		let destFile;
		let tempDir = OS.Constants.Path.tmpDir;
		if (this.basename) {
			destFile = OS.Path.join(tempDir, this.basename);
		} else {
			destFile = OS.Path.join(tempDir, 'shrunked-image.jpg');
		}

		return Task.spawn((function*() {
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
				return outputPath;
			} finally {
				outputFile.close();
			}
		}).bind(this)).catch(function(error) {
			Components.utils.reportError(error);
		});
	},
	estimateSize: function() {
		return this.loadImage()
			.then(image => this.drawOnCanvas(image, 0, false))
			.then(canvas => this.getBytes(canvas))
			.then(bytes => bytes.length);
	}
};

function Readable(url) {
	return new Promise(function(resolve, reject) {
		NetUtil.asyncFetch(url, function(stream) {
			try {
				let binaryStream = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
				binaryStream.setInputStream(stream);
				let bytes = binaryStream.readByteArray(stream.available());
				binaryStream.close();
				stream.close();

				resolve({
					data: new Uint8Array(bytes),
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
				});
			} catch (ex) {
				reject(ex);
			}
		});
	});
}

function getWindow() {
	return Services.wm.getMostRecentWindow('mail:3pane') || Services.wm.getMostRecentWindow('navigator:browser');
}

function getFileReader() {
	let FileReader = getWindow().FileReader;
	return new FileReader();
}
