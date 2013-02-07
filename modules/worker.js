self.onmessage = function(event) {
	var oldData = event.data.oldData;
	var newData = event.data.newData;
	var ratio = event.data.ratio;
	var func = event.data.func;

	self[func](oldData, newData, ratio);

	self.postMessage(newData);
};

function nineResample(oldData, newData) {
	var oldPix = oldData.data;
	var oldWidth = oldData.width;
	var newPix = newData.data;
	var newLength = newPix.length;

	var rowLength = oldWidth * 4;
	var rowLengthTimes2 = rowLength * 2;
	var row0 = 0;
	var row1 = rowLength;
	var row2 = rowLengthTimes2;

	var r, g, b, nextRow;
	var offset = 0;
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
	var oldPix = oldData.data;
	var oldWidth = oldData.width;
	var newPix = newData.data;
	var newLength = newPix.length;

	var rowLength = oldWidth * 4;
	var row0 = 0;
	var row1 = rowLength;

	var r, g, b, nextRow;
	var offset = 0;
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
	var oldPix = oldData.data;
	var oldWidth = oldData.width;
	var oldHeight = oldData.height;
	var newPix = newData.data;
	var newWidth = newData.width;
	var newHeight = newData.height;

	var y, startY, endY, oldY;
	var x, startX, endX, oldX;
	var r, g, b, count, i, offset;
	var newIndex = 0;

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
