var tabMap = new Map();

async function shouldResize(attachment) {
  if (!attachment.name.toLowerCase().match(/\.jpe?g$/)) {
    return false;
  }
  let { fileSizeMinimum } = await browser.storage.local.get({ fileSizeMinimum: 100 });
  let file = await attachment.getFile();
  return file.size >= fileSizeMinimum * 1024;
}

browser.shrunked.migrateSettings().then(prefsToStore => {
  if (prefsToStore) {
    browser.storage.local.set(prefsToStore);
  }
});

browser.composeScripts.register({
  js: [
    {
      file: "compose_script.js",
    },
  ],
});

browser.runtime.onMessage.addListener(async (message, sender, callback) => {
  console.log(message);
  // Image added to body of message. Return a promise to the sender.
  if (message.type == "resizeFile") {
    return beginResize(sender.tab, message.file);
  }
  // Options window requesting a file.
  if (message.type == "fetchFile") {
    return Promise.resolve(tabMap.get(message.tabId)[message.index].file);
  }
  // Options window starting resize.
  if (message.type == "doResize") {
    doResize(message.tabId, message.maxWidth, message.maxHeight, message.quality);
  }
  return undefined;
});

// Attachment added to message. Just update the attachment.
browser.compose.onAttachmentAdded.addListener(async (tab, attachment) => {
  let { resizeAttachmentsOnSend } = await browser.storage.local.get({
    resizeAttachmentsOnSend: false,
  });
  if (resizeAttachmentsOnSend) {
    return;
  }
  if (!(await shouldResize(attachment))) {
    return;
  }

  let file = await attachment.getFile();
  let destFile = await beginResize(tab, file);
  await browser.compose.updateAttachment(tab.id, attachment.id, {
    file: destFile,
  });
});

// Attachment menu item.
browser.shrunked.onAttachmentContextClicked.addListener(async (tab, indicies) => {
  if (!indicies.length) {
    return;
  }

  let attachments = await browser.compose.listAttachments(tab.id);

  for (let i of indicies) {
    let a = attachments[i];
    if (await shouldResize(a)) {
      let file = await a.getFile();
      beginResize(tab, file, false).then(destFile =>
        browser.compose.updateAttachment(tab.id, a.id, { file: destFile })
      );
    }
  }

  showOptionsDialog(tab);
});

// Message sending.
browser.compose.onBeforeSend.addListener(async (tab, details) => {
  let { resizeAttachmentsOnSend } = await browser.storage.local.get({
    resizeAttachmentsOnSend: false,
  });
  if (!resizeAttachmentsOnSend) {
    return;
  }

  let promises = [];
  let attachments = await browser.compose.listAttachments(tab.id);
  for (let a of attachments) {
    if (await shouldResize(a)) {
      let file = await a.getFile();
      let promise = beginResize(tab, file, false).then(destFile =>
        browser.compose.updateAttachment(tab.id, a.id, { file: destFile })
      );
      promises.push(promise);
    }
  }

  if (!promises.length) {
    return;
  }

  await showOptionsDialog(tab);
  await Promise.allSettled(promises);
});

// Get a promise that resolves when resizing is complete.
function beginResize(tab, file, show = true) {
  return new Promise((resolve, reject) => {
    if (!tabMap.has(tab.id)) {
      tabMap.set(tab.id, []);
    }
    let sourceFiles = tabMap.get(tab.id);
    sourceFiles.push({ promise: { resolve, reject }, file });
    if (show) {
      browser.shrunked.showNotification(tab, sourceFiles.length);
    }
  });
}

// Notification response.
browser.shrunked.onNotificationAccepted.addListener(tab => showOptionsDialog(tab));
browser.shrunked.onNotificationCancelled.addListener(tab => cancelResize(tab.id));

async function showOptionsDialog(tab) {
  let sourceFiles = tabMap.get(tab.id);

  let optionsWindow = await browser.windows.create({
    url: `content/options.xhtml?tabId=${tab.id}&count=${sourceFiles.length}`,
    type: "popup",
    width: 550,
    height: 425,
  });

  let listener = windowId => {
    if (windowId == optionsWindow.id) {
      browser.windows.onRemoved.removeListener(listener);
      cancelResize(tab.id);
    }
  };
  browser.windows.onRemoved.addListener(listener);
}

// Actual resize operation.
async function doResize(tabId, maxWidth, maxHeight, quality) {
  // Remove from tabMap immediately, then cancelResize will have nothing to do.
  let sourceFiles = tabMap.get(tabId);
  tabMap.delete(tabId);

  if (maxWidth < 0 || maxHeight < 0) {
    for (let source of sourceFiles) {
      source.promise.reject("User opted to not resize.");
    }
    return;
  }

  let options = await browser.storage.local.get({
    "options.exif": true,
    "options.orientation": true,
    "options.gps": true,
    "options.resample": true,
  });
  options = {
    exif: options.exif,
    orientation: options.orientation,
    gps: options.gps,
    resample: options.resample,
  };

  for (let source of sourceFiles) {
    let destFile = await browser.shrunked.resizeFile(
      source.file,
      maxWidth,
      maxHeight,
      quality,
      options
    );
    source.promise.resolve(destFile);
  }
}

function cancelResize(tabId) {
  if (!tabMap.has(tabId)) {
    return;
  }

  for (let source of tabMap.get(tabId)) {
    source.promise.reject("Resizing cancelled.");
  }
  tabMap.delete(tabId);
}

// Clean up.
browser.tabs.onRemoved.addListener(tabId => {
  tabMap.delete(tabId);
});
