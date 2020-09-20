/* globals FileReader */
var EXPORTED_SYMBOLS = ['Shrunked'];

var ID = 'shrunked@darktrojan.net';
var CHANGELOG_URL = 'https://addons.thunderbird.net/addon/shrunked-image-resizer/versions/';
var DONATE_URL = 'https://darktrojan.github.io/donate.html?shrunked';

const { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');
const { XPCOMUtils } = ChromeUtils.import('resource://gre/modules/XPCOMUtils.jsm');

/* globals AddonManager, FileUtils, OS, PluralForm, ShrunkedImage */
ChromeUtils.defineModuleGetter(this, 'AddonManager', 'resource://gre/modules/AddonManager.jsm');
ChromeUtils.defineModuleGetter(this, 'FileUtils', 'resource://gre/modules/FileUtils.jsm');
ChromeUtils.defineModuleGetter(this, 'OS', 'resource://gre/modules/osfile.jsm');
ChromeUtils.defineModuleGetter(this, 'PluralForm', 'resource://gre/modules/PluralForm.jsm');
ChromeUtils.defineModuleGetter(this, 'ShrunkedImage', 'resource://shrunked/ShrunkedImage.jsm');

/* globals idleService */
XPCOMUtils.defineLazyServiceGetter(this, 'idleService', '@mozilla.org/widget/idleservice;1', 'nsIIdleService');

var temporaryFiles = new Set();
Services.obs.addObserver(function() {
	for (let path of temporaryFiles) {
		OS.File.remove(path, { ignoreAbsent: true });
	}
}, 'quit-application');

var Shrunked = {
	get fileSizeMinimum() {
		return Shrunked.prefs.getIntPref('fileSizeMinimum', 100) * 1000;
	},
	fileLargerThanThreshold(path) {
		let file;
		if (/^file:/.test(path)) {
			let uri = Services.io.newURI(path);
			file = uri.QueryInterface(Ci.nsIFileURL).file;
		} else {
			file = new FileUtils.File(path);
		}
		return file.fileSize >= this.fileSizeMinimum;
	},
	imageIsJPEG(image) {
		let request = image.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
		return !!request && request.mimeType == 'image/jpeg';
	},
	resize(sourceFile, maxWidth, maxHeight, quality, options) {
		return new ShrunkedImage(sourceFile, maxWidth, maxHeight, quality, options).resize();
	},
	async getURLFromFile(file, forceDataURL = false) {
		// If the total URL length is going to be less than 1MB, return a data URL.
		if (file.size < 768000 || forceDataURL) {
			return new Promise(function(resolve) {
				let reader = new FileReader();
				reader.onloadend = function() {
					let dataURL = reader.result;
					dataURL = 'data:image/jpeg;filename=' + encodeURIComponent(file.name) + dataURL.substring(15);
					resolve(dataURL);
				};
				reader.readAsDataURL(file);
			});
		}

		let tempDir = OS.Constants.Path.tmpDir;
		let destFile = OS.Path.join(tempDir, file.name);

		let {
			path: outputPath,
			file: outputFileWriter
		} = await OS.File.openUnique(destFile);

		return new Promise(function(resolve) {
			let reader = new FileReader();
			reader.onloadend = async function() {
				await outputFileWriter.write(new Uint8Array(reader.result));
				outputFileWriter.close();

				temporaryFiles.add(outputPath);

				let outputFile = new FileUtils.File(outputPath);
				let outputURL = Services.io.newFileURI(outputFile);
				resolve(outputURL.spec);
			};
			reader.readAsArrayBuffer(file);
		});
	},
	log(message) {
		if (this.logEnabled) {
			let frame = Components.stack.caller;
			let filename = frame.filename ? frame.filename.split(' -> ').pop() : null;
			let scriptError = Cc['@mozilla.org/scripterror;1'].createInstance(Ci.nsIScriptError);
			scriptError.init(
				message, filename, null, frame.lineNumber, frame.columnNumber,
				Ci.nsIScriptError.infoFlag, 'component javascript'
			);
			Services.console.logMessage(scriptError);
			dump(message + '\n');
		}
	},
	warn(message) {
		if (this.logEnabled) {
			let caller = Components.stack.caller;
			let filename = caller.filename ? caller.filename.split(' -> ').pop() : null;
			let scriptError = Cc['@mozilla.org/scripterror;1'].createInstance(Ci.nsIScriptError);
			scriptError.init(
				message, filename, null, caller.lineNumber, caller.columnNumber,
				Ci.nsIScriptError.warningFlag, 'component javascript'
			);
			Services.console.logMessage(scriptError);
		}
	},
	options: {
		get exif() {
			return Shrunked.prefs.getBoolPref('options.exif', true);
		},
		get orientation() {
			return Shrunked.prefs.getBoolPref('options.orientation', true);
		},
		get gps() {
			return Shrunked.prefs.getBoolPref('options.gps', true);
		},
		get resample() {
			return Shrunked.prefs.getBoolPref('options.resample', true);
		}
	},
	get icon16() {
		return 'chrome://shrunked/content/icon16.png';
	}
};
