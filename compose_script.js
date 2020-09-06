let config = { attributes: false, childList: true, characterData: false, subtree: true };
let observer = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.addedNodes && mutation.addedNodes.length) {
      console.log('Nodes added to message: ' + mutation.addedNodes.length);
      for (let target of mutation.addedNodes) {
        maybeResizeInline(target);
      }
    }
  }
});
observer.observe(document.body, config);

async function maybeResizeInline(target) {
  if (target.nodeName == 'IMG') {
    try {
      console.log('<IMG> found, source is ' + target.src.substring(0, 100) + (target.src.length <= 100 ? '' : '\u2026'));
      let parent = target.parentNode;
      while (parent && 'classList' in parent) {
        if (parent.classList.contains('moz-signature')) {
          console.log('Not resizing - image is part of signature');
          return;
        }
        if (parent.getAttribute('type') == 'cite') {
          console.log('Not resizing - image is part of message being replied to');
          return;
        }
        if (parent.classList.contains('moz-forward-container')) {
          console.log('Not resizing - image is part of forwarded message');
          return;
        }
        parent = parent.parentNode;
      }

      if (!target.complete) {
        target.addEventListener('load', () => {
          console.log('Image now loaded, calling maybeResizeInline');
          maybeResizeInline(target);
        }, { once: true });
        console.log('Image not yet loaded');
        return;
      }

      if (target.hasAttribute('shrunked:resized')) {
        console.log('Not resizing - image already has shrunked attribute');
        return;
      }
      if (!imageIsJPEG(target)) {
        console.log('Not resizing - image is not JPEG');
        return;
      }
      if (target.width < 500 && target.height < 500) {
        console.log('Not resizing - image is too small');
        return;
      }

      let src = target.getAttribute('src');
      if (/^data:/.test(src)) {
        let srcSize = (src.length - src.indexOf(',') - 1) * 3 / 4;
        if (src.endsWith('=')) {
          srcSize--;
          if (src.endsWith('==')) {
            srcSize--;
          }
        }
        if (srcSize < fileSizeMinimum) {
          console.log('Not resizing - image file size is too small');
          return;
        }
      }

      let dest = await browser.runtime.sendMessage({ type: "resizeURL", src});
      target.setAttribute('src', dest);
      target.removeAttribute('width');
      target.removeAttribute('height');
      target.setAttribute('shrunked:resized', 'true');
    } catch (ex) {
      console.error(ex);
    }
  } else if (target.nodeType == Node.ELEMENT_NODE) {
    console.log('<' + target.nodeName + '> found, checking children');
    for (let child of target.children) {
      maybeResizeInline(child);
    }
  }
}

const fileSizeMinimum = 100 * 1024;
function imageIsJPEG(image) {
  let src = image.src.toLowerCase();
  return src.startsWith('data:image/jpeg') || src.endsWith('.jpg');
}
