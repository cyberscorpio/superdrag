// Copy from Firebug / modules / prefLoader.js

var EXPORTED_SYMBOLS = ['PrefLoader'];

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;
Cu.import('resource://gre/modules/Services.jsm');

var PrefLoader = {
	prefDomain: 'extensions.superdrag.',
	load: function(path, fileName) {
		try {
			let uri;
			let baseURI = Services.io.newFileURI(path);
	
			if (path.isDirectory()) {
				uri = Services.io.newURI('defaults/preferences/' + fileName, null, baseURI).spec;
			} else {
				uri = 'jar:' + baseURI.spec + '!/defaults/preferences/' + fileName;
			}
	
			Services.scriptloader.loadSubScript(uri, {pref: pref});

			// make sure all values are correct.
			let pb = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
			let map = {
				'newtab.pos': 'left',
				'newtab.pos': 'normal'
			};

			for (let k in map) {
				let v = map[k];
				k = this.prefDomain + k;
				if (pb.getCharPref(k) === v) {
					pb.clearUserPref(k);
				}
			}

		} catch (e) {
			Cu.reportError(e);
		}
	},

	clear: function(domain) {
		domain = domain || this.prefDomain;
		let pb = Services.prefs.getDefaultBranch(domain);
	
		let names = pb.getChildList('');
		for (let i = 0; i < names.length; ++ i) {
			let name = names[i];
			if (!pb.prefHasUserValue(name)) {
				pb.deleteBranch(name);
			}
		}
	}
};

function pref(name, value) {
	try {
		let branch = Services.prefs.getDefaultBranch('');

		switch (typeof value) {
		case 'boolean':
			branch.setBoolPref(name, value);
			break;

		case 'number':
			branch.setIntPref(name, value);
			break;

		case 'string':
			var str = Cc['@mozilla.org/supports-string;1'].createInstance(Ci.nsISupportsString);
			str.data = value;
			branch.setComplexValue(name, Ci.nsISupportsString, str);
			break;
		}
	} catch (e) {
		Cu.reportError('prefloader.pref; SuperDrag can\'t set default pref value for: ' + name);
	}
}

