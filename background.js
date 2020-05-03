browser.composeScripts.register({
	js: [
		{
			file: 'compose_script.js',
		}
	],
});

// browser.shrunked.fileSizeMinimum().then(console.log);
browser.runtime.onMessage.addListener(async (message, sender, callback) => {
	// console.log(message);
	return browser.shrunked.resize(message);
});
