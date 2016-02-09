/* globals Components, Shrunked, openLinkExternally */
Components.utils.import('resource://shrunked/Shrunked.jsm');

/* exported ShrunkedMessenger */
var ShrunkedMessenger = {
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
