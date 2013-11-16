
var EXPORTED_SYMBOLS = ["SuperDrag"];

// utils
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

var SuperDrag = new function() {
	var that = this;
	var pcMsgs = {
		'dragstart': onStart,
		'dragover': onDragOver,
		'drop': onDrop,
		'dragend': onDragEnd,
	};

	// -------------------------------------------------------------------------------- 
	// methods
	this.init = function() {
		var enumerator = Services.wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			inUninstall(win, false);
		}
	
		// Listen for new windows
		Services.obs.addObserver(windowWatcher, "chrome-document-global-created", false);
	};

	this.shutdown = function() {
		var enumerator = Services.wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			inUninstall(win, true);
		}
		// Remove "new window" listener.
		Services.obs.removeObserver(windowWatcher, "chrome-document-global-created");
	};

	// Window Listener
	// (copied from firebug :)
	var windowWatcher = {
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
		observe: function windowWatcher(win, topic, data) {
			win.addEventListener('load', function onLoad(evt) {
				var win = evt.currentTarget;
				win.removeEventListener('load', onLoad, false);
				if (win.document.documentElement.getAttribute('windowtype') == 'navigator:browser') {
					inUninstall(win, false);
				}
			}, false);
		}
	};
	
	// install or uninstall
	function inUninstall(win, uninstall) {
		var tb = win.document.getElementById('content'); // TabBrowser
		if (tb != null) {
			var pc = tb.mPanelContainer;
			if (pc != null) {
				for (var k in pcMsgs) {
					if (uninstall) {
						pc.removeEventListener(k, pcMsgs[k], false);
					} else {
						pc.addEventListener(k, pcMsgs[k], false);
					}
				}
			}
		}
	}


	// -------------------------------------------------------------------------------- 
	// local variables
	var data = null;
	var div = null;
	var startPos = {
		x: 0,
		y: 0
	};

	// -------------------------------------------------------------------------------- 
	// local functions
	function onStart(evt) {
		/*
		var wm = getMainWindow();
		var tb = wm.document.getElementById('content');
		var tab = tb.selectedTab;
		var browser = tab.linkedBrowser;
		var doc = browser.contentDocument;
		*/
		try {
			var doc = getRootDoc(evt.target);


			div = doc.createElement('div');
			var st = div.style;
			st.width = '100px';
			st.height = '100px';
			st.position = 'fixed';
			st.backgroundColor = 'red';
			st.zIndex = '999999';
			var v = doc.documentElement;
			v.appendChild(div);

			// log('nodeType: ' + evt.target.nodeType);

			getPosFromElement(evt.target, evt.clientX, evt.clientY, startPos);
			st.left = startPos.x + 'px';
			st.top = startPos.y + 'px';
		} catch (e) {
			log(e);
		}
	}

	function onDragOver(evt) {
		if (div != null) {
			getPosFromElement(evt.target, evt.clientX, evt.clientY, startPos);
			div.style.left = startPos.x + 'px';
			div.style.top = startPos.y + 'px';
			evt.preventDefault();
		}
	}

	function onDrop(evt) {
		log('drop');
		if (div) {
			evt.preventDefault();
		}
	}

	function onDragEnd(evt) {
		log('end');
		cleanup();
	}

	function parseDataTranfer(evt) {
		var d = {};
		var dt = evt.dataTranfer;
		var el = evt.target;
		if (el.nodeType == 3) {
			// text node ('nodeName' == '#text')
		}

		// selection(s)
		var sel = evt.target.ownerDocument.defaultView.getSelection();
		sel = sel.toString();
		if (sel != '') {
			d['selection'] = sel;
		}

		return d;
	}

	function cleanup() {
		data = null;
		try {
			if (div && div.parentNode) {
				div.parentNode.removeChild(div);
			}
		} catch (e) {
			log(e);
		}
		div = null;
	}

	function getMainWindow() {
		return Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("navigator:browser");
	}

	function getPosFromElement(el, clientX, clientY, outPos) {
		outPos.x = clientX;
		outPos.y = clientY;
		let w = el.ownerDocument.defaultView;
		if (w.self != w.top) {
			let f = w.frameElement;
			if (f != null) {
				let rc = f.getBoundingClientRect();
				getPosFromElement(f, clientX + rc.left, clientY + rc.top, outPos);
			}
		}
	}

	// -------------------------------------------------------------------------------- 
	// utils
	var logger = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService);
	function log() {
		var s = '';
		for (var i = 0; i < arguments.length; ++ i) {
			if (s !== '') {
				s += ', ';
			}
			s += arguments[i];
		}
		if (s !== '') {
			logger.logStringMessage(s);
		}
	}

	function getRootDoc(el) {
		var doc = el.ownerDocument;
		var win = doc.defaultView;
		if (win.self != win.top) {
			return getRootDoc(win.frameElement);
		} else {
			return doc;
		}
	}

	function dump(o) {
		for (var k in o) {
			var prefix = '    ';
			if (typeof o[k] == 'function') {
				prefix = '    (f)';
				continue;
			}
			log(prefix + k + ':\t\t' + o[k]);
		}
		log(o + (o.tagName || ' (' + o.tagName + ')'));
	}

	return this;
};

