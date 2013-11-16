
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


const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

function startup(aData, aReason) {
	if (aReason == ADDON_UPGRADE) {}

	// Register resource://
	var res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
	let alias = Services.io.newFileURI(aData.installPath);
	if (!aData.installPath.isDirectory()) {
		alias = Services.io.newURI("jar:" + alias.spec + "!/", null, null);
	}
	alias.path += 'modules/';
	res.setSubstitution("superdrag", alias);

	// import the component(s)
	Cu.import('resource://superdrag/superdrag.js');

	var logger = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService);
	logger.logStringMessage('dump SuperDrag:');
	for (var k in SuperDrag) {
		var prefix = '   ';
		if (typeof SuperDrag[k] == 'function') {
			prefix = ' (f)';
		}
		logger.logStringMessage(prefix + k);
	}

	SuperDrag.init();
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) {
		return;
	}

	if (aReason == ADDON_DISABLE) {}
	if (aReason == ADDON_UNINSTALL) {}
	if (aReason == ADDON_UPGRADE) {}

	SuperDrag.shutdown();

	// Unload the component(s).
	Cu.unload('resource://superdrag/superdrag.js');

	// Unregister resource://
	let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
	resource.setSubstitution("superdrag", null);
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}


