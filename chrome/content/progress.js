const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import('resource://shrunked/shrunked.jsm');

var images = window.arguments[0]; // [{ url }, ... ]
var returnValues = window.arguments[1];
var maxWidth = returnValues.maxWidth;
var maxHeight = returnValues.maxHeight;
var quality = Shrunked.prefs.getIntPref('default.quality');

var currentImage = 0;
var imageCount = images.length;

var progress = document.getElementById('progress');
progress.max = imageCount;
var progressText = document.getElementById('progressText');
progressText.value = '0/' + imageCount;

function doResize(image) {
	Shrunked.enqueue(document, image.url, maxWidth, maxHeight, quality, function(destFile) {
		progress.setAttribute('value', ++currentImage);
		progressText.setAttribute('value', currentImage + '/' + imageCount);
		image.destFile = destFile;

		if (currentImage == imageCount) {
			returnValues.cancelDialog = false;
			setTimeout(function() {
				window.close();
			}, 150);
		} else {
			setTimeout(function() {
				doResize(images[currentImage]);
			}, 150);
		}
	});
}
