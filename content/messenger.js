/* globals Components, Shrunked, openLinkExternally */
Components.utils.import('chrome://shrunked/content/modules/Shrunked.jsm');

/* exported ShrunkedMessenger */
var ShrunkedMessenger = {
	destroy: function() {
		// Cannot delete vars.
		window.Shrunked = null;
		window.ShrunkedMessenger = null;
	},
	showNotificationBar: function(text, buttons, callbackObject) {
		return new Promise(function(resolve) {
			callbackObject.resolve = resolve;

			var notifyBox = document.getElementById('mail-notification-box');
			notifyBox.removeAllNotifications(true);
			notifyBox.appendNotification(
				text, 'shrunked-notification', Shrunked.icon16, notifyBox.PRIORITY_INFO_HIGH, buttons
			);
		});
	},
	notificationCallback: function(url) {
		openLinkExternally(url);
	}
};
