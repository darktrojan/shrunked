addEventListener('change', function(event) {
	if (event.target.localName != 'input' || event.target.type != 'file') {
		return;
	}

	sendAsyncMessage('Shrunked:PromptAndResize', event.target.mozGetFileNameArray());
}, true);

addMessageListener('Shrunked:Resized', function(event) {
	for (let [k, v] of event.data.entries()) {
		console.log(k, v);
	}
});
