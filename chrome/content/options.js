const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import('resource://shrunked/shrunked.jsm');
Cu.import('resource://gre/modules/PrivateBrowsingUtils.jsm');

let returnValues = window.arguments[0];
let imageURLs = window.arguments[1];
let imageNames = window.arguments[2];
let windowIsPrivate = PrivateBrowsingUtils.isWindowPrivate(window.opener);
let imageIndex = 0;
let maxWidth, maxHeight;

for (let element of document.querySelectorAll('[id]')) {
	window[element.id] = element;
}

function load() {
	maxWidth = Shrunked.prefs.getIntPref('default.maxWidth');
	maxHeight = Shrunked.prefs.getIntPref('default.maxHeight');

	if (maxWidth == 500 && maxHeight == 500) {
		rg_size.selectedIndex = 0;
	} else if (maxWidth == 800 && maxHeight == 800) {
		rg_size.selectedIndex = 1;
	} else if (maxWidth == 1200 && maxHeight == 1200) {
		rg_size.selectedIndex = 2;
	} else {
		rg_size.selectedIndex = 3;
		tb_width.value = maxWidth;
		tb_height.value = maxHeight;
	}

	cb_remembersite.checked = Shrunked.prefs.getBoolPref('default.rememberSite');
	cb_savedefault.checked = Shrunked.prefs.getBoolPref('default.saveDefault');

	if (returnValues.inputTag) {
		let uri = returnValues.inputTag.ownerDocument.documentURIObject;
		cb_remembersite.disabled = windowIsPrivate || !(uri.schemeIs('http') || uri.schemeIs('https'));
	} else {
		cb_remembersite.collapsed = true;
	}

	setSize();

	i_previewthumb.src = imageURLs[0];
	if (imageURLs.length < 2) {
		b_previewarrowprevious.setAttribute('hidden', 'true');
		b_previewarrownext.setAttribute('hidden', 'true');
	}
	window.sizeToContent();
}

function setSize() {
	switch (rg_size.selectedIndex) {
	case 0:
		maxWidth = 500;
		maxHeight = 500;
		break;
	case 1:
		maxWidth = 800;
		maxHeight = 800;
		break;
	case 2:
		maxWidth = 1200;
		maxHeight = 1200;
		break;
	case 3:
		maxWidth = tb_width.value;
		maxHeight = tb_height.value;
		break;
	}

	l_width.disabled = tb_width.disabled =
		l_height.disabled = tb_height.disabled = !r_custom.selected;

	imageLoad();
}

function advancePreview(aDirection) {
	imageIndex = (imageIndex + aDirection + imageURLs.length) % imageURLs.length;
	i_previewthumb.src = imageURLs[imageIndex];
}

function imageLoad() {
	let img = new Image();
	img.onload = function() {
		let {width, height, src} = img;
		let scale = Math.min(1, Math.min(maxWidth / width, maxHeight / height));

		if (imageNames && imageNames[imageIndex]) {
			l_previewfilename.setAttribute('value', imageNames[imageIndex]);
		} else {
			let i = src.indexOf('filename=');
			if (i > -1) {
				i += 9;
				let j = src.indexOf('&', i);
				if (j > i) {
					l_previewfilename.setAttribute('value', src.substring(i, j));
				} else {
					l_previewfilename.setAttribute('value', src.substring(i));
				}
			} else {
				l_previewfilename.setAttribute('value', src.substring(src.lastIndexOf('/') + 1));
			}
		}
		l_previeworiginalsize.setAttribute('value', strings.getFormattedString('preview_originalsize', [width, height]));
		if (scale == 1) {
			l_previewresized.setAttribute('value', strings.getString('preview_notresized'));
		} else {
			l_previewresized.setAttribute('value', strings.getFormattedString('preview_resized', [Math.floor(width * scale), Math.floor(height * scale)]));
		}
	};
	img.src = i_previewthumb.src;
}

function accept() {
	returnValues.cancelDialog = false;

	returnValues.maxWidth = maxWidth;
	returnValues.maxHeight = maxHeight;
	returnValues.rememberSite = !cb_remembersite.disabled && cb_remembersite.checked;

	if (cb_savedefault.checked) {
		Shrunked.prefs.setIntPref('default.maxWidth', returnValues.maxWidth);
		Shrunked.prefs.setIntPref('default.maxHeight', returnValues.maxHeight);
		if (!cb_remembersite.disabled)
			Shrunked.prefs.setBoolPref('default.rememberSite', returnValues.rememberSite);
	}
	Shrunked.prefs.setBoolPref('default.saveDefault', cb_savedefault.checked);
}

function cancel() {
	returnValues.cancelDialog = true;
}
