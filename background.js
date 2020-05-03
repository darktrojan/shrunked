browser.composeScripts.register({
	js: [
		{
			file: 'compose_script.js',
		}
	],
});

// browser.shrunked.fileSizeMinimum().then(console.log);
browser.runtime.onMessage.addListener((message, sender, callback) => {
	// console.log(message);
	return browser.shrunked.resize(message);
});

browser.compose.onBeforeSend.addListener((tab, details) => {
  return browser.shrunked.handleSend(tab);
});
