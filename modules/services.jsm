var EXPORTED_SYMBOLS = ['Services'];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

try {
	Cu.import ('resource://gre/modules/Services.jsm'); // 1.9.3
} catch (e) {
	Cu.import ('resource://gre/modules/XPCOMUtils.jsm'); // 1.9.2

	var Services = {};
	XPCOMUtils.defineLazyServiceGetter (Services, 'io', '@mozilla.org/network/io-service;1', 'nsIIOService2');
	XPCOMUtils.defineLazyGetter (Services, 'dirsvc', function () {
		return Cc ['@mozilla.org/file/directory_service;1']
			.getService(Ci.nsIDirectoryService).QueryInterface(Ci.nsIProperties);
	});
	XPCOMUtils.defineLazyGetter (Services, 'prefs', function () {
		return Cc ['@mozilla.org/preferences-service;1']
			.getService (Ci.nsIPrefService).QueryInterface (Ci.nsIPrefBranch2);
	});
	XPCOMUtils.defineLazyGetter(Services, 'appinfo', function () {
		return Cc['@mozilla.org/xre/app-info;1']
			.getService(Ci.nsIXULAppInfo).QueryInterface(Ci.nsIXULRuntime);
	});
	XPCOMUtils.defineLazyServiceGetter(Services, 'contentPrefs', '@mozilla.org/content-pref/service;1', 'nsIContentPrefService');
}
