var tabMap = new Map();

async function shouldResize(attachment, checkSize = true) {
  if (!attachment.name.toLowerCase().match(/\.jpe?g$/)) {
    return false;
  }
  if (!checkSize) {
    return true;
  }
  let { fileSizeMinimum } = await browser.storage.local.get({ fileSizeMinimum: 100 });
  let file = await browser.compose.getAttachmentFile(attachment.id);
  return file.size >= fileSizeMinimum * 1024;
}

browser.composeAction.disable();
browser.composeScripts.register({
  js: [
    {
      file: "compose_script.js",
    },
  ],
});

let sendDeferred;

browser.runtime.onMessage.addListener(async (message, sender, callback) => {
  // Image added to body of message. Return a promise to the sender.
  if (message.type == "beginResize") {
    return updateEnabledState(sender.tab, true);
  }
  // Image removed from body of message.
  if (message.type == "updateEnabledState") {
    await updateEnabledState(sender.tab, false);
  }
  // Options window requesting a file.
  if (message.type == "fetchFile") {
    return Promise.resolve(tabMap.get(message.tabId)[message.index].file);
  }
  // Pop-up OK button.
  if (message.type == "completeSend") {
    await updateEnabledState(sender.tab, false);
    sendDeferred?.resolve();
  }
  // Pop-up cancel button.
  if (message.type == "cancelSend") {
    await updateEnabledState(sender.tab, false);
    sendDeferred?.reject();
  }
  return undefined;
});

async function updateEnabledState(tab, showPopup, ignoreResized) {
  let inlineImages = await browser.tabs.sendMessage(tab.id, { type: "listInlineImages", ignoreResized });
  let attachments = [];
  for (let a of await browser.compose.listAttachments(tab.id)) {
    if (await shouldResize(a)) {
      attachments.push(a);
    }
  }

  console.debug(`found ${inlineImages.length} inline images and ${attachments.length} image attachments`);
  if (inlineImages.length > 0 || attachments.length > 0) {
    await browser.composeAction.enable(tab.id);
    if (showPopup) {
      await browser.composeAction.openPopup({ windowId: tab.window });
    }
    return true;
  }
  browser.composeAction.disable(tab.id);
  return false;
}

// Attachment added to message.
browser.compose.onAttachmentAdded.addListener(async (tab) => {
  let { resizeAttachmentsOnSend } = await browser.storage.local.get({
    resizeAttachmentsOnSend: false,
  });
  updateEnabledState(tab, !resizeAttachmentsOnSend);
});

// Attachment removed from the message.
browser.compose.onAttachmentRemoved.addListener(tab => updateEnabledState(tab, false));

// Message sending.
browser.compose.onBeforeSend.addListener(async (tab, details) => {
  let result = {};
  let { resizeAttachmentsOnSend } = await browser.storage.local.get({
    resizeAttachmentsOnSend: false,
  });
  if (!resizeAttachmentsOnSend) {
    return result;
  }

  sendDeferred = Promise.withResolvers();
  if (await updateEnabledState(tab, true, true)) {
    await sendDeferred.promise.catch(() => (result.cancel = true));
  }

  return result;
});

// Clean up.
browser.tabs.onRemoved.addListener(tabId => {
  tabMap.delete(tabId);
});
