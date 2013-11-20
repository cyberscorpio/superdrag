
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

	const PANELID = 'superdrag-panel';

	// -------------------------------------------------------------------------------- 
	// methods
	this.init = function() {
		var enumerator = Services.wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			inUninstall(win, false);
		}

		// Listen for new windows
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		wm.addListener(windowListener);
	};

	this.shutdown = function() {
		var enumerator = Services.wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			inUninstall(win, true);
		}
		// Remove "new window" listener.
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		wm.removeListener(windowListener);
	};

	var windowListener = {
		onOpenWindow: function(aWindow) {
			// Wait for the window to finish loading
			let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
			domWindow.addEventListener("load", function onLoad(evt) {
				let win = evt.currentTarget;
				domWindow.removeEventListener("load", onLoad, false);
				if (win.document.documentElement.getAttribute('windowtype') == 'navigator:browser') {
					inUninstall(win, false);
				}
			}, false);
		},
	 
		onCloseWindow: function(aWindow) {
			let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
			inUninstall(domWindow, true);
		},
		onWindowTitleChange: function(aWindow, aTitle) {}
	};
	
	// install or uninstall
	function inUninstall(win, uninstall) {
		try {
			let doc = win.document;

			// 1. event handler
			let tb = doc.getElementById('content'); // TabBrowser
			if (tb && tb.mPanelContainer) {
				let pc = tb.mPanelContainer;
				for (let k in pcMsgs) {
					if (uninstall) {
						pc.removeEventListener(k, pcMsgs[k], false);
					} else {
						pc.addEventListener(k, pcMsgs[k], false);
					}
				}
			}

			// 2. panel
			let appcontent = doc.getElementById('appcontent');
			if (uninstall) {
				let panel = doc.getElementById('superdrag-panel');
				// TODO: remove the event listeners.

				// remove the panel
				if (panel && panel.parentNode) {
					panel.parentNode.removeChild(panel);
					log('panel removed');
				}

				// remove the style
				let d = win.superdragData;
				if (d && d.elementsToBeRemoved) {
					d.elementsToBeRemoved.forEach(function(el) {
						if (el && el.parentNode) {
							el.parentNode.removeChild(el);
							log('style removed');
						}
					});
				}
				delete win.superdragData;
			} else {
				// insert style
				let s = addStyle(doc, 'chrome://superdrag/skin/panel.css');
				var els = [s];
				win.superdragData = {
					'elementsToBeRemoved': els
				};

				// insert the panel
				doc.loadOverlay('chrome://superdrag/content/dragPanel.xul', null);

				// TODO: add event listeners.
			}
		} catch (e) {
			Cu.reportError(e);
		}
	}


	// -------------------------------------------------------------------------------- 
	// local variables
	var dataset = null;
	var startPos = null;
	var panel = null;

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
		} catch (e) {
			log(e);
		}
	}

	function onDragOver(evt) {
		if (dataset != null) {
			if (panel == null) {
				let pos = getPosFromElement(evt.target, evt.clientX, evt.clientY);
				let dx = pos.x - startPos.x;
				let dy = pos.y - startPos.y;
				if (dx * dx + dy * dy >= 24400) {
					let wm = getMainWindow();
					panel = wm.document.getElementById(PANELID);
					if (panel != null) {
						let appcontent = wm.document.getElementById('appcontent');
						panel.openPopup(appcontent, 'start_before', -400, 0);
					}
				}
			}

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
		afterDrop();
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

	function afterDrop() {
		dataset = null;
		startPos = null;
		try {
			if (panel) {
				panel.hidePopup();
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


	function addStyle(doc, href) {
		var s = doc.createProcessingInstruction("xml-stylesheet", 'href="' + href + '"');
		doc.insertBefore(s, doc.documentElement);
		return s;
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

