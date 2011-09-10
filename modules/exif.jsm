var EXPORTED_SYMBOLS = ['Exif'];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var consoleService = Cc ["@mozilla.org/consoleservice;1"].getService (Ci.nsIConsoleService);
function dumpBytes (bytes) {
	var str = '';
	for (var i = 0; i < bytes.length; i++) {
		var chr = bytes.charCodeAt (i);
		str += Math.floor (chr / 16).toString (16) + (chr % 16).toString (16) + ' ';
	}
	consoleService.logStringMessage (str);
}

var Exif = {

	bigEndian: null,
	rIndex: 0,
	rBytes: null,
	sBytes: null,
	block1: null,
	block2: null,
	orientation: 0,

	read: function (sourceFile) {
		this.block1 = null;
		this.orientation = 0;

		var istream = Cc ["@mozilla.org/network/file-input-stream;1"].createInstance (Ci.nsIFileInputStream);
		istream.init (sourceFile, -1, -1, false);
		var bstream = Cc ["@mozilla.org/binaryinputstream;1"].createInstance (Ci.nsIBinaryInputStream);
		bstream.setInputStream (istream);

		try {
			this.rBytes = bstream.readBytes (4);
			if (this.rBytes.charCodeAt (2) == 0xff && this.rBytes.charCodeAt (3) == 0xe0) {
				// JFIF header, try next block
				this.rBytes = bstream.readBytes (2);
				var sectionSize = this.rBytes.charCodeAt (0) * 0x0100 + this.rBytes.charCodeAt (1);
				bstream.readBytes (sectionSize - 4); // we do it this way so that we
				this.rBytes = bstream.readBytes (4); // still have 4 bytes for the next if
			}
			if (this.rBytes.charCodeAt (2) != 0xff || this.rBytes.charCodeAt (3) != 0xe1) {
				// not an EXIF header
				return;
			}
			this.rBytes = bstream.readBytes (10);
			var sectionSize = this.rBytes.charCodeAt (0) * 0x0100 + this.rBytes.charCodeAt (1);
			this.bigEndian = this.rBytes.charCodeAt (8) == 0x4d;
			this.rBytes = bstream.readBytes (sectionSize);

			this.rIndex = 6;
			this.block1 = this.readSection ();

			if (this.block1 ['112']) {
				switch (this.block1 ['112'].value) {
				case 8:
					this.orientation = 90;
					break;
				case 3:
					this.orientation = 180;
					break;
				case 6:
					this.orientation = 270;
					break;
				}
			}

			if ('112' in this.block1) {
				delete this.block1 ['112'];
				this.block1.length--;
			}
			if ('11a' in this.block1) {
				delete this.block1 ['11a'];
				this.block1.length--;
			}
			if ('11b' in this.block1) {
				delete this.block1 ['11b'];
				this.block1.length--;
			}
			if ('128' in this.block1) {
				delete this.block1 ['128'];
				this.block1.length--;
			}
			if ('213' in this.block1) {
				delete this.block1 ['213'];
				this.block1.length--;
			}

			this.rIndex = this.block1 ['8769'].value - 2;
			this.block2 = this.readSection ();
			this.block2 ['a210'].value = 1;
		} catch (e) {
			Cu.reportError (e);
			this.block1 = null;
			this.orientation = 0;
		} finally {
			this.rBytes = null;
			this.rIndex = 0;
			bstream.close ();
			istream.close ();
		}
	},

	read2Bytes: function () {
		if (this.bigEndian) {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt (this.rIndex++);
		} else {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) +
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100;
		}
		return s;
	},

	read4Bytes: function () {
		if (this.bigEndian) {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) * 0x01000000 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x010000 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt (this.rIndex++);
		} else {
			var s =
				this.rBytes.charCodeAt (this.rIndex++) +
				this.rBytes.charCodeAt (this.rIndex++) * 0x0100 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x010000 +
				this.rBytes.charCodeAt (this.rIndex++) * 0x01000000;
		}
		return s;
	},

	readSection: function () {
		var itemCount = this.read2Bytes ();
		var data = {
			length: itemCount
		};
		for (var i = 0; i < itemCount; i++) {
			var code = this.read2Bytes ().toString (16);
			var type = this.read2Bytes ();
			var count = this.read4Bytes ();
			var value = this.read4Bytes ();
			data [code] = {
				type: type,
				count: count,
				value: value
			}
			switch (type) {
			case 2:
				var str = this.rBytes.substring (value - 2, value + count - 3);
				data [code].str = str;
				break;
			case 5:
			case 10:
			case 12:
				var str = this.rBytes.substring (value - 2, value + 6);
				data [code].str = str;
				break;
			}
		}
		return data;
	},

	serialize2Bytes: function (s, forceBigEndian) {
		var bE = this.bigEndian;
		if (typeof forceBigEndian == 'boolean') {
			bE = forceBigEndian;
		}
		if (bE) {
			this.sBytes.push ((s & 0xff00) >> 8);
			this.sBytes.push (s & 0x00ff);
		} else {
			this.sBytes.push (s & 0x00ff);
			this.sBytes.push ((s & 0xff00) >> 8);
		}
	},

	serialize4Bytes: function (s) {
		if (this.bigEndian) {
			this.sBytes.push ((s & 0xff000000) >> 24);
			this.sBytes.push ((s & 0x00ff0000) >> 16);
			this.sBytes.push ((s & 0x0000ff00) >> 8);
			this.sBytes.push (s & 0x000000ff);
		} else {
			this.sBytes.push (s & 0x000000ff);
			this.sBytes.push ((s & 0x0000ff00) >> 8);
			this.sBytes.push ((s & 0x00ff0000) >> 16);
			this.sBytes.push ((s & 0xff000000) >> 24);
		}
	},

	serializeAscii: function (s) {
		for (var i = 0; i < s.length; i++) {
			this.sBytes.push (s.charCodeAt (i));
		}
	},

	serialize: function () {
		this.sBytes = [];

		this.serialize2Bytes (0xFFD8, true); // SOI marker
		this.serialize2Bytes (0xFFE1, true); // APP1 marker
		this.serialize2Bytes (0x0000, true); // APP1 size FIXME
		this.serializeAscii ('Exif'); // Exif
		this.serialize2Bytes (0x0000, true);
		if (this.bigEndian) {
			this.serializeAscii ('MM');
		} else {
			this.serializeAscii ('II');
		}
		this.serialize2Bytes (0x2A);
		this.serialize4Bytes (0x08);

		var extraData = '';
		var extraDataCounter = this.block1.length * 12 + 14;

		this.serialize2Bytes (this.block1.length);
		for (var e in this.block1) {
			if (e == 'length') continue;

			this.serialize2Bytes (parseInt (e, 16));
			this.serialize2Bytes (this.block1 [e].type);
			this.serialize4Bytes (this.block1 [e].count);
			if (this.block1 [e].type == 2) {
				this.serialize4Bytes (extraDataCounter);
				extraData += this.block1 [e].str + '\0';
				extraDataCounter += this.block1 [e].count;
			} else if (e == '8769') {
				this.serialize4Bytes (extraDataCounter);
			} else {
				this.serialize4Bytes (this.block1 [e].value);
			}
		}
		this.serialize4Bytes (0);
		this.serializeAscii (extraData);

		extraData = '';
		extraDataCounter += this.block2.length * 12 + 6;

		this.serialize2Bytes (this.block2.length);
		for (var e in this.block2) {
			if (e == 'length') continue;

			this.serialize2Bytes (parseInt (e, 16));
			this.serialize2Bytes (this.block2 [e].type);
			this.serialize4Bytes (this.block2 [e].count);
			switch (this.block2 [e].type) {
			case 2:
				this.serialize4Bytes (extraDataCounter);
				extraData += this.block2 [e].str + '\0';
				extraDataCounter += this.block2 [e].count;
				break;
			case 5:
			case 10:
			case 12:
				this.serialize4Bytes (extraDataCounter);
				extraData += this.block2 [e].str;
				extraDataCounter += 8;
				break;
			default:
				this.serialize4Bytes (this.block2 [e].value);
				break;
			}
		}
		this.serialize4Bytes (0);
		this.serializeAscii (extraData);

		var length = extraDataCounter + 8;
		this.sBytes [4] = (length & 0xff00) >> 8;
		this.sBytes [5] = length & 0x00ff;
	}
};
