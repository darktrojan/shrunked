const { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
const {
  ExtensionUtils: { ExtensionError },
} = ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const resProto = Cc["@mozilla.org/network/protocol;1?name=resource"].getService(
  Ci.nsISubstitutingProtocolHandler
);

var shrunked = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    resProto.setSubstitution(
      "shrunked",
      Services.io.newURI("modules/", null, this.extension.rootURI)
    );
    resProto.setSubstitution(
      "shrunkedcontent",
      Services.io.newURI("content/", null, this.extension.rootURI)
    );

    let { ShrunkedImage } = ChromeUtils.import("resource://shrunked/ShrunkedImage.jsm");
    // context.callOnClose(this);

    // console.log(context);
    let { extension } = context;
    let { localeData, tabManager } = extension;

    return {
      shrunked: {
        onNotificationAccepted: new ExtensionCommon.EventManager({
          context,
          name: "myapi.onNotificationAccepted",
          register(fire) {
            function callback(event, tab) {
              return fire.async(tab);
            }

            context.extension.on("shrunked-accepted", callback);
            return function() {
              context.extension.off("shrunked-accepted", callback);
            };
          },
        }).api(),
        onNotificationCancelled: new ExtensionCommon.EventManager({
          context,
          name: "myapi.onNotificationCancelled",
          register(fire) {
            function callback(event, tab) {
              return fire.async(tab);
            }

            context.extension.on("shrunked-cancelled", callback);
            return function() {
              context.extension.off("shrunked-cancelled", callback);
            };
          },
        }).api(),

        migrateSettings() {
          let prefsToStore = { version: context.extension.version };
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

          branch.setCharPref("version", context.extension.version);
          return prefsToStore;
        },
        showNotification(tab, imageCount) {
          return new Promise((resolve, reject) => {
            console.log("Showing resize notification");

            let question = localeData.localizeMessage(
              imageCount == 1 ? "question.single" : "question.plural"
            );

            let nativeTab = tabManager.get(tab.id).nativeTab;
            let notifyBox = nativeTab.gNotification.notificationbox;
            let notification = notifyBox.getNotificationWithValue("shrunked-notification");
            if (notification) {
              console.log("Notification already visible");
              notification._promises.push({ resolve, reject });
              notification.label = question;
              return;
            }

            let buttons = [
              {
                accessKey: localeData.localizeMessage("yes.accesskey"),
                callback: () => {
                  console.log("Resizing started");
                  // for (let promise of notification._promises) {
                  // 	promise.resolve();
                  // }
                  context.extension.emit("shrunked-accepted", tab);
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
                  context.extension.emit("shrunked-cancelled", tab);
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
          return new ShrunkedImage(file, maxWidth, maxHeight, quality, options).resize();
        },
        async estimateSize(file, maxWidth, maxHeight, quality) {
          return new ShrunkedImage(file, maxWidth, maxHeight, quality).estimateSize();
        },
      },
    };
  }

  // close() {
  // 	console.log(Components.stack.formattedStack)
  // 	Cu.unload('resource://shrunked/Shrunked.jsm');
  // 	resProto.setSubstitution('shrunked', null);
  // 	resProto.setSubstitution('shrunkedcontent', null);
  // }
};
