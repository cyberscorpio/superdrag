
var EXPORTED_SYMBOLS = ["SuperDrag"];

// utils
const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/debug.js")

var SuperDrag = new function() {
	const PANELID = 'superdrag-panel';
	const PREF_PREFIX = 'extensions.superdrag.';
	// TODO: this pattern doesn't work for '123 www.abc.com'.
	let gUrlPattern = /^https?:\/\/w{0,3}\w*?\.(\w*?\.)?\w{2,3}\S*|www\.(\w*?\.)?\w*?\.\w{2,3}\S*|(\w*?\.)?\w*?\.\w{2,3}[\/\?]\S*$/;
	let gStr = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).createBundle("chrome://superdrag/locale/strings.properties");
	let gPref = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
	let gDis = 100;
	let gDefHandlers = {
		'dragstart': function(evt) {
			/*
			var wm = getMainWindow();
			var tb = wm.getBrowser();
			var tab = tb.selectedTab;
			var browser = tab.linkedBrowser;
			var doc = browser.contentDocument;
			*/
			try {
				gDataset = parseDragStartEvent(evt);
				if (gDataset == null) {
					return;
				}

				gPos = getPosFromElement(evt.target, evt.clientX, evt.clientY);
				gDis = gPref.getIntPref(PREF_PREFIX + 'panel.show.distance');
				gDis = gDis * gDis;
			} catch (e) {
				Cu.reportError(e);
			}
		},
		'dragenter': function(evt) {
			if (gDataset) {
				updateActionString(getActionString(null));
			}
		},
		'dragover': function(evt) {
			if (gDataset != null) {
				if (gPanel == null) {
					let pos = getPosFromElement(evt.target, evt.clientX, evt.clientY);
					let dx = pos.x - gPos.x;
					let dy = pos.y - gPos.y;
					if (dx * dx + dy * dy >= gDis) {
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
				if (key == 'link') {
					openLink(data, gPref.getCharPref(PREF_PREFIX + 'default.action.link'));
				} else if (key == 'image') {
					let action = gPref.getCharPref(PREF_PREFIX + 'default.action.image');
					action == 'save' ? saveImage(data) : openLink(data, action);
				} else if (key == 'text' || key == 'selection') {
					searchText(data, -1);
				}
			}
		},
		'dragend': function(evt) {
			if (gDataset) {
				afterDrag();
				log('drag end @' + (new Date()).toString());
			}
		},
	};
	let gPanelHandlers = {
		'dragenter': function(evt) {
			let t = evt.target;
			if (t.classList.contains('superdrag-target')) {
				t.classList.add('hover');
				updateActionString(getActionString(t.id));
			} else {
				updateActionString(getActionString(null));
			}
			gSearchEngineMenuManager.onEnter(evt);
		},
		'dragover': function(evt) {
			evt.preventDefault();
		},
		'dragleave': function(evt) {
			let t = evt.target;
			if (t.classList.contains('superdrag-target')) {
				t.classList.remove('hover');
			}
			gSearchEngineMenuManager.onLeave(evt);
		},
		'drop': function(evt) {
			if (!gSearchEngineMenuManager.onDrop(evt)) {
				if (!dropOnTarget(evt)) {
					gDefHandlers.drop(evt);
				}
			}
			evt.preventDefault();
			evt.stopPropagation();
		},
	};
	let gEngines = Cc['@mozilla.org/browser/search-service;1'].getService(Ci.nsIBrowserSearchService);


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
				for (let k in gDefHandlers) {
					if (uninstall) {
						pc.removeEventListener(k, gDefHandlers[k], false);
					} else {
						pc.addEventListener(k, gDefHandlers[k], false);
					}
				}
			}

			// 2. panel
			let appcontent = doc.getElementById('appcontent');
			if (uninstall) {
				let panel = doc.getElementById(PANELID);
				// remove the event listeners.
				if (panel) {
					for (let k in gPanelHandlers) {
						panel.removeEventListener(k, gPanelHandlers[k], false);
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
							for (let k in gPanelHandlers) {
								panel.addEventListener(k, gPanelHandlers[k], false);
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
	let gSearchEngineMenu = null;

	// -------------------------------------------------------------------------------- 
	// local functions

	// if it doesn't process the event, it returns *false*
	// otherwise *true* is returned.
	function dropOnTarget(evt) {
		let t = evt.target;
		if (!t.classList.contains('superdrag-target')) {
			return false;
		}

		let id = t.id;
		let map = {
			'superdrag-link-tab-background': 'background',
			'superdrag-link-tab-foreground': 'foreground',
			'superdrag-link-tab-current': 'current',
			'superdrag-image-tab-background': 'background',
			'superdrag-image-tab-foreground': 'foreground'
		};
		if (id.indexOf('superdrag-link') == 0) {
			let url = gDataset['link'];
			if (url) {
				if (map[id]) {
					openLink(url, map[id]);
				}
				return true;
			}
		} else if (id.indexOf('superdrag-text') == 0) {
			return search(-1);
		} else if (id.indexOf('superdrag-image') == 0) {
			let imgurl = gDataset['image'];
			if (imgurl) {
				if (id == 'superdrag-image-save') {
					saveImage(imgurl);
				} else {
					if (map[id]) {
						openLink(imgurl, map[id]);
					}
				}
				return true;
			}
		} else if (id == 'superdrag-cancel') {
			return true; // do nothing
		}

		return false;
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
		if (data.trim) {
			data = data.trim();
		}
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

				// TODO: shoud we do this?
				let text = el.textContent;
				if (text.trim) {
					text = text.trim();
				}
				if (text == '') {
					delete d['text'];
				} else {
					d['text'] = text;
				}
			}

			// doesn't support such links
			if (data.indexOf('javascript:') == 0) {
				delete d['link'];
				if (d['primaryKey'] == 'link') {
					d['primaryKey'] = 'text';
				}
			}
		}

		// selection(s)
		let sel = evt.target.ownerDocument.defaultView.getSelection();
		sel = sel.toString();
		if (sel != '') {
			d['selection'] = sel;
			d['primaryKey'] = 'selection';

		}

		// if user selected something, or if there is no link,
		// we'll check whether the text itself is a link
		let text = d['selection'] || (d['link'] ? null : d['text']);
		if (text) {
			// TODO: the pattern should work for xxx.com/.net/.info, etc.
			if (gUrlPattern.test(text)) {
				d['link'] = text;
				d['primaryKey'] = 'link';
			}
		}


		if (d['primaryKey'] === undefined) {
			return null;
		}

		d['rootDoc'] = getRootDoc(el);
		d['document'] = el.ownerDocument;

		return d;
	}

	function afterDrag() {
		if (gDataset['document']) {
			delete gDataset['document'];
		}
		if (gDataset['rootDoc']) {
			delete gDataset['rootDoc'];
		}
		gDataset = null;
		gPos = null;
		try {
			gSearchEngineMenuManager.onEnd();
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

	function openLink(url, how) {
		NS_ASSERT(gDataset != null, 'gDataset != null');
		if (how == 'current') {
			gDataset['rootDoc'].location.href = url;
		} else {
			let tb = getMainWindow().getBrowser();
			let tab = tb.addTab(url);
			let pos = gPref.getCharPref(PREF_PREFIX + 'newtab.pos');
			let i = tb.tabContainer.getIndexOfItem(tb.selectedTab);
			if (pos == 'right') {
				tb.moveTabTo(tab, i + 1);
			} else if (pos == 'left') {
				tb.moveTabTo(tab, i - 1);
			}
			if (how == 'foreground') {
				tb.selectedTab = tab;
			}
		}
	}

	function search(index) {
		let text = gDataset['selection'] || gDataset['text'];
		if (text) {
			searchText(text, index);
			return true;
		}
		return false;
	}

	function searchText(text, index) {
		let engine = index == -1 ? gEngines.currentEngine : gEngines.getVisibleEngines()[index];
		let submission = engine.getSubmission(text);
		url = submission.uri.spec;
		openLink(url, gPref.getBoolPref(PREF_PREFIX + 'newtab.foreground') ? 'foreground' : 'background');
	}

	function saveImage(imgurl) {
		let wm = getMainWindow();
		let doc = gDataset['document'];

		// I don't know whether it is a bug for the default implement, but
		// if the image has 'filename=xxxx' in its Content-Disposition and the 
		// charset of the document is not utf-8, for example, gbk, the problem
		// occurs since the real document can't be passed to saveImageURL():
		//  saveImageURL() -> internalSave() -> initFileInfo() -> getDefaultFileName()
		// -> getCharsetforSave(aDocument), here 'aDocument' is 'null', so
		// the chrome's default charset will be used and if they don't match,
		// the file name will be unrecognized characters. 
		// 
		// The workaround is to get the charset ahead, then override 'getCharsetforSave'
		// and restore it after the call of 'saveImageURL()'.
		let gcfs = wm.getCharsetforSave;
		if (gcfs) {
			let charset = gcfs(doc);
			wm.getCharsetforSave = function(doc) {
				return charset;
			}
		}
		try {
			wm.saveImageURL(imgurl, null, "", false, true, doc.documentURIObject, doc);
		} catch (e) {
			Cu.reportError(e);
		}
		if (gcfs) {
			wm.getCharsetforSave = gcfs;
		}
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
				let data = (cat == 'text' ? (gDataset['selection'] || gDataset['text']) : gDataset[cat]);
				if (data === undefined) {
					section.classList.add('hide');
					desc.setAttribute('value', null);
				} else {
					section.classList.remove('hide');
					desc.setAttribute('value', data);
				}
			});

			// 2. show the panel
			let pos = gPref.getIntPref(PREF_PREFIX + 'panel.pos');
			if (pos == 0) {
				let offset = gPref.getIntPref(PREF_PREFIX + 'panel.follow.offset');
				gPanel.openPopupAtScreen(sX + offset, sY + offset);
			} else {
				let anchor = doc.getElementById('content');
				let rc = anchor.getBoundingClientRect();
				gPanel.openPopupAtScreen(-1000, -1000);
				gPanel.moveTo(wm.screenX + rc.right - gPanel.scrollWidth - 40, wm.screenY + rc.top);
				// gPanel.openPopupAtScreen(wm.screenX + rc.right - gPanel.scrollWidth - 20, wm.screenY + rc.top);
			}

			// DON'T remove them because:
			//  below code is used to report the width of the panel,
			//  which is useful for the CSS file.
			// rc = gPanel.getBoundingClientRect();
			// log('width: ' + (rc.right - rc.left));

			// 3. set the action name
			updateActionString(getActionString(null));
		}
	}

	let gSearchEngineMenuManager = new function() {
		let id = 'superdrag-text-search';
		let menuid = 'superdrag-text-search-engines';
		let popup = null;
		let tmShow = null;
		let tmHide = null;

		this.onEnter = function(evt) {
			let el = evt.target;
			let doc = el.ownerDocument;
			let win = doc.defaultView;
			let p = doc.getElementById(id);
			let menu = doc.getElementById(menuid);

			if (!p.contains(el)) {
				return;
			}

			if (popup == null && tmShow == null) {
				tmShow = win.setTimeout(showMenu, gPref.getIntPref(PREF_PREFIX + 'popup.show.delay'));
			}

			if (popup) {
				if (el.tagName == 'menuitem') {
					el.setAttribute('_moz-menuactive', true);
					el.setAttribute('menuactive', true);

					updateActionString(getString('sdSearchWith').replace('%engine%', el.getAttribute('value')));
				}
			}

			win.setTimeout(function() {
				if (tmHide) {
					win.clearTimeout(tmHide);
					tmHide = null;
				}
			}, 0);
		};

		this.onLeave = function(evt) {
			let el = evt.target;
			let doc = el.ownerDocument;
			let win = doc.defaultView;
			let p = doc.getElementById(id);
			let menu = doc.getElementById(menuid);

			if (p.contains(el) && el.tagName == 'menuitem') {
				el.removeAttribute('_moz-menuactive');
				el.removeAttribute('menuactive');
			}


			if (evt.relatedTarget && p.contains(evt.relatedTarget)) {
				return;
			}

			if (popup == null && tmShow) {
				win.clearTimeout(tmShow);
				tmShow = null;
			}

			if (popup && tmHide == null) {
				tmHide = win.setTimeout(hideMenu, 100);
			}
		};

		this.onDrop = function(evt) {
			let el = evt.target;
			if (popup == null || gDataset == null || !popup.contains(el)) {
				return false;
			}

			while(el && el.tagName != 'menuitem') {
				el = el.parentNode;
			}

			if (el) {
				let index = el.getAttribute('s-index');
				return search(index);
			}

			return false;
		};

		this.onEnd = function() {
			if (popup) {
				popup.hidePopup();
				popup = null;
			}

			if (gPanel) {
				let doc = gPanel.ownerDocument;
				let win = doc.defaultView;
				tmShow && win.clearTimeout(tmShow);
				tmHide && win.clearTimeout(tmHide);
			}

			tmShow = tmHide = null;
		};

		function showMenu() {
			tmShow = null;
			if (gPanel && popup == null) {
				let doc = gPanel.ownerDocument;
				let menu = doc.getElementById('superdrag-text-search-engines');
				while(menu.children.length > 0) {
					menu.removeChild(menu.firstChild);
				}
				// populate the engines
				let engines = gEngines.getVisibleEngines();
				for (let i = 0; i < engines.length; ++ i) {
					let engine = engines[i];
					let m = doc.createElement("menuitem");
					m.setAttribute('label', engine.name);
					if (engine.iconURI && engine.iconURI.spec) {
						m.setAttribute('image', engine.iconURI.spec);
					}
					m.setAttribute('class', "menuitem-iconic bookmark-item");
					m.setAttribute('value', engine.name);
					m.setAttribute('s-index', i);
					menu.appendChild(m);
				}
				menu.openPopup(menu.parentNode, 'end_before', -5, 0);
				popup = menu;
			}
		}
	
		function hideMenu() {
			tmHide = null;
			if (popup) {
				popup.hidePopup();
				popup = null;
			}
		}

	};

	function getActionString(id) {
		NS_ASSERT(gDataset != null, 'To getActionString(), gDataset must NOT be null');
		if (id === null) {
			// TODO: use 'strings' instead.
			switch (gDataset['primaryKey']) {
			case 'link':
				return 'Open link in new tab';
			case 'text':
				return 'Search';
			case 'image':
				return 'image';
			}
			return '';
		}
		switch (id) {
		case 'superdrag-link-tab-background':
			return getString('sdOpenLinkInBackgroundTab');
		case 'superdrag-link-tab-foreground':
			return getString('sdOpenLinkInForegroundTab');
		case 'superdrag-link-tab-current':
			return getString('sdOpenLinkInCurrentTab');
		case 'superdrag-text-search':
			return getString('sdSearchWith').replace('%engine%', gEngines.currentEngine.name);
		case 'superdrag-image-tab-background':
			return getString('sdOpenImageInBackgroundTab');
		case 'superdrag-image-tab-foreground':
			return getString('sdOpenImageInForegroundTab');
		case 'superdrag-image-save':
			return getString('sdSaveImage');
		case 'superdrag-cancel':
			return getString('sdCancel');
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

	function getString(k) {
		let s = '';
		try {
			s = gStr.GetStringFromName(k);
		} catch (e) {
			Cu.reportError(e);
		}

		return s;
	}

	function getDownloadDir() {
		return FileUtils.getDir('DfltDwnld', []);
	}

	// not used yet.
	function config() {
		let sbprefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		let prefObserver = {
			register: function() {
				var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
				this.branch = prefService.getBranch("extensions.superdrag.");
				this.branch.addObserver("", this, false);
			},

			unregister: function() {
				if(!this.branch) {
					return;
				}
				this.branch.removeObserver("", this);
			},

			observe: function(aSubject, aTopic, aData) {
				if(aTopic != "nsPref:changed") {
					return;
				}
			}
		};
	}

	function dump(o, arg) {
		if (o) {
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
			log(o + (o && o.tagName === undefined ? '' : ' (' + o.tagName + ')'));
		} else {
			log(o);
		}
	}

	// dump(OS.Constants.Path);

	return this;
};

