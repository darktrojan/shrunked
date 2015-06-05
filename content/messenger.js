let ShrunkedMessenger = {
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
	donateCallback: function(url) {
		openLinkExternally(url);
	}
};

Components.utils.import('resource://shrunked/Shrunked.jsm');
