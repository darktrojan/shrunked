var XHTMLNS = "http://www.w3.org/1999/xhtml";

class ShrunkedImage {
  constructor(source, maxWidth, maxHeight, quality, options) {
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
    this.quality = quality;
    this.options = {
      exif: true,
      orientation: true,
      gps: true,
      resample: true,
      ...options,
    };

    if (typeof source == "string") {
      this.sourceURI = Services.io.newURI(source);
      if (this.sourceURI.schemeIs("file")) {
        let file = this.sourceURI.file;
        this.path = file.path;
        this.basename = file.leafName;
      } else if (this.sourceURI.schemeIs("data")) {
        let meta = source.substring(0, source.indexOf(",")).split(";");
        for (let part of meta) {
          if (part.startsWith("filename=")) {
            this.basename = decodeURIComponent(part.substring(9));
          }
        }
      } else {
        let match = /[?&]filename=([\w.-]+)/.exec(this.sourceURI.spec);
        if (match) {
          this.basename = match[1];
        } else {
          match = /\/([\w.-]+\.jpg)$/i.exec(this.sourceURI.spec);
          if (match) {
            this.basename = match[1];
          }
        }
      }
    } else if (source instanceof File) {
      this.sourceURI = URL.createObjectURL(source);
      this.basename = source.name;
    }

    if (!this.sourceURI) {
      throw new Error("Unexpected source passed to ShrunkedImage");
    }
  }

  async resizeAsFile() {
    let canvas = await this.#resize();
    let blob = await this.getBytes(canvas);
    return new File([blob], this.basename, { type: "image/jpeg" });
  }

  async resizeAsDataURL() {
    let canvas = await this.#resize();
    return canvas.toDataURL("image/jpeg", this.quality / 100);
  }

  async #resize() {
    let orientation = 0;
    if (this.options.exif) {
      await this.readExifData();
      if (this.options.orientation && this.exifData) {
        orientation = this.exifData.orientation;
      }
    }
    let image = await this.loadImage();
    let canvas = await this.drawOnCanvas(image, orientation);

    if (this.exifData && this.exifData.exif2 && this.exifData.exif2.a002) {
      this.exifData.exif2.a002.value = canvas.width;
      this.exifData.exif2.a003.value = canvas.height;
    }

    return canvas;
  }

  async readExifData() {
    try {
      let readable;
      if (this.sourceURI.startsWith("file:")) {
        readable = await IOUtils.read(this.path);
      } else {
        readable = await Readable(this.sourceURI);
      }

      this.exifData = new ExifData(this.options.gps);
      await this.exifData.read(readable);
    } catch (ex) {
      console.warn(ex);
      delete this.exifData;
    }
  }

  loadImage() {
    return new Promise((resolve, reject) => {
      let image = document.createElementNS(XHTMLNS, "img");
      image.onload = function() {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=574330#c54
        if (!image.complete) {
          image.src = image.src; // eslint-disable-line no-self-assign
          return;
        }
        resolve(image);
      };
      image.onerror = reject;
      image.src = this.sourceURI;
    });
  }

  drawOnCanvas(image, orientation, resample = true) {
    return new Promise(resolve => {
      let ratio = Math.max(1, image.width / this.maxWidth, image.height / this.maxHeight);
      let resampleRatio = 1;
      if (resample && this.options.resample) {
        resampleRatio = Math.min(ratio, 3);
        if (resampleRatio > 2 && resampleRatio < 3) {
          resampleRatio = 2;
        }
      }

      let width = Math.floor(image.width / ratio);
      let height = Math.floor(image.height / ratio);

      if (orientation == 90 || orientation == 270) {
        [width, height] = [height, width];
      }

      let canvas = document.createElementNS(XHTMLNS, "canvas");
      canvas.width = Math.floor(width * resampleRatio);
      canvas.height = Math.floor(height * resampleRatio);

      let context = canvas.getContext("2d");
      if (orientation == 90) {
        context.translate(0, canvas.height);
        context.rotate(-0.5 * Math.PI);
      } else if (orientation == 180) {
        context.translate(canvas.width, canvas.height);
        context.rotate(Math.PI);
      } else if (orientation == 270) {
        context.translate(canvas.width, 0);
        context.rotate(0.5 * Math.PI);
      }
      context.drawImage(
        image,
        0,
        0,
        (image.width / ratio) * resampleRatio,
        (image.height / ratio) * resampleRatio
      );

      if (resampleRatio > 1) {
        let oldData = context.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = width;
        canvas.height = height;
        let newData = context.createImageData(canvas.width, canvas.height);

        if (resampleRatio == 3) {
          nineResample(oldData, newData);
        } else if (resampleRatio == 2) {
          fourResample(oldData, newData);
        } else {
          floatResample(oldData, newData, resampleRatio);
        }

        context.putImageData(newData, 0, 0);
        resolve(canvas);
      } else {
        resolve(canvas);
      }
    });
  }

  getBytes(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        function(blob) {
          try {
            resolve(blob);
          } catch (ex) {
            reject(ex);
          }
        },
        "image/jpeg",
        this.quality / 100
      );
    });
  }

  estimateSize() {
    return this.loadImage()
      .then(image => this.drawOnCanvas(image, 0, false))
      .then(canvas => this.getBytes(canvas))
      .then(bytes => bytes.size);
  }
}

async function Readable(url) {
  let response = await fetch(url);
  let bytes = await response.arrayBuffer();

  return {
    data: new Uint8Array(bytes),
    pointer: 0,
    read(count) {
      let result;
      if (count) {
        result = this.data.subarray(this.pointer, this.pointer + count);
        this.pointer += count;
      } else {
        result = this.data.subarray(this.pointer);
        this.pointer = this.data.length;
      }
      return result;
    },
    setPosition(position) {
      this.pointer = position;
    },
    close() {
      delete this.data;
    },
  };
}

function nineResample(oldData, newData) {
  let oldPix = oldData.data;
  let oldWidth = oldData.width;
  let newPix = newData.data;
  let newLength = newPix.length;

  let rowLength = oldWidth * 4;
  let rowLengthTimes2 = rowLength * 2;
  let row0 = 0;
  let row1 = rowLength;
  let row2 = rowLengthTimes2;

  let r, g, b, nextRow;
  let offset = 0;
  while (offset < newLength) {
    nextRow = row1;
    while (row0 < nextRow) {
      r = g = b = 0;

      r += oldPix[row0++];
      g += oldPix[row0++];
      b += oldPix[row0++];
      row0++;
      r += oldPix[row0++];
      g += oldPix[row0++];
      b += oldPix[row0++];
      row0++;
      r += oldPix[row0++];
      g += oldPix[row0++];
      b += oldPix[row0++];
      row0++;

      r += oldPix[row1++];
      g += oldPix[row1++];
      b += oldPix[row1++];
      row1++;
      r += oldPix[row1++];
      g += oldPix[row1++];
      b += oldPix[row1++];
      row1++;
      r += oldPix[row1++];
      g += oldPix[row1++];
      b += oldPix[row1++];
      row1++;

      r += oldPix[row2++];
      g += oldPix[row2++];
      b += oldPix[row2++];
      row2++;
      r += oldPix[row2++];
      g += oldPix[row2++];
      b += oldPix[row2++];
      row2++;
      r += oldPix[row2++];
      g += oldPix[row2++];
      b += oldPix[row2++];
      row2++;

      newPix[offset++] = r * 0.11111;
      newPix[offset++] = g * 0.11111;
      newPix[offset++] = b * 0.11111;
      newPix[offset++] = 255;
    }
    row0 += rowLengthTimes2;
    row1 += rowLengthTimes2;
    row2 += rowLengthTimes2;
  }
}

function fourResample(oldData, newData) {
  let oldPix = oldData.data;
  let oldWidth = oldData.width;
  let newPix = newData.data;
  let newLength = newPix.length;

  let rowLength = oldWidth * 4;
  let row0 = 0;
  let row1 = rowLength;

  let r, g, b, nextRow;
  let offset = 0;
  while (offset < newLength) {
    nextRow = row1;
    while (row0 < nextRow) {
      r = g = b = 0;

      r += oldPix[row0++];
      g += oldPix[row0++];
      b += oldPix[row0++];
      row0++;
      r += oldPix[row0++];
      g += oldPix[row0++];
      b += oldPix[row0++];
      row0++;

      r += oldPix[row1++];
      g += oldPix[row1++];
      b += oldPix[row1++];
      row1++;
      r += oldPix[row1++];
      g += oldPix[row1++];
      b += oldPix[row1++];
      row1++;

      newPix[offset++] = r * 0.25;
      newPix[offset++] = g * 0.25;
      newPix[offset++] = b * 0.25;
      newPix[offset++] = 255;
    }
    row0 += rowLength;
    row1 += rowLength;
  }
}

function floatResample(oldData, newData, ratio) {
  let oldPix = oldData.data;
  let oldWidth = oldData.width;
  let newPix = newData.data;
  let newWidth = newData.width;
  let newHeight = newData.height;

  let y, startY, endY, oldY;
  let x, startX, endX, oldX;
  let r, g, b, count, i, offset;
  let newIndex = 0;

  endY = 0;
  for (y = 1; y <= newHeight; ++y) {
    startY = endY;
    endY = Math.floor(y * ratio);

    endX = 0;
    for (x = 1; x <= newWidth; ++x) {
      startX = endX;
      endX = Math.floor(x * ratio);

      r = g = b = 0;
      count = (endX - startX) * (endY - startY);
      i = startY * oldWidth;

      for (oldY = startY; oldY < endY; ++oldY) {
        for (oldX = startX; oldX < endX; ++oldX) {
          offset = (i + oldX) * 4;
          r += oldPix[offset++];
          g += oldPix[offset++];
          b += oldPix[offset++];
        }
        i += oldWidth;
      }

      newPix[newIndex++] = r / count;
      newPix[newIndex++] = g / count;
      newPix[newIndex++] = b / count;
      newPix[newIndex++] = 255;
    }
  }
}
