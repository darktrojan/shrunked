const { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
const { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");
const {
  ExtensionUtils: { ExtensionError },
} = ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const resProto = Cc["@mozilla.org/network/protocol;1?name=resource"].getService(
  Ci.nsISubstitutingProtocolHandler
);

let ready = false;

var shrunked = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    let { extension } = context;
    let { localeData, tabManager } = extension;

    if (!ready) {
      ready = true;

      resProto.setSubstitution(
        "shrunked",
        Services.io.newURI("modules/", null, this.extension.rootURI)
      );

      ExtensionSupport.registerWindowListener("ext-shrunked-compose", {
        chromeURLs: ["chrome://messenger/content/messengercompose/messengercompose.xhtml"],
        onLoadWindow(window) {
          let attachmentContext = window.document.getElementById("msgComposeAttachmentItemContext");
          if (!attachmentContext) {
            return;
          }

          let indicies = [];
          let menuItem = attachmentContext.insertBefore(
            window.document.createXULElement("menuitem"),
            window.document.getElementById("composeAttachmentContext_renameItem")
          );
          menuItem.id = "shrunked-attachment-context-item";

          attachmentContext.addEventListener("popupshowing", function() {
            console.log("Context menu on attachments");
            indicies.length = 0;
            let items = window.document.getElementById("attachmentBucket").itemChildren;
            for (let i = 0; i < items.length; i++) {
              if (!items[i].selected) {
                continue;
              }
              let attachment = items[i].attachment;
              if (
                attachment.url.startsWith("data:image/jpeg;") ||
                /\.jpe?g$/i.test(
                  attachment.url
                ) /* &&
                attachment.size >= Shrunked.fileSizeMinimum*/
              ) {
                indicies.push(i);
              }
            }

            menuItem.hidden = !indicies.length;
            if (!indicies.length) {
              console.log("Not resizing - no attachments were JPEG and large enough");
            } else if (indicies.length == 1) {
              menuItem.label = localeData.localizeMessage("context.single");
            } else {
              menuItem.label = localeData.localizeMessage("context.plural");
            }
          });

          menuItem.addEventListener("command", () => {
            extension.emit("shrunked-attachment-context", window, indicies);
          });
        },
      });

      context.callOnClose(this);
    }

    return {
      shrunked: {
        onNotificationAccepted: new ExtensionCommon.EventManager({
          context,
          name: "shrunked.onNotificationAccepted",
          register(fire) {
            function callback(event, tab) {
              return fire.async(tab);
            }

            extension.on("shrunked-accepted", callback);
            return function() {
              extension.off("shrunked-accepted", callback);
            };
          },
        }).api(),
        onNotificationCancelled: new ExtensionCommon.EventManager({
          context,
          name: "shrunked.onNotificationCancelled",
          register(fire) {
            function callback(event, tab) {
              return fire.async(tab);
            }

            extension.on("shrunked-cancelled", callback);
            return function() {
              extension.off("shrunked-cancelled", callback);
            };
          },
        }).api(),
        onAttachmentContextClicked: new ExtensionCommon.EventManager({
          context,
          name: "shrunked.onAttachmentContextClicked",
          register(fire) {
            function callback(event, window, indicies) {
              let tab = extension.tabManager.getWrapper(window);
              return fire.async(tab.convert(), indicies);
            }

            extension.on("shrunked-attachment-context", callback);
            return function() {
              extension.off("shrunked-attachment-context", callback);
            };
          },
        }).api(),

        migrateSettings() {
          let prefsToStore = { version: extension.version };
          let branch = Services.prefs.getBranch("extensions.shrunked.");

          if (Services.vc.compare(branch.getCharPref("version", "5"), "5") >= 0) {
            return prefsToStore;
          }

          let defaultPrefs = {
            "default.maxWidth": 500,
            "default.maxHeight": 500,
            "default.quality": 75,
            "default.saveDefault": true,
            fileSizeMinimum: 100,
            "log.enabled": false,
            "options.exif": true,
            "options.orientation": true,
            "options.gps": true,
            "options.resample": true,
            resizeAttachmentsOnSend: false,
          };

          for (let [key, defaultValue] of Object.entries(defaultPrefs)) {
            if (!branch.prefHasUserValue(key)) {
              continue;
            }

            let value;
            if (typeof defaultValue == "boolean") {
              value = branch.getBoolPref(key);
            } else if (typeof defaultValue == "number") {
              value = branch.getIntPref(key);
            } else {
              value = branch.getCharPref(key);
            }
            if (value != defaultValue) {
              prefsToStore[key] = value;
            }
          }

          branch.setCharPref("version", extension.version);
          return prefsToStore;
        },
        showNotification(tab, imageCount) {
          return new Promise((resolve, reject) => {
            let question = localeData.localizeMessage(
              imageCount == 1 ? "question.single" : "question.plural"
            );

            let nativeTab = tabManager.get(tab.id).nativeTab;
            let notifyBox = nativeTab.gNotification.notificationbox;
            let notification = notifyBox.getNotificationWithValue("shrunked-notification");
            if (notification) {
              if (imageCount == 0) {
                console.log("Removing resize notification");
                notifyBox.removeNotification(notification);
              } else {
                console.log("Resize notification already visible");
                notification._promises.push({ resolve, reject });
                notification.label = question;
              }
              return;
            }

            console.log("Showing resize notification");

            let buttons = [
              {
                accessKey: localeData.localizeMessage("yes.accesskey"),
                callback: () => {
                  console.log("Resizing started");
                  // for (let promise of notification._promises) {
                  // 	promise.resolve();
                  // }
                  extension.emit("shrunked-accepted", tab);
                },
                label: localeData.localizeMessage("yes.label"),
              },
              {
                accessKey: localeData.localizeMessage("no.accesskey"),
                callback() {
                  console.log("Resizing cancelled");
                  // for (let promise of notification._promises) {
                  // 	promise.reject();
                  // }
                  // callbackObject.onResizeCancelled();
                  extension.emit("shrunked-cancelled", tab);
                },
                label: localeData.localizeMessage("no.label"),
              },
            ];

            notification = notifyBox.appendNotification(
              question,
              "shrunked-notification",
              null,
              notifyBox.PRIORITY_INFO_HIGH,
              buttons
            );
            notification._promises = [{ resolve, reject }];
          });
        },
        async resizeFile(file, maxWidth, maxHeight, quality, options) {
          const { ShrunkedImage } = ChromeUtils.import("resource://shrunked/ShrunkedImage.jsm");
          return new ShrunkedImage(file, maxWidth, maxHeight, quality, options).resize();
        },
        async estimateSize(file, maxWidth, maxHeight, quality) {
          const { ShrunkedImage } = ChromeUtils.import("resource://shrunked/ShrunkedImage.jsm");
          return new ShrunkedImage(file, maxWidth, maxHeight, quality).estimateSize();
        },
      },
    };
  }

  close() {
    resProto.setSubstitution("shrunked", null);

    ExtensionSupport.unregisterWindowListener("ext-shrunked-compose");

    for (let window of Services.wm.getEnumerator("msgcompose")) {
      let menuItem = window.document.getElementById("shrunked-attachment-context-item");
      if (menuItem) {
        menuItem.remove();
      }
    }
  }
};
