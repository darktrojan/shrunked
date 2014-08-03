window.addEventListener('load', function() {
	var notifyBox = document.getElementById('mail-notification-box');
	if (notifyBox) {
		setTimeout(function() {
			Components.utils.import('resource://shrunked/Shrunked.jsm');
			Shrunked.showStartupNotification(notifyBox, function(url) {
				openLinkExternally(url);
			});
		}, 1000);
	}
}, false);
