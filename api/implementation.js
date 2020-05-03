var { ExtensionCommon } = ChromeUtils.import('resource://gre/modules/ExtensionCommon.jsm');
var { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');

var resProto = Cc['@mozilla.org/network/protocol;1?name=resource'].getService(Ci.nsISubstitutingProtocolHandler);

var shrunked = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    resProto.setSubstitution('shrunked', Services.io.newURI('modules/', null, this.extension.rootURI));

    let { Shrunked } = ChromeUtils.import('resource://shrunked/Shrunked.jsm');
    context.callOnClose(this);

    return {
      shrunked: {
        async fileSizeMinimum() {
          console.log('fileSizeMinimum called');
          return Shrunked.fileSizeMinimum;
        },
        async imageIsJPEG(image) {
          console.log('imageIsJPEG called');
          let src = image.src.toLowerCase();
          return src.startsWith('data:image/jpeg') || src.endsWith('.jpg');
        },
        async resize(src) {
          let destFile = await Shrunked.resize(src, 500, 500, 85, 'test.jpg');
          return Shrunked.getURLFromFile(destFile, true);
        }
      },
    };
  }

  close() {
    Cu.unload('resource://shrunked/Shrunked.jsm');
    resProto.setSubstitution('shrunked', null);
  }
};
