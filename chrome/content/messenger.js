window.addEventListener('load', function() {
	var notifyBox = document.getElementById('mail-notification-box');
	if (notifyBox) {
		setTimeout(function() {
			Components.utils.import('resource://shrunked/shrunked.jsm');
			Shrunked.showDonateNotification(notifyBox, function() {
				openLinkExternally('https://addons.mozilla.org/thunderbird/addon/shrunked-image-resizer');
			});
		}, 1000);
	}
}, false);
