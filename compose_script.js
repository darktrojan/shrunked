let config = {
  attributes: false,
  childList: true,
  characterData: false,
  subtree: true,
};
let observer = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.addedNodes?.length) {
      console.debug("Nodes added to message: " + mutation.addedNodes.length);
      for (let target of mutation.addedNodes) {
        maybeResizeInline(target);
      }
    }
    if (mutation.removedNodes?.length) {
      console.debug("Nodes removed from message: " + mutation.addedNodes.length);
      for (let target of mutation.removedNodes) {
        if (target.matches("img") || target.querySelector("img")) {
          browser.runtime.sendMessage({ type: "updateEnabledState" });
        }
      }
    }
  }
});
observer.observe(document.body, config);

async function canResize(target) {
  console.debug("<IMG> found, source is " + target.src.substring(0, 100) + (target.src.length <= 100 ? "" : "\u2026"));
  if (target.closest(".moz-signature")) {
    console.debug("Not resizing - image is part of signature");
    return false;
  }
  if (target.closest("cite")) {
    console.debug("Not resizing - image is part of message being replied to");
    return false;
  }
  if (target.closest(".moz-forward-container")) {
    console.debug("Not resizing - image is part of forwarded message");
    return false;
  }
  if (target.hasAttribute("shrunked:resized")) {
    console.debug("Not resizing - image already has shrunked attribute");
    return false;
  }
  if (target.naturalWidth < 500 && target.naturalHeight < 500) {
    console.debug("Not resizing - image is too small");
    return false;
  }

  let src = target.getAttribute("src").toLowerCase();
  if (!src.startsWith("data:image/jpeg") && !src.endsWith(".jpg")) {
    console.debug("Not resizing - image is not JPEG");
    return false;
  }
  if (/^data:/.test(src)) {
    let srcSize = ((src.length - src.indexOf(",") - 1) * 3) / 4;
    if (src.endsWith("=")) {
      srcSize--;
      if (src.endsWith("==")) {
        srcSize--;
      }
    }
    let { fileSizeMinimum } = await browser.storage.local.get({
      fileSizeMinimum: 100,
    });
    if (srcSize < fileSizeMinimum * 1024) {
      console.debug("Not resizing - image file size is too small");
      return false;
    }
  }

  return true;
}

async function maybeResizeInline(target) {
  if (target.nodeName == "IMG") {
    try {
      if (!target.complete) {
        target.addEventListener(
          "load",
          () => {
            console.debug("Image now loaded, calling maybeResizeInline");
            maybeResizeInline(target);
          },
          { once: true }
        );
        console.debug("Image not yet loaded");
        return;
      }
      if (!(await canResize(target))) {
        return;
      }

      // All we have to do is open the pop-up, it'll do the rest.
      console.debug("Requesting resize");
      let destFile = await browser.runtime.sendMessage({
        type: "beginResize",
      });
    } catch (ex) {
      console.error(ex);
    }
  } else if (target.nodeType == Node.ELEMENT_NODE) {
    console.debug("<" + target.nodeName + "> found, checking children");
    for (let child of target.children) {
      maybeResizeInline(child);
    }
  }
}

let nextShrunkedId = 1;

browser.runtime.onMessage.addListener(async function(message, sender, sendResponse) {
  // Pop-up requesting images to resize.
  if (message.type == "listInlineImages") {
    return listInlineImages(message.ignoreResized);
  }
  // Pop-up returning resized images.
  if (message.type == "resizeInlineImages") {
    return resizeInlineImages(message.resized);
  }
});

async function listInlineImages(ignoreResized) {
  let inlineImages = [];
  for (let img of document.body.querySelectorAll("img")) {
    if (!img.complete) {
      continue;
    }
    if (!(await canResize(img))) {
      continue;
    }
    if (img._shrunkedOriginalFile) {
      if (ignoreResized) {
        continue;
      }
    } else {
      let src = img.getAttribute("src");
      let response = await fetch(src);
      let srcBlob = await response.blob();

      let srcName = "";
      let nameParts = img.src.match(/;filename=([^,;]*)[,;]/);
      if (nameParts) {
        srcName = decodeURIComponent(nameParts[1]);
      }
      img._shrunkedOriginalFile = new File([srcBlob], srcName);
    }
    if (!img._shrunkedId) {
      img._shrunkedId = nextShrunkedId++;
    }
    inlineImages.push({
      file: img._shrunkedOriginalFile,
      shrunkedId: img._shrunkedId,
    });
  }
  return inlineImages;
}

async function resizeInlineImages(resized) {
  for (let resizedImage of resized) {
    for (let img of document.body.querySelectorAll("img")) {
      if (img._shrunkedId == resizedImage.shrunkedId) {
        img.src = resizedImage.destURL;
        img.removeAttribute("width");
        img.removeAttribute("height");
        break;
      }
    }
  }
}
