const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import('resource://shrunked/shrunked.jsm');
Cu.import('resource://gre/modules/PrivateBrowsingUtils.jsm');

let returnValues = window.arguments[0];
let windowIsPrivate = PrivateBrowsingUtils.isWindowPrivate(window.opener);

for (let element of document.querySelectorAll('[id]')) {
	window[element.id] = element;
}

function load() {
	let maxWidth = Shrunked.prefs.getIntPref('default.maxWidth');
	let maxHeight = Shrunked.prefs.getIntPref('default.maxHeight');

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
	window.sizeToContent();
}

function setSize() {
	l_width.disabled = tb_width.disabled =
		l_height.disabled = tb_height.disabled = !r_custom.selected;
}

function accept() {
	returnValues.cancelDialog = false;

	switch (rg_size.selectedIndex) {
	case 0:
		returnValues.maxWidth = 500;
		returnValues.maxHeight = 500;
		break;
	case 1:
		returnValues.maxWidth = 800;
		returnValues.maxHeight = 800;
		break;
	case 2:
		returnValues.maxWidth = 1200;
		returnValues.maxHeight = 1200;
		break;
	case 3:
		returnValues.maxWidth = tb_width.value;
		returnValues.maxHeight = tb_height.value;
		break;
	}
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
