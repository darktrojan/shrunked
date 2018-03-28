/* globals Components, Services */
/* exported install, uninstall, startup, shutdown */
Components.utils.import('resource://gre/modules/Services.jsm');

var defaultPrefs = {
	'extensions.shrunked.default.maxWidth': 500,
	'extensions.shrunked.default.maxHeight': 500,
	'extensions.shrunked.default.quality': 75,
	'extensions.shrunked.default.rememberSite': false,
	'extensions.shrunked.default.saveDefault': true,
	'extensions.shrunked.exif.blacklist': '["112","11a","11b","128","213","927c","9286","a005","a210"]',
	'extensions.shrunked.fileSizeMinimum': 100,
	'extensions.shrunked.log.enabled': false,
	'extensions.shrunked.options.exif': true,
	'extensions.shrunked.options.orientation': true,
	'extensions.shrunked.options.gps': true,
	'extensions.shrunked.options.resample': true,
	'extensions.shrunked.resizeAttachmentsOnSend': false
};

function install() {
}
function uninstall() {
}
function startup() {
	let defaultBranch = Services.prefs.getDefaultBranch('');
	for (let [k, v] of Object.entries(defaultPrefs)) {
		switch (typeof v) {
		case 'boolean':
			defaultBranch.setBoolPref(k, v);
			break;
		case 'number':
			defaultBranch.setIntPref(k, v);
			break;
		case 'string':
			defaultBranch.setCharPref(k, v);
			break;
		}
	}

	windowObserver.init();
}
function shutdown() {
	windowObserver.destroy();
}

var windowObserver = {
	init: function() {
		this.enumerate('mail:3pane', this.paint);
		this.enumerate('msgcompose', this.paint);
		Services.ww.registerNotification(this);
	},
	destroy: function() {
		this.enumerate('mail:3pane', this.unpaint);
		this.enumerate('msgcompose', this.unpaint);
		Services.ww.unregisterNotification(this);
	},
	enumerate: function(windowType, callback) {
		let windowEnum = Services.wm.getEnumerator(windowType);
		while (windowEnum.hasMoreElements()) {
			callback.call(this, windowEnum.getNext());
		}
	},
	observe: function(subject) {
		subject.addEventListener('load', function() {
			windowObserver.paint(subject);
		}, false);
	},
	paint: function(win) {
		let script;
		switch (win.location.href) {
		case 'chrome://messenger/content/messenger.xul':
			script = 'chrome://shrunked/content/messenger.js';
			break;
		case 'chrome://messenger/content/messengercompose/messengercompose.xul':
			script = 'chrome://shrunked/content/compose.js';
			break;
		case 'chrome://mozapps/content/downloads/unknownContentType.xul':
			script = 'chrome://shrunked/content/unknownContentType.js';
			break;
		default:
			return;
		}
		Services.scriptloader.loadSubScript(script, win);
	},
	unpaint: function() {
	}
};
