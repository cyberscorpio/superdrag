
var EXPORTED_SYMBOLS = ["SuperDrag"];

// utils
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

var SuperDrag = new function() {
	const PANELID = 'superdrag-panel';
	let that = this;
	let defHandlers = {
		'dragstart': function(evt) {
			/*
			var wm = getMainWindow();
			var tb = wm.document.getElementById('content');
			var tab = tb.selectedTab;
			var browser = tab.linkedBrowser;
			var doc = browser.contentDocument;
			*/
			try {
				gDataset = parseDragStartEvent(evt);
				if (gDataset == null) {
					return;
				}

				let doc = getRootDoc(evt.target);
				gPos = getPosFromElement(evt.target, evt.clientX, evt.clientY);
			} catch (e) {
				Cu.reportError(e);
			}
		},
		'dragenter': function(evt) {
			updateActionString(getActionString(null));
		},
		'dragover': function(evt) {
			if (gDataset != null) {
				if (gPanel == null) {
					let pos = getPosFromElement(evt.target, evt.clientX, evt.clientY);
					let dx = pos.x - gPos.x;
					let dy = pos.y - gPos.y;
					if (dx * dx + dy * dy >= 24400) {
						openPanel(evt.screenX, evt.screenY);
					}
				}
	
				evt.preventDefault();
			}
		},
		'drop': function(evt) {
			if (gDataset != null) {
				evt.preventDefault();

				let key = gDataset['primaryKey'];
				let data = gDataset[key];
				if (key == 'link' || key == 'image') {
					let wm = getMainWindow();
					let tb = wm.document.getElementById('content');
					tb.addTab(data);
				} else if (key == 'text' || key == 'selection') {
					let engine = engines.currentEngine;
					let submission = engine.getSubmission(data);
					let url = submission.uri.spec;

					let wm = getMainWindow();
					let tb = wm.document.getElementById('content');
					tb.addTab(url);
				}
			}
		},
		'dragend': function(evt) {
			afterDrag();
			log('dropped');
		},
	};
	let panelHandlers = {
		'dragenter': function(evt) {
			let t = evt.target;
			if (t.classList.contains('superdrag-target')) {
				t.classList.add('hover');
				updateActionString(getActionString(t.id));
			} else {
				updateActionString(getActionString(null));
			}
		},
		'dragover': function(evt) {
			evt.preventDefault();
		},
		'dragleave': function(evt) {
			let t = evt.target;
			if (t.classList.contains('superdrag-target')) {
				t.classList.remove('hover');
			}
		},
		'drop': function(evt) {
			targetOnDrop(evt);
			evt.preventDefault();
			evt.stopPropagation();
		},
	};
	let engines = Cc['@mozilla.org/browser/search-service;1'].getService(Ci.nsIBrowserSearchService);


	// -------------------------------------------------------------------------------- 
	// methods
	this.init = function() {
		let enumerator = Services.wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			let win = enumerator.getNext();
			inUninstall(win, false);
		}

		// Listen for new windows
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		wm.addListener(windowListener);
	};

	this.shutdown = function() {
		let enumerator = Services.wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			let win = enumerator.getNext();
			inUninstall(win, true);
		}
		// Remove "new window" listener.
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		wm.removeListener(windowListener);
	};

	let windowListener = {
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
				for (let k in defHandlers) {
					if (uninstall) {
						pc.removeEventListener(k, defHandlers[k], false);
					} else {
						pc.addEventListener(k, defHandlers[k], false);
					}
				}
			}

			// 2. panel
			let appcontent = doc.getElementById('appcontent');
			if (uninstall) {
				let panel = doc.getElementById(PANELID);
				// remove the event listeners.
				if (panel) {
					for (let k in panelHandlers) {
						panel.removeEventListener(k, panelHandlers[k], false);
					}

					// remove the panel
					if (panel.parentNode) {
						panel.parentNode.removeChild(panel);
						log('panel removed');
					}
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
				let els = [s];
				win.superdragData = {
					'elementsToBeRemoved': els
				};

				// insert the panel
				doc.loadOverlay('chrome://superdrag/content/dragPanel.xul', {
					observe: function(sub, topic, data) {
						if (topic == 'xul-overlay-merged') {
							let panel = doc.getElementById(PANELID);
							for (let k in panelHandlers) {
								panel.addEventListener(k, panelHandlers[k], false);
							}
						}
					}
				});

			}
		} catch (e) {
			Cu.reportError(e);
		}
	}


	// -------------------------------------------------------------------------------- 
	// local variables
	let gDataset = null;
	let gPos = null;
	let gPanel = null;

	// -------------------------------------------------------------------------------- 
	// local functions
	function targetOnDrop(evt) {
		let t = evt.target;
		if (t.parentNode && t.parentNode.classList.contains('superdrag-target')) {
			t = t.parentNode;
		}
		let id = t.id;
		if (id.indexOf('superdrag-link') == 0) {
			// link
			log('link');
		} else if (id.indexOf('superdrag-text') == 0) {
			// text
			log('text');
		} else if (id.indexOf('superdrag-image') == 0) {
			log('image');
		}
	}

	function parseDragStartEvent(evt) {
		let d = {};
		let dt = evt.dataTransfer;
		let el = evt.target;
		if (el.nodeType == 3) {
			// text node ('nodeName' == '#text')
			// looks like:
			//  1. the el.textContent is the content of the element being dragged, not the selection.
			//  2. it only happens when you drag the selection
			// log(el.textContent);
		}

		let data = dt.getData('text/plain');
		if (data != '') {
			d['text'] = data;
			d['primaryKey'] = 'text';
		}

		if (evt.explicitOriginalTarget && evt.explicitOriginalTarget.tagName == 'IMG') {
			d['image'] = evt.explicitOriginalTarget.src;
			if (d['image'] != '') {
				d['primaryKey'] = 'image';
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
		let sel = evt.target.ownerDocument.defaultView.getSelection();
		sel = sel.toString();
		if (sel != '') {
			d['selection'] = sel;
			d['primaryKey'] = 'selection';
		}

//		dump(d);

		return d;
	}

	function afterDrag() {
		gDataset = null;
		gPos = null;
		try {
			if (gPanel) {
				let hovers = gPanel.getElementsByClassName('hover');
				while(hovers.length > 0) {
					hovers[0].classList.remove('hover');
				}
				gPanel.hidePopup();
			}
		} catch (e) {
			Cu.reportError(e);
		}
		gPanel = null;
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
	let logger = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService);
	function log() {
		let s = '';
		for (let i = 0; i < arguments.length; ++ i) {
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
		let doc = el.ownerDocument;
		let win = doc.defaultView;
		if (win.self != win.top) {
			return getRootDoc(win.frameElement);
		} else {
			return doc;
		}
	}

	// Return the 'processing instruction' element, the caller should
	// save this instance, and call its parent's 'removeChild()' to
	// remove it when needed (for cleanup).
	function addStyle(doc, href) {
		let s = doc.createProcessingInstruction("xml-stylesheet", 'href="' + href + '"');
		doc.insertBefore(s, doc.documentElement);
		return s;
	}

	function openPanel(sX, sY) {
		let wm = getMainWindow();
		let doc = wm.document;
		gPanel = doc.getElementById(PANELID);
		if (gPanel != null) {
			// 1. prepare the panel
			// 1.1 remove all 'hover' class
			let hvs = gPanel.getElementsByClassName('hover');
			while(hvs.length > 0) {
				hvs[0].classList.remove('hover');
			}
			// 1.2 (a) hide un-related sections and
			//     (b) show the information.
			['link', 'text', 'image'].forEach(function(cat) {
				let section = doc.getElementById('superdrag-' + cat);
				let desc = doc.getElementById('superdrag-' + cat + '-desc');
				if (gDataset[cat] === undefined) {
					section.classList.add('hide');
					desc.setAttribute('value', null);
				} else {
					section.classList.remove('hide');
					desc.setAttribute('value', gDataset[cat]);
				}
			});

			// 2. show the panel
			let anchor = doc.getElementById('content');
			let rc = anchor.getBoundingClientRect();
//			gPanel.openPopupAtScreen(-1000, -1000);
//			gPanel.moveTo(wm.screenX + rc.right - gPanel.scrollWidth - 40, wm.screenY + rc.top);
			// gPanel.openPopupAtScreen(wm.screenX + rc.right - gPanel.scrollWidth - 20, wm.screenY + rc.top);
			gPanel.openPopupAtScreen(sX, sY);

		//	rc = gPanel.getBoundingClientRect();
		//	log('width: ' + (rc.right - rc.left));

			// 3. set the action name
			updateActionString(getActionString(null));
		}
	}

	function getActionString(id) {
		if (id === null) {
			return 'Open link in new tab';
		}
		switch (id) {
		case 'superdrag-link-tab-new':
			return 'Open link in new tab';
		case 'superdrag-link-tab-selected':
			return 'Open link in a new foreground tab';
		case 'superdrag-link-tab-current':
			return 'Open link in current tab';
		case 'superdrag-text-search':
			return 'Search the text';
		case 'superdrag-image-tab-new':
			return 'Open image in new tab';
		case 'superdrag-image-tab-selected':
			return 'Open image in a new foreground tab';
		case 'superdrag-image-tab-save':
			return 'Save the image';
		case 'superdrag-cancel':
			return 'Cancel';
		}
		return '';
	}

	function updateActionString(s) {
		if (gPanel) {
			let label = gPanel.ownerDocument.getElementById('superdrag-action-desc');
			if (label) {
				label.setAttribute('value', s);
			}
		}
	}

	function dump(o, arg) {
		for (let k in o) {
			try {
				let prefix = '    ';
				if (arg == 'f') {
					if (typeof o[k] == 'function') {
						prefix = '    (f)';
						log(prefix + k + ':\t\t' + o[k]);
					}
				} else if (arg == 'number') {
					if (typeof o[k] == 'function' || o[k] == null || o[k].toString().indexOf('[object ') == 0) {
						continue;
					}
					log(prefix + k + ':\t\t' + o[k]);
				} else {
					if (typeof o[k] == 'function') {
						continue;
					}
					log(prefix + k + ':\t\t' + o[k]);
				}
			} catch (e) {
				Cu.reportError(e);
				log('key = ' + k);
				continue;
			}
		}
		log(o + (o.tagName === undefined ? '' : ' (' + o.tagName + ')'));
	}

	return this;
};

