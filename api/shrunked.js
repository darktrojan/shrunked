var { ExtensionCommon } = ChromeUtils.import('resource://gre/modules/ExtensionCommon.jsm');
var { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');

var resProto = Cc['@mozilla.org/network/protocol;1?name=resource'].getService(Ci.nsISubstitutingProtocolHandler);

var shrunked = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    resProto.setSubstitution('shrunked', Services.io.newURI('modules/', null, this.extension.rootURI));

    let { Shrunked } = ChromeUtils.import('resource://shrunked/Shrunked.jsm');
    context.callOnClose(this);

    let { tabManager } = context.extension;

    return {
      shrunked: {
        async resizeURL(url) {
          let destFile = await Shrunked.resize(url, 500, 500, 85, 'test.jpg');
          return Shrunked.getURLFromFile(destFile, true);
        },
        async resizeFile(file) {
          let sourceFile = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
          sourceFile.initWithPath(file.mozFullPath);
          let destFile = await Shrunked.resize(sourceFile, 500, 500, 85, sourceFile.leafName);
          return destFile;
        },
        async handleSend(tab) {
          let { nativeTab } = tabManager.get(tab.id);
          let { attachments } = nativeTab.gMsgCompose.compFields;

          for (let attachment of attachments) {
            if (attachment.sendViaCloud) {
              continue;
            }

            if (attachment.url.toLowerCase().endsWith('.jpg')) {
              let destFile = await Shrunked.resize(attachment.url, 500, 500, 85, 'test.jpg');
              attachment.url = await Shrunked.getURLFromFile(destFile, true);
            }
          }
        },
        async fileSizeMinimum() {
          console.log('fileSizeMinimum called');
          return Shrunked.fileSizeMinimum;
        },
        async imageIsJPEG(image) {
          console.log('imageIsJPEG called');
          let src = image.src.toLowerCase();
          return src.startsWith('data:image/jpeg') || src.endsWith('.jpg');
        },
      },
    };
  }

  close() {
    Cu.unload('resource://shrunked/Shrunked.jsm');
    resProto.setSubstitution('shrunked', null);
  }
};
