addMessageListener("setfiles", function(message) {
	let myChromeFile = message.data;
	console.log(myChromeFile);

	var contentExposedFile = Components.utils.cloneInto(myChromeFile, content);

	content.document.querySelector('input[type="file"]').mozSetFileArray([contentExposedFile]);
});
