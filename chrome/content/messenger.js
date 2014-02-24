window.addEventListener('load', function() {
	var notifyBox = document.getElementById('mail-notification-box');
	if (notifyBox) {
		setTimeout(function() {
			Components.utils.import('resource://shrunked/shrunked.jsm');
			Shrunked.showStartupNotification(notifyBox, function(aURL) {
				openLinkExternally(aURL);
			});
		}, 1000);
	}
}, false);
