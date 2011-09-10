const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import ('resource://gre/modules/Services.jsm');

const IS_FIREFOX = Services.appinfo.name == 'Firefox';
const IS_THUNDERBIRD = Services.appinfo.name == 'Thunderbird';

if (!IS_THUNDERBIRD) {
	var siteList = document.getElementById ('sitelist');
}

var maxWidthPref = document.getElementById ('maxwidth');
var maxHeightPref = document.getElementById ('maxheight');
var qualityPref = document.getElementById ('quality');

var noresize = document.getElementById ('noresize');
var small = document.getElementById ('small');
var medium = document.getElementById ('medium');
var large = document.getElementById ('large');
var custom = document.getElementById ('custom');
var label1 = document.getElementById ('label1');
var customvalue1 = document.getElementById ('customvalue1');
var label2 = document.getElementById ('label2');
var customvalue2 = document.getElementById ('customvalue2');
var slider = document.getElementById ('slider');

var strings = document.getElementById ('shrunked-strings');

function doLoad () {
	let lastSelected = document.documentElement.getAttribute ('lastSelected');
	if (lastSelected) {
		let lastSelectedPane = document.getElementById (lastSelected);
		if (lastSelectedPane) {
			document.documentElement.showPane (lastSelectedPane);
		}
	}

	let sitesPane = document.getElementById ('shrunked-sites');
	let defaultsPane = document.getElementById ('shrunked-defaults');

	if (IS_FIREFOX) {
		noresize.collapsed = true;
	}
	if (IS_THUNDERBIRD) {
		try {
			document.documentElement.showPane (defaultsPane);
		} catch (e) {
			Cu.reportError (e);
		}
		sitesPane.setAttribute ('collapsed', 'true');
		var selector = document.getAnonymousElementByAttribute (document.documentElement, 'anonid', 'selector');
		selector.setAttribute ('collapsed', 'true');
	} else {
		var data = {};
		['disabled', 'maxWidth', 'maxHeight'].forEach (function (name) {
			let prefs = Services.contentPrefs.getPrefsByName ('extensions.shrunked.' + name);
			let enumerator = prefs.enumerator;
			while (enumerator.hasMoreElements()) {
				var property = enumerator.getNext().QueryInterface(Components.interfaces.nsIProperty);
				if (!(property.name in data)) {
					data [property.name] = {};
				}
				data [property.name][name] = property.value;
			}
		});
		handleData (data);
	}

	var maxWidth = maxWidthPref.value;
	var maxHeight = maxHeightPref.value;

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
		customvalue1.value = maxWidthPref.value;
		customvalue2.value = maxHeightPref.value;
	}

	slider.value = qualityPref.value;

	validate ();
};

function handleData (data) {
	for (var site in data) {
		var disabled = data [site]['disabled'];
		var maxWidth = data [site]['maxWidth'];
		var maxHeight = data [site]['maxHeight'];
		if (disabled) {
			var item = document.createElement ('listitem');
			item.setAttribute ('style', 'color: #666; font-style: italic');
			var siteCell = document.createElement ('listcell');
			siteCell.setAttribute ('label', site);
			item.appendChild (siteCell);
			var disabledCell = document.createElement ('listcell');
			disabledCell.setAttribute ('label', strings.getString ('disabled'));
			disabledCell.setAttribute ('style', 'text-align: center');
			item.appendChild (disabledCell);
			siteList.appendChild (item);
		}
		if (maxWidth && maxHeight) {
			var item = document.createElement ('listitem');
			var siteCell = document.createElement ('listcell');
			siteCell.setAttribute ('label', site);
			item.appendChild (siteCell);
			var widthCell = document.createElement ('listcell');
			widthCell.setAttribute ('label', strings.getFormattedString ('dimensions', [maxWidth, maxHeight]));
			widthCell.setAttribute ('style', 'text-align: center');
			item.appendChild (widthCell);
			siteList.appendChild (item);
		}
	}
}

function doForget () {
	var item = siteList.getSelectedItem (0);
	if (item) {
		var site = item.firstChild.getAttribute ('label');
		var u = Services.io.newURI ('http://' + site + '/', null, null);

		Services.contentPrefs.removePref (u, 'extensions.shrunked.maxHeight');
		Services.contentPrefs.removePref (u, 'extensions.shrunked.maxWidth');
		Services.contentPrefs.removePref (u, 'extensions.shrunked.disabled');
	}
	siteList.removeChild (item);
}

function validate () {
	label1.disabled = customvalue1.disabled = label2.disabled = customvalue2.disabled = !custom.selected;
	if (noresize.selected) {
		maxWidthPref.value = -1;
		maxHeightPref.value = -1;
	} else if (small.selected) {
		maxWidthPref.value = 500;
		maxHeightPref.value = 500;
	} else if (medium.selected) {
		maxWidthPref.value = 800;
		maxHeightPref.value = 800;
	} else if (large.selected) {
		maxWidthPref.value = 1200;
		maxHeightPref.value = 1200;
	} else {
		maxWidthPref.value = customvalue1.value;
		maxHeightPref.value = customvalue2.value;
	}
}

function doAccept () {
	document.documentElement.setAttribute ('lastSelected', document.documentElement.currentPane.id);
}
