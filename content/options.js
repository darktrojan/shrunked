// var returnValues = window.arguments[0];
var imageIndex = 0;
var maxWidth, maxHeight;

var promise = null;

/* globals rg_size, r_noresize, r_small, r_medium, r_large, r_custom, l_width, tb_width, l_height, tb_height, l_measure
   b_previewarrows, l_previewarrows, i_previewthumb, l_previewfilename, l_previeworiginalsize,
   l_previeworiginalfilesize, l_previewresized, l_previewresizedfilesize, cb_savedefault,
   b_ok, b_cancel */
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
addEventListener('load', async () => {
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

	maxWidth = 500; // Shrunked.prefs.getIntPref('default.maxWidth');
	maxHeight = 500; // Shrunked.prefs.getIntPref('default.maxHeight');

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

	cb_savedefault.checked = true; // Shrunked.prefs.getBoolPref('default.saveDefault');

	// if (!returnValues.isAttachment) {
	// 	r_noresize.collapsed = true;
	// 	if (r_noresize.selected) {
	// 		rg_size.selectedIndex = 1;
	// 	}
	// }

	setSize();
	loadImage(0);
});

addEventListener('unload', () => {
	if (promise) {
		promise.reject();
	}
});

r_noresize.addEventListener("change", setSize);
r_small.addEventListener("change", setSize);
r_medium.addEventListener("change", setSize);
r_large.addEventListener("change", setSize);
r_custom.addEventListener("change", setSize);
tb_height.addEventListener("change", setSize);
tb_width.addEventListener("change", setSize);

function setImageURLs(imageURLs) {
	i_previewthumb.src = imageURLs[0];
	// if (imageURLs.length < 2) {
	// 	b_previewarrows.setAttribute('hidden', 'true');
	// } else {
	// 	l_previewarrows.setAttribute('value', '1/' + imageURLs.length);
	// }
}

function getResponse() {
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

	return size.toFixed(size >= 9.95 ? 0 : 1) + '\u2006' + unit; // Shrunked.strings.GetStringFromName('unit_' + unit);
}

let images = [];
async function loadImage(index) {
	if (!images[index]) {
		let keys = new URL(location.href).searchParams.getAll("keys").map(k => parseInt(k, 10));
		let file = await browser.runtime.sendMessage({ type: "fetchFile", key: keys[index] });

		images[index] = { file, url: URL.createObjectURL(file) };
	}

	i_previewthumb.src = images[index].url;
	l_previewfilename.textContent = images[index].file.name;
	l_previeworiginalfilesize.textContent = humanSize(images[index].file.size);
}

i_previewthumb.addEventListener("load", function() {
	l_previeworiginalsize.textContent = `${this.naturalWidth}px \xD7 ${this.naturalHeight}px`;

	let scale = 1;
	if (maxWidth > 0 && maxHeight > 0) {
		scale = Math.min(1, Math.min(maxWidth / this.naturalWidth, maxHeight / this.naturalHeight));
	}
	if (scale == 1) {
		l_previewresized.textContent = "preview_notresized";
		l_previewresizedfilesize.textContent = '';
	} else {
		let newWidth = Math.floor(this.naturalWidth * scale);
		let newHeight = Math.floor(this.naturalHeight * scale);
		let quality = 75; // Shrunked.prefs.getIntPref('default.quality');
		// let cacheKey = newWidth + 'x' + newHeight + 'x' + quality;

		l_previewresized.textContent = `resized to: ${newWidth} \xD7 ${newHeight}`;
		// if (data[cacheKey] === undefined) {
		// 	setValueFromString(l_previewresizedfilesize, 'preview_resizedfilesize_estimating');
		// 	new ShrunkedImage(src, newWidth, newHeight, quality).estimateSize().then(size => {
		// 		data[cacheKey] = humanSize(size);
		// 		setValueFromString(l_previewresizedfilesize, 'preview_resizedfilesize', data[cacheKey]);
		// 	});
		// } else {
		// 	setValueFromString(l_previewresizedfilesize, 'preview_resizedfilesize', data[cacheKey]);
		// }
	}
});

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
	promise = null;

	window.close();
});

b_cancel.addEventListener('click', function() {
	window.close();
});
