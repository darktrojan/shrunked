Components.utils.import('resource://shrunked/Shrunked.jsm');
Components.utils.import('resource://shrunked/ShrunkedImage.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/PrivateBrowsingUtils.jsm');

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

	if (maxWidth == -1 && maxHeight == -1) {
		rg_size.selectedIndex = 0;
	} else if (maxWidth == 500 && maxHeight == 500) {
		rg_size.selectedIndex = 1;
	} else if (maxWidth == 800 && maxHeight == 800) {
		rg_size.selectedIndex = 2;
	} else if (maxWidth == 1200 && maxHeight == 1200) {
		rg_size.selectedIndex = 3;
	} else {
		rg_size.selectedIndex = 4;
		tb_width.value = maxWidth;
		tb_height.value = maxHeight;
	}

	cb_remembersite.checked = Shrunked.prefs.getBoolPref('default.rememberSite');
	cb_savedefault.checked = Shrunked.prefs.getBoolPref('default.saveDefault');

	if (!returnValues.isAttachment) {
		r_noresize.collapsed = true;
		if (r_noresize.selected) {
			rg_size.selectedIndex = 1;
		}
	}

	if (!returnValues.canRemember) {
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
		maxWidth = -1;
		maxHeight = -1;
		break;
	case 1:
		maxWidth = 500;
		maxHeight = 500;
		break;
	case 2:
		maxWidth = 800;
		maxHeight = 800;
		break;
	case 3:
		maxWidth = 1200;
		maxHeight = 1200;
		break;
	case 4:
		maxWidth = tb_width.value;
		maxHeight = tb_height.value;
		break;
	}

	l_width.disabled = tb_width.disabled =
		l_height.disabled = tb_height.disabled = !r_custom.selected;

	imageLoad();
}

function advancePreview(delta) {
	imageIndex = (imageIndex + delta + imageURLs.length) % imageURLs.length;
	i_previewthumb.src = imageURLs[imageIndex];
}

function humanSize(size) {
	let unit = 'B';
	if (size >= 1000000) {
		size = size / 1000000;
		unit = 'MB'
	} else if (size >= 1000) {
		size = size / 1000;
		unit = 'KB'
	}

	return size.toFixed(size >= 9.95 ? 0 : 1) + ' ' + unit;
}

function imageLoad() {
	let img = new Image();
	img.onload = function() {
		let {width, height, src} = img;
		let scale = 1;
		let size = null;

		let uri = Services.io.newURI(src, null, null);
		if (uri.schemeIs('file')) {
			size = uri.QueryInterface(Components.interfaces.nsIFileURL).file.fileSize;
			size = humanSize(size);
		}

		if (maxWidth > 0 && maxHeight > 0) {
			scale = Math.min(1, Math.min(maxWidth / width, maxHeight / height));
		}

		l_previewfilename.setAttribute('value', '');
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
		l_previeworiginalsize.setAttribute('value', getString('preview_originalsize', width, height));
		if (size) {
			l_previeworiginalfilesize.setAttribute('value', getString('preview_originalfilesize', size));
		} else {
			l_previeworiginalfilesize.setAttribute('value', '');
		}
		if (scale == 1) {
			l_previewresized.setAttribute('value', getString('preview_notresized'));
			l_previewresizedfilesize.setAttribute('value', '');
		} else {
			let newWidth = Math.floor(width * scale);
			let newHeight = Math.floor(height * scale);
			let quality = Shrunked.prefs.getIntPref('default.quality');

			l_previewresized.setAttribute('value', getString('preview_resized', newWidth, newHeight));
			l_previewresizedfilesize.setAttribute('value', getString('preview_resizedfilesize_estimating'));

			new ShrunkedImage(src, newWidth, newHeight, quality).estimateSize().then(size => {
				l_previewresizedfilesize.setAttribute('value', getString('preview_resizedfilesize', humanSize(size)));
			});
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

function getString(name, ...values) {
	if (values.length == 0) {
		return Shrunked.strings.GetStringFromName(name);
	}
	return Shrunked.strings.formatStringFromName(name, values, values.length);
}
