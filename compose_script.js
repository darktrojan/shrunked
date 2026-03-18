let config = {
  attributes: false,
  childList: true,
  characterData: false,
  subtree: true,
};
let observer = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.addedNodes?.length) {
      console.log("Nodes added to message: " + mutation.addedNodes.length);
      for (let target of mutation.addedNodes) {
        maybeResizeInline(target);
      }
    }
    if (mutation.removedNodes?.length) {
      console.log("Nodes removed from message: " + mutation.addedNodes.length);
      for (let target of mutation.removedNodes) {
        if (target.matches("img") || target.querySelector("img")) {
          browser.runtime.sendMessage({ type: "updateEnabledState" });
        }
      }
    }
  }
});
observer.observe(document.body, config);

async function maybeResizeInline(target) {
  if (target.nodeName == "IMG") {
    try {
      console.log("<IMG> found, source is " + target.src.substring(0, 100) + (target.src.length <= 100 ? "" : "\u2026"));
      let parent = target.parentNode;
      while (parent && "classList" in parent) {
        if (parent.classList.contains("moz-signature")) {
          console.log("Not resizing - image is part of signature");
          return;
        }
        if (parent.getAttribute("type") == "cite") {
          console.log("Not resizing - image is part of message being replied to");
          return;
        }
        if (parent.classList.contains("moz-forward-container")) {
          console.log("Not resizing - image is part of forwarded message");
          return;
        }
        parent = parent.parentNode;
      }

      if (!target.complete) {
        target.addEventListener(
          "load",
          () => {
            console.log("Image now loaded, calling maybeResizeInline");
            maybeResizeInline(target);
          },
          { once: true }
        );
        console.log("Image not yet loaded");
        return;
      }

      if (target.hasAttribute("shrunked:resized")) {
        console.log("Not resizing - image already has shrunked attribute");
        return;
      }
      if (!imageIsJPEG(target)) {
        console.log("Not resizing - image is not JPEG");
        return;
      }
      if (target.naturalWidth < 500 && target.naturalHeight < 500) {
        console.log("Not resizing - image is too small");
        return;
      }

      let src = target.getAttribute("src");
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
          console.log("Not resizing - image file size is too small");
          return;
        }
      }

      // All we have to do is open the pop-up, it'll do the rest.
      console.log("Requesting resize");
      let destFile = await browser.runtime.sendMessage({
        type: "beginResize",
      });
    } catch (ex) {
      console.error(ex);
    }
  } else if (target.nodeType == Node.ELEMENT_NODE) {
    console.log("<" + target.nodeName + "> found, checking children");
    for (let child of target.children) {
      maybeResizeInline(child);
    }
  }
}

function imageIsJPEG(image) {
  let src = image.src.toLowerCase();
  return src.startsWith("data:image/jpeg") || src.endsWith(".jpg");
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
    if (!imageIsJPEG(img)) {
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
