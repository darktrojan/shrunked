/* globals Components, XPCOMUtils, Shrunked, sendAsyncMessage, addMessageListener, content */
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Shrunked', 'resource://shrunked/Shrunked.jsm');

var index = 1;
var inputMap = new Map();

addEventListener('change', function(event) {
	if (event.target.localName != 'input' || event.target.type != 'file' || event.target.files.length === 0) {
		return;
	}

	let files = event.target.mozGetFileNameArray();
	let filesToResize = [];
	for (var i = 0; i < files.length; i++) {
		let domFile = event.target.files[i];
		if (domFile.type == 'image/jpeg' && domFile.size >= Shrunked.fileSizeMinimum) {
			filesToResize.push(files[i]);
		}
	}

	if (filesToResize.length === 0) {
		return;
	}

	let data = {
		index: index,
		files: filesToResize
	};

	let form = event.target.form;
	if (form) {
		let maxWidth = form.dataset.shrunkedmaxwidth;
		let maxHeight = form.dataset.shrunkedmaxheight;
		if (maxWidth && maxHeight) {
			data.maxWidth = parseInt(maxWidth);
			data.maxHeight = parseInt(maxHeight);
		}
	}

	inputMap.set(index, event.target);
	index++;
	sendAsyncMessage('Shrunked:PromptAndResize', data);

	let targetWindow = event.target.ownerDocument.defaultView;
	targetWindow.addEventListener('unload', function() {
		inputMap.delete(data.index);
	});
}, true);

addMessageListener('Shrunked:Cancelled', function(message) {
	Shrunked.log(message.name + ': ' + JSON.stringify(message.json));

	inputMap.delete(message.data.index);
});

addMessageListener('Shrunked:Resized', function(message) {
	Shrunked.log(message.name + ': ' + JSON.stringify(message.json));

	if (Shrunked.logEnabled) {
		for (let [original, replacement] of message.data.replacementFiles.entries()) {
			Shrunked.log(original + ' resized to ' + replacement);
		}
	}

	let inputTag = inputMap.get(message.data.index);
	inputMap.delete(message.data.index);

	let form = inputTag.form;
	if (form) {
		form.dataset.shrunkedmaxwidth = message.data.maxWidth;
		form.dataset.shrunkedmaxheight = message.data.maxHeight;
	}

	let files = inputTag.files;
	inputTag.addEventListener('click', function resetInputTag() {
		inputTag.removeEventListener('click', resetInputTag, true);
		inputTag.mozSetFileArray(files);
	}, true);

	let newFiles = [];
	let replacements = message.data.replacementFiles;
	for (let i = 0; i < files.length; i++) {
		if (replacements.has(files[i].mozFullPath)) {
			newFiles[i] = Components.utils.cloneInto(replacements.get(files[i].mozFullPath), content);
		} else {
			newFiles[i] = files[i];
		}
	}
	inputTag.mozSetFileArray(newFiles);
});
