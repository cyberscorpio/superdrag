
// data
// {
// 	string    id;
// 	string    version;
// 	nsIFile   installPath;
// 	nsIURI    resourceURI; // jar: or file: 
// 	string    oldVersion; // Gecko 22.0
// 	string    newVersion; // Gecko 22.0
// }

// aReason
// const APP_STARTUP       = 1;
// const APP_SHUTDOWN      = 2;
// const ADDON_ENABLE      = 3;
// const ADDON_DISABLE     = 4;
// const ADDON_INSTALL     = 5;
// const ADDON_UNINSTALL   = 6;
// const ADDON_UPGRADE     = 7;
// const ADDON_DOWNGRADE   = 8;

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

var SUPERDRAG_MODULES = [
	'resource://superdrag/superdrag.js',
	'resource://superdrag/prefloader.js',
//	'resource://superdrag/utils.js',
];
var logger = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService);

Cu.import("resource://gre/modules/Services.jsm");

function startup(aData, aReason) {
	if (aReason == ADDON_UPGRADE || aReason == ADDON_DOWNGRADE) {
		// to make sure that the new bundle can be loaded correctly
		Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).flushBundles();
	}

	// Register resource://
	var res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
	var alias = Services.io.newURI(__SCRIPT_URI_SPEC__ + "/../modules/", null, null);
	res.setSubstitution("superdrag", alias);

	// import the component(s)
	Cu.import('resource://superdrag/prefloader.js'); {
		PrefLoader.load(aData.installPath, 'defaults.js');
	}
	Cu.import('resource://superdrag/superdrag.js');

//	logger.logStringMessage('dump SuperDrag:');
//	for (var k in SuperDrag) {
//		var prefix = '   ';
//		if (typeof SuperDrag[k] == 'function') {
//			prefix = ' (f)';
//		}
//		logger.logStringMessage(prefix + k);
//	}

	SuperDrag.init(aReason);
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) {
		return;
	}

	if (aReason == ADDON_DISABLE) {}
	if (aReason == ADDON_UNINSTALL) {}
	if (aReason == ADDON_UPGRADE) {}

	SuperDrag.shutdown();
	PrefLoader.clear();

	// Unload the component(s).
	SUPERDRAG_MODULES.forEach(Cu.unload, Cu);

	// Unregister resource://
	let res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
	res.setSubstitution("superdrag", null);

	logger = null;
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}

