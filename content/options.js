// var returnValues = window.arguments[0];
// var imageURLs = window.arguments[1];
// var imageNames = window.arguments[2] || [];
var imageData = [];
var imageIndex = 0;
var maxWidth, maxHeight;

var promise = null;

/* globals rg_size, r_noresize, r_custom, l_width, tb_width, l_height, tb_height, l_measure
   b_previewarrows, l_previewarrows, i_previewthumb, l_previewfilename, l_previeworiginalsize,
   l_previeworiginalfilesize, l_previewresized, l_previewresizedfilesize, cb_savedefault,
   b_ok */
for (let element of document.querySelectorAll('[id]')) {
	window[element.id] = element;
}
for (let element of document.querySelectorAll('[data-l10n-content]')) {
	element.textContent = browser.i18n.getMessage(element.getAttribute("data-l10n-content"));
}
for (let element of document.querySelectorAll('[data-l10n-title]')) {
	element.title = browser.i18n.getMessage(element.getAttribute("data-l10n-title"));
}

/* exported load */
addEventListener('load', () => {
	// let width = l_measure.getBoundingClientRect().right;
	// let element = l_measure;
	// do {
	// 	let style = getComputedStyle(element);
	// 	width += parseInt(style.paddingRight, 10);
	// 	width += parseInt(style.borderRightWidth, 10);
	// 	width += parseInt(style.marginRight, 10);
	// 	element = element.parentNode;
	// } while (element && element != document);
	// document.documentElement.style.minWidth = `${width}px`;

	maxWidth = 500// Shrunked.prefs.getIntPref('default.maxWidth');
	maxHeight = 500 //Shrunked.prefs.getIntPref('default.maxHeight');

	if (maxWidth == -1 && maxHeight == -1) {
		r_noresize.checked = true;
	} else if (maxWidth == 500 && maxHeight == 500) {
		r_small.checked = true;
	} else if (maxWidth == 800 && maxHeight == 800) {
		r_medium.checked = true;
	} else if (maxWidth == 1200 && maxHeight == 1200) {
		r_large.checked = true;
	} else {
		r_custom.checked = true;
		tb_width.value = maxWidth;
		tb_height.value = maxHeight;
	}

	cb_savedefault.checked = true //Shrunked.prefs.getBoolPref('default.saveDefault');

	// if (!returnValues.isAttachment) {
	// 	r_noresize.collapsed = true;
	// 	if (r_noresize.selected) {
	// 		rg_size.selectedIndex = 1;
	// 	}
	// }

	setSize();
});

r_noresize.addEventListener("change", setSize);
r_small.addEventListener("change", setSize);
r_medium.addEventListener("change", setSize);
r_large.addEventListener("change", setSize);
r_custom.addEventListener("change", setSize);
tb_height.addEventListener("change", setSize);
tb_width.addEventListener("change", setSize);

function setImageURLs(imageURLs) {
	// i_previewthumb.src = imageURLs[0];
	// if (imageURLs.length < 2) {
	// 	b_previewarrows.setAttribute('hidden', 'true');
	// } else {
	// 	l_previewarrows.setAttribute('value', '1/' + imageURLs.length);
	// }

	return new Promise((resolve, reject) => {
		promise = { resolve, reject };
	});
}

/* exported setSize */
function setSize() {
	let checked = rg_size.querySelector("input:checked");
	switch (checked) {
	case r_noresize:
		maxWidth = -1;
		maxHeight = -1;
		break;
	case r_small:
		maxWidth = 500;
		maxHeight = 500;
		break;
	case r_medium:
		maxWidth = 800;
		maxHeight = 800;
		break;
	case r_large:
		maxWidth = 1200;
		maxHeight = 1200;
		break;
	case r_custom:
		maxWidth = parseInt(tb_width.value, 10);
		maxHeight = parseInt(tb_height.value, 10);
		break;
	}

	l_width.disabled = tb_width.disabled =
		l_height.disabled = tb_height.disabled = checked != r_custom;

	imageLoad();
}

/* exported advancePreview */
function advancePreview(delta) {
	imageIndex = (imageIndex + delta + imageURLs.length) % imageURLs.length;
	l_previewarrows.setAttribute('value', (imageIndex + 1) + '/' + imageURLs.length);
	i_previewthumb.src = imageURLs[imageIndex];
}

function humanSize(size) {
	let unit = 'bytes';
	if (size >= 1000000) {
		size = size / 1000000;
		unit = 'megabytes';
	} else if (size >= 1000) {
		size = size / 1000;
		unit = 'kilobytes';
	}

	return size.toFixed(size >= 9.95 ? 0 : 1) + '\u2006' + Shrunked.strings.GetStringFromName('unit_' + unit);
}

/* exported imageLoad */
function imageLoad() {
	let img = new Image();
	img.onload = function() {
		let {width, height, src} = img;
		let scale = 1;

		let data = imageData[imageIndex];
		if (!data) {
			data = imageData[imageIndex] = {};
		}

		if (data.originalSize === undefined) {
			let uri = Services.io.newURI(src, null, null);
			if (uri.schemeIs('file')) {
				let file = uri.QueryInterface(Ci.nsIFileURL).file;
				data.filename = file.leafName;
				data.originalSize = humanSize(file.fileSize);
			} else if (uri.schemeIs('data')) {
				let srcSize = (src.length - src.indexOf(',') - 1) * 3 / 4;
				if (src.substr(-1) == '=') {
					srcSize--;
					if (src.substr(-2, 1) == '=') {
						srcSize--;
					}
				}
				data.originalSize = humanSize(srcSize);
			}
		}
		if (data.filename === undefined) {
			if (imageNames[imageIndex]) {
				data.filename = imageNames[imageIndex];
			} else {
				let i = src.indexOf('filename=');
				if (i > -1) {
					i += 9;
					let j = src.indexOf('&', i);
					if (j > i) {
						data.filename = decodeURIComponent(src.substring(i, j));
					} else {
						data.filename = decodeURIComponent(src.substring(i));
					}
				} else {
					data.filename = src.substring(src.lastIndexOf('/') + 1);
				}
			}
		}

		setValue(l_previewfilename, data.filename);
		setValueFromString(l_previeworiginalsize, 'preview_originalsize', width, height);
		if (data.originalSize) {
			setValueFromString(l_previeworiginalfilesize, 'preview_originalfilesize', data.originalSize);
		} else {
			setValue(l_previeworiginalfilesize, '');
		}

		if (maxWidth > 0 && maxHeight > 0) {
			scale = Math.min(1, Math.min(maxWidth / width, maxHeight / height));
		}
		if (scale == 1) {
			setValueFromString(l_previewresized, 'preview_notresized');
			setValue(l_previewresizedfilesize, '');
		} else {
			let newWidth = Math.floor(width * scale);
			let newHeight = Math.floor(height * scale);
			let quality = Shrunked.prefs.getIntPref('default.quality');
			let cacheKey = newWidth + 'x' + newHeight + 'x' + quality;

			setValueFromString(l_previewresized, 'preview_resized', newWidth, newHeight);
			if (data[cacheKey] === undefined) {
				setValueFromString(l_previewresizedfilesize, 'preview_resizedfilesize_estimating');
				new ShrunkedImage(src, newWidth, newHeight, quality).estimateSize().then(size => {
					data[cacheKey] = humanSize(size);
					setValueFromString(l_previewresizedfilesize, 'preview_resizedfilesize', data[cacheKey]);
				});
			} else {
				setValueFromString(l_previewresizedfilesize, 'preview_resizedfilesize', data[cacheKey]);
			}
		}
	};
	img.src = i_previewthumb.src;
}

b_ok.addEventListener('click', function() {
	let returnValues = {
		maxWidth,
		maxHeight,
	};

	// if (cb_savedefault.checked) {
	// 	Shrunked.prefs.setIntPref('default.maxWidth', returnValues.maxWidth);
	// 	Shrunked.prefs.setIntPref('default.maxHeight', returnValues.maxHeight);
	// }
	// Shrunked.prefs.setBoolPref('default.saveDefault', cb_savedefault.checked);

	promise.resolve(returnValues);

	window.close();
});

document.addEventListener('dialogcancel', function() {
	returnValues.cancelDialog = true;
});

function setValue(element, value) {
	element.setAttribute('value', value);
}

function setValueFromString(element, name, ...values) {
	let value;
	if (values.length === 0) {
		value = Shrunked.strings.GetStringFromName(name);
	} else {
		value = Shrunked.strings.formatStringFromName(name, values, values.length);
	}
	setValue(element, value);
}
