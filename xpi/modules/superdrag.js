
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
	var engines = Cc['@mozilla.org/browser/search-service;1'].getService(Ci.nsIBrowserSearchService);
	var panel = null;

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
		try {
			var doc = win.document;
			var tb = doc.getElementById('content'); // TabBrowser
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

			var appcontent = doc.getElementById('appcontent');

			if (uninstall) {
				var panel = doc.getElementById('superdrag-drag-panel');
				if (panel != null) {
					panel.parentNode.removeChild(panel);
				}
			} else {
				var rc = appcontent.getBoundingClientRect();
				var panel = doc.createElement('panel');
				panel.id = 'superdrag-drag-panel';
				panel.style.position = 'fixed';
//				panel.style.width = '280px';
//				panel.style.height = '280px';
				panel.style.top = rc.top + 'px';//'72px';
				panel.style.right = '30px';
				panel.style.boxShadow = '0 2px 25px 2px black';

				appcontent.appendChild(panel);

				var browser = doc.createElement('browser');
				browser.setAttribute('disablehistory', true);

				browser.style.width = '400px';
				browser.style.height = '200px';
				browser.onclick = function() {
//					appcontent.removeChild(panel);
				};
				panel.appendChild(browser);
				browser.loadURI('chrome://superdrag/content/dragPanel.xul');

				win.setTimeout(function() {
					panel.style.position = '';
					panel.hidePopup();
				}, 0);

			}
		} catch (e) {
			log(e);
		}
	}


	// -------------------------------------------------------------------------------- 
	// local variables
	var dataset = null;
	var panel = null;
	var startPos = null;

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
			dataset = parseDragStartEvent(evt);
			if (dataset == null) {
				return;
			}

			var doc = getRootDoc(evt.target);
			startPos = getPosFromElement(evt.target, evt.clientX, evt.clientY);

//			panel = doc.createElement('div');
//			var st = panel.style;
//			st.width = '100px';
//			st.height = '100px';
//			st.position = 'fixed';
//			st.backgroundColor = 'red';
//			st.zIndex = '999999';
//			var v = doc.documentElement;
//			v.appendChild(panel);
//			st.left = startPos.x + 'px';
//			st.top = startPos.y + 'px';

			// log('nodeType: ' + evt.target.nodeType);

		} catch (e) {
			log(e);
		}
	}

	function onDragOver(evt) {
		if (dataset != null) {
			if (panel == null) {
				var pos = getPosFromElement(evt.target, evt.clientX, evt.clientY);
				var dx = pos.x - startPos.x;
				var dy = pos.y - startPos.y;
				if (dx * dx + dy * dy >= 24400) {
				//	var doc = getRootDoc(evt.target);
				//	panel = createPanel(doc);
				//	doc.documentElement.appendChild(panel);
					var wm = getMainWindow();
					panel = wm.document.getElementById('superdrag-drag-panel');
					if (panel != null) {
						panel.openPopup(wm.document.getElementById('appcontent'), 'start_before', -400, 0);
					}
				}
			}
//			panel.style.left = pos.x + 'px';
//			panel.style.top = pos.y + 'px';

			evt.preventDefault();
		}
	}

	function onDrop(evt) {
		if (dataset != null) {
			evt.preventDefault();

			var key = dataset['primaryKey'];
			var data = dataset[key];
			if (key == 'link' || key == 'img') {
				var wm = getMainWindow();
				var tb = wm.document.getElementById('content');
				tb.addTab(data);
			} else if (key == 'text' || key == 'selection') {
//				evt.target.ownerDocument.defaultView.alert(data);
				var engine = engines.currentEngine;
				var submission = engine.getSubmission(data);
				var url = submission.uri.spec;

				var wm = getMainWindow();
				var tb = wm.document.getElementById('content');
				tb.addTab(url);
			}
		}
	}

	function onDragEnd(evt) {
		log('end');
		cleanup();
	}

	function parseDragStartEvent(evt) {
		var d = {};
		var dt = evt.dataTransfer;
		var el = evt.target;
		if (el.nodeType == 3) {
			// text node ('nodeName' == '#text')
			// looks like:
			//  1. the el.textContent is the content of the element being dragged, not the selection.
			//  2. it only happens when you drag the selection
			// log(el.textContent);
		}

		var data = dt.getData('text/plain');
		if (data != '') {
			d['text'] = data;
			d['primaryKey'] = 'text';
		}

		if (evt.explicitOriginalTarget && evt.explicitOriginalTarget.tagName == 'IMG') {
			d['img'] = evt.explicitOriginalTarget.src;
			if (d['img'] != '') {
				d['primaryKey'] = 'img';
			}
		}

		data = dt.getData('text/uri-list');
		if (data != '') {
			d['link'] = data;
			if (el.nodeType == 1 && el.tagName == 'A') {
				d['primaryKey'] = 'link';
			}
		}

		if (d['primaryKey'] === undefined) {
			return null;
		}

//		dump(evt);
//		log(evt.target == evt.originalTarget);
//		log(evt.target.tagName);
//		log(evt.explicitOriginalTarget.tagName);
//		log(evt.currentTarget.tagName);

//		log(' types:');
//		for (let i = 0; i < dt.types.length; ++ i) {
//			log(' - ' + dt.types.item(i) + ': ' + dt.getData(dt.types.item(i)));
//		}
//		log(evt.target.tagName);
//		dump(dt);


		// selection(s)
		var sel = evt.target.ownerDocument.defaultView.getSelection();
		sel = sel.toString();
		if (sel != '') {
			d['selection'] = sel;
			d['primaryKey'] = 'selection';
		}

//		dump(d);

		return d;
	}

	function cleanup() {
		dataset = null;
		startPos = null;
		try {
			if (panel && panel.parentNode) {
				panel.parentNode.removeChild(panel);
			}
		} catch (e) {
			log(e);
		}
		panel = null;
	}

	function getMainWindow() {
		return Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("navigator:browser");
	}

	function getPosFromElement(el, clientX, clientY) {
		pos = {
			x: clientX,
			y: clientY
		};
		let w = el.ownerDocument.defaultView;
		if (w.self != w.top) {
			let f = w.frameElement;
			if (f != null) {
				let rc = f.getBoundingClientRect();
				return getPosFromElement(f, clientX + rc.left, clientY + rc.top);
			}
		}
		return pos;
	}

	function attachText(doc, el, text) {
		var t = doc.createTextNode(text);
		el.appendChild(t);
	}

	function createPanel(doc) {
		// var df = doc.createDocumentFragment();
		var p = doc.createElement('div');
		p.style.padding = '5px';
		p.style.textAlign = 'left';
		p.style.backgroundColor = '#ccc';
		p.style.color = 'black';
		p.style.position = 'fixed';
		p.style.top = '0px';
		p.style.right = '32px';
		p.style.minWidth = '240px';
		p.style.boxShadow = '0 5px 20px 5px #333';
		p.style.zIndex = '99999999';
		p.style.backgroundImage = 'linear-gradient(#e7e7e7, #a2a2a2)';
		p.style.border = '1px solid #aaa';
		p.style.borderRadius = '0 0 5px 5px';

		var e = doc.createElement('div');
		attachText(doc, e, '...');
		p.appendChild(e);

		e = doc.createElement('div');
		attachText(doc, e, 'link');
		e.id = 'superdrag-link-title';
		p.appendChild(e);

	//	e = doc.createElement('div');
	//	attachText(doc, e, 'open in new tab');

		return p;
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

	function dump(o, arg) {
		for (var k in o) {
			var prefix = '    ';
			if (arg == 'f') {
				if (typeof o[k] == 'function') {
					prefix = '    (f)';
					log(prefix + k + ':\t\t' + o[k]);
				}
			} else {
				if (typeof o[k] == 'function') {
					continue;
				}
				log(prefix + k + ':\t\t' + o[k]);
			}
		}
		log(o + (o.tagName === undefined ? '' : ' (' + o.tagName + ')'));
	}

	return this;
};

