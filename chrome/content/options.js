const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var returnValues = window.arguments[0];

Cu.import('resource://shrunked/shrunked.jsm');
var pbService;

var noresize = document.getElementById('noresize');
var small = document.getElementById('small');
var medium = document.getElementById('medium');
var large = document.getElementById('large');
var custom = document.getElementById('custom');
var label1 = document.getElementById('label1');
var customvalue1 = document.getElementById('customvalue1');
var label2 = document.getElementById('label2');
var customvalue2 = document.getElementById('customvalue2');
var remembersite = document.getElementById('remembersite');
var savedefault = document.getElementById('savedefault');
var acceptButton = document.documentElement.getButton('accept');

(function() {
	var pb = Cc['@mozilla.org/privatebrowsing;1'];
	if (typeof (pb) == 'undefined') {
		pbService = { privateBrowsingEnabled: false };
	} else {
		pbService = pb.getService(Ci.nsIPrivateBrowsingService);
	}

	var maxWidth = Shrunked.prefs.getIntPref('default.maxWidth');
	var maxHeight = Shrunked.prefs.getIntPref('default.maxHeight');

	if (maxWidth == -1 && maxHeight == -1) {
		medium.parentNode.selectedIndex = 0;
	} else if (maxWidth == 500 && maxHeight == 500) {
		medium.parentNode.selectedIndex = 1;
	} else if (maxWidth == 800 && maxHeight == 800) {
		medium.parentNode.selectedIndex = 2;
	} else if (maxWidth == 1200 && maxHeight == 1200) {
		medium.parentNode.selectedIndex = 3;
	} else {
		medium.parentNode.selectedIndex = 4;
		customvalue1.value = maxWidth;
		customvalue2.value = maxHeight;
	}

	remembersite.checked = Shrunked.prefs.getBoolPref('default.rememberSite');
	savedefault.checked = Shrunked.prefs.getBoolPref('default.saveDefault');

	if (returnValues.inputTag) {
		noresize.collapsed = true;
		if (noresize.selected) {
			medium.parentNode.selectedIndex = 1;
		}

		var uri = returnValues.inputTag.ownerDocument.documentURIObject;
		remembersite.disabled = pbService.privateBrowsingEnabled ||
				!(uri.schemeIs('http') || uri.schemeIs('https'));
	} else {
		remembersite.collapsed = true;
	}

	validate();
})();

function validate() {
	label1.disabled = customvalue1.disabled = label2.disabled = customvalue2.disabled = !custom.selected;
}

function doAccept() {
	returnValues.cancelDialog = false;
	if (noresize.selected) {
		returnValues.maxWidth = -1;
		returnValues.maxHeight = -1;
	} else if (small.selected) {
		returnValues.maxWidth = 500;
		returnValues.maxHeight = 500;
	} else if (medium.selected) {
		returnValues.maxWidth = 800;
		returnValues.maxHeight = 800;
	} else if (large.selected) {
		returnValues.maxWidth = 1200;
		returnValues.maxHeight = 1200;
	} else {
		returnValues.maxWidth = customvalue1.value;
		returnValues.maxHeight = customvalue2.value;
	}
	returnValues.rememberSite = !remembersite.disabled && remembersite.checked;

	if (savedefault.checked) {
		Shrunked.prefs.setIntPref('default.maxWidth', returnValues.maxWidth);
		Shrunked.prefs.setIntPref('default.maxHeight', returnValues.maxHeight);
		if (!remembersite.disabled) Shrunked.prefs.setBoolPref('default.rememberSite', returnValues.rememberSite);
	}
	Shrunked.prefs.setBoolPref('default.saveDefault', savedefault.checked);
}

function doCancel() {
	returnValues.cancelDialog = true;
}
