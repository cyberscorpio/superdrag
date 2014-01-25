
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
	let gUrlPatterns = [
// /^https?:\/\/w{0,3}\w*?\.(\w*?\.)?\w{2,3}\S*|www\.(\w*?\.)?\w*?\.\w{2,3}\S*|(\w*?\.)?\w*?\.\w{2,3}[\/\?]\S*$/,
/^(https?:\/\/)?(\w*\.){0,2}((\w|-)+)\.(com|net|org|gov|mil|biz|cc|info|fm|mobi|tv|ag|am|asia|at|au|be|br|bz|ca|cn|co|de|es|eu|fr|gs|in|it|jp|la|me|ms|mx|nl|pe|ph|ru|se|so|tk|tw|us|uk|ws|xxx)(\/(\w|&|-|_|\?|\.|=|\/|#|~|!|\+|,|\*|@)*)?$/i,
	];
	let gStr = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).createBundle("chrome://superdrag/locale/strings.properties");
	let gDis = 100;
	let gDefHandlers = {
		'dragstart': function(evt) {
			let mw = getMainWindow();
			let tb = mw.getBrowser();
			let tab = tb.selectedTab;
			let browser = tab.linkedBrowser;
			let doc = browser.contentDocument;
			try {
				let uri = doc.location.href;
				if (uri.indexOf('about:') == 0 || uri.indexOf('chrome://') == 0) {
					return;
				}

				gDataset = parseDragStartEvent(evt);
				if (gDataset == null) {
					return;
				}

				gPos = getPosFromElement(evt.target, evt.clientX, evt.clientY);
				gDis = Services.prefs.getIntPref('extensions.superdrag.panel.show.distance');
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

				if (gDataset['dropToInput'] && isInputElement(evt.target)) {
					return;
				}
	
				evt.preventDefault();
			}
		},
		'drop': function(evt) {
			if (gDataset != null) {
				if (gDataset['dropToInput'] && isInputElement(evt.target)) {
					return;
				}

				let key = gDataset['primaryKey'];
				let data = gDataset[key];
				if (key == 'link') {
					openLink(data, Services.prefs.getCharPref('extensions.superdrag.default.action.link'));
				} else if (key == 'image') {
					let action = Services.prefs.getCharPref('extensions.superdrag.default.action.image');
					action == 'save' ? saveImage(data) : openLink(data, action);
				} else if (key == 'text' || key == 'selection') {
					searchText(data, -1, Services.prefs.getCharPref('extensions.superdrag.default.action.search'));
				}

				evt.preventDefault();
			}
		},
		'dragend': function(evt) {
			if (gDataset) {
				afterDrag();
				// log('----> drag end @' + (new Date()).toString());
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
			gSearchEngineMenuManagers.forEach(function(mm) {
				mm.onEnter(evt);
			});
		},
		'dragover': function(evt) {
			evt.preventDefault();
		},
		'dragleave': function(evt) {
			let t = evt.target;
			if (t.classList.contains('superdrag-target')) {
				t.classList.remove('hover');
			}
			gSearchEngineMenuManagers.forEach(function(mm) {
				mm.onLeave(evt);
			});
		},
		'drop': function(evt) {
			let handled = false;
			gSearchEngineMenuManagers.forEach(function(mm) {
				if (mm.onDrop(evt)) {
					handled = true;
				}
			});
			if (!handled) {
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
	this.init = function(reason) {
		let enumerator = Services.wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			let win = enumerator.getNext();
			inUninstall(win, false);
		}

		// Listen for new windows
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		wm.addListener(windowListener);

		checkFirstRun(reason);
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

					gOpenHomepage && gOpenHomepage(win);
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
						pc.removeEventListener(k, gDefHandlers[k], true);
					} else {
						pc.addEventListener(k, gDefHandlers[k], true);
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
					}
				}

				// remove the style
				let d = win.superdragData;
				if (d && d.elementsToBeRemoved) {
					d.elementsToBeRemoved.forEach(function(el) {
						if (el && el.parentNode) {
							el.parentNode.removeChild(el);
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
			// TODO: it should be an unreachable path, and I need to remove this branch later.
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
		} else if (id == 'superdrag-options') {
			try {
				let mw = getMainWindow();
				mw.openDialog('chrome://superdrag/content/options.xul',
				                  '',
				                  'chrome,dialog,modal=no,dependent=yes,centerscreen=yes,resizable=no');
			} catch (e) {
				Cu.reportError(e);
			}
			return true;
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
		if (data === '') {
			// still try to get a link
			let a = el;
			while (a) {
				if (a.tagName == 'A') {
					data = a.href;
					break;
				}
				a = a.parentNode;
			}
		}
		if (data !== '' && isLinkSupported(data)) {
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
		}

		// selection(s)
		let sel = evt.target.ownerDocument.defaultView.getSelection();
		sel = sel.toString();
		if (sel.trim) {
			sel = sel.trim();
		}
		dump(el);
		if (sel != '') {
			d['selection'] = sel;

			if (el.nodeType == 3 && el.nodeName == '#text') { // if the user is dragging the selected text, it will be the primaryKey.
				d['primaryKey'] = 'selection';
			}

		}

		// if user selected something, or if there is no link,
		// we'll check whether the text itself is a link
		let text = d['selection'] || (d['link'] ? null : d['text']);
		if (text) {
			if (isURL(text)) {
				d['link'] = text;
				d['primaryKey'] = 'link';
			}
		}


		if (d['primaryKey'] === undefined) {
			return null;
		}

		d['rootDoc'] = getRootDoc(el);
		d['document'] = el.ownerDocument;
		d['dropToInput'] = Services.prefs.getBoolPref('extensions.superdrag.behavior.drop.to.input');

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
			gSearchEngineMenuManagers.forEach(function(mm) {
				mm.onEnd();
			});
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

	function isInputElement(el) {
		if (el && 
		   ((el.tagName && (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA'))
		    || (el.getAttribute('contenteditable') == 'true'))) {
			return true;
		}
		return false;
	}

	function openLink(url, how, noref, postData) {
		NS_ASSERT(gDataset != null, 'gDataset != null');
		if (postData === undefined) {
			postData = null;
		}

		let mw = getMainWindow();
		let tb = mw.getBrowser();
		let ct = tb.selectedTab;
		let ref = gDataset['document'].documentURIObject;
		if (how === 'current') {
			let doc = gDataset['rootDoc'];
			doc.defaultView.setTimeout(function() {
				let b = ct.linkedBrowser;
				noref ? b.loadURI(url, null, postData) : b.loadURI(url, ref, postData);
			}, 1); // '1' to make sure that 'dragend' has already been fired and processed.
		} else {
			let tab = noref ? tb.addTab(url, null, null, postData) : tb.addTab(url, ref, null, postData);
			let pos = Services.prefs.getCharPref('extensions.superdrag.newtab.pos');
			let i = tb.tabContainer.getIndexOfItem(tb.selectedTab);
			let moveTo = tb.tabs.length - 1;
			if (pos === 'right') {
				moveTo = i + 1;
			}
			if (how === 'foreground') {
				if (Services.prefs.getBoolPref('extensions.superdrag.newtab.onleft.for.foreground')) {
					moveTo = i;
				}

				mw.setTimeout(function() {
					tb.selectedTab = tab;
				}, 0);
			}

			tb.moveTabTo(tab, moveTo);
			tab.owner = (how === 'background') ? null : ct;
		}
	}

	function search(index, how) {
		let text = gDataset['selection'] || gDataset['text'];
		if (text) {
			how = how || Services.prefs.getCharPref('extensions.superdrag.default.action.search')
			searchText(text, index, how);
			return true;
		}
		return false;
	}

	function searchText(text, index, how) {
		let engine = index == -1 ? gEngines.currentEngine : gEngines.getVisibleEngines()[index];
		let submission = engine.getSubmission(text);
		url = submission.uri.spec;
		openLink(url, how, true, submission.postData);
	}

	function saveImage(imgurl) {
		let mw = getMainWindow();
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
		let gcfs = mw.getCharsetforSave;
		if (gcfs) {
			let charset = gcfs(doc);
			mw.getCharsetforSave = function(doc) {
				return charset;
			}
		}
		try {
			mw.saveImageURL(imgurl, null, "", false, true, doc.documentURIObject, doc);
		} catch (e) {
			Cu.reportError(e);
		}
		if (gcfs) {
			mw.getCharsetforSave = gcfs;
		}
	}

	function openPanel(sX, sY) {
		let mw = getMainWindow();
		let doc = mw.document;
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
					section.classList.add('superdrag-hide');
					desc.setAttribute('value', null);
				} else {
					section.classList.remove('superdrag-hide');
					desc.setAttribute('value', data);
				}
			});

			// 1.3 show / hide the 'options' button
			let opt = doc.getElementById('superdrag-options');
			if (opt) {
				let cls = opt.classList;
				Services.prefs.getBoolPref('extensions.superdrag.panel.show.options') ? cls.remove('superdrag-hide') : cls.add('superdrag-hide');
			}

			// 2. show the panel
			let pos = Services.prefs.getIntPref('extensions.superdrag.panel.pos');
			if (pos == 0) {
				let offset = Services.prefs.getIntPref('extensions.superdrag.panel.follow.offset');
				gPanel.openPopupAtScreen(sX + offset, sY + offset);
			} else {
				let anchor = doc.getElementById('content');
				let rc = anchor.getBoundingClientRect();
				gPanel.openPopupAtScreen(-1000, -1000);
				gPanel.moveTo(mw.screenX + rc.right - gPanel.scrollWidth - 40, mw.screenY + rc.top);
				// gPanel.openPopupAtScreen(mw.screenX + rc.right - gPanel.scrollWidth - 20, mw.screenY + rc.top);
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

	function SearchEngineManager(id) {
		let menuid = id + '-engines';
		let popup = null;
		let tmShow = null;
		let tmHide = null;
		let sid = id == 'superdrag-text-search-background' ? 'sdSearchInBackgroundTabWith' : 
			(id == 'superdrag-text-search-foreground' ? 'sdSearchInForegroundTabWith' : 'sdSearchInCurrentTabWith');
		let how = id == 'superdrag-text-search-background' ? 'background' : 
			(id == 'superdrag-text-search-foreground' ? 'foreground' : 'current');

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
				tmShow = win.setTimeout(showMenu, Services.prefs.getIntPref('extensions.superdrag.popup.show.delay'));
			}

			if (popup) {
				if (el.tagName == 'menuitem') {
					el.setAttribute('_moz-menuactive', true);
					el.setAttribute('menuactive', true);

					updateActionString(getString(sid).replace('%engine%', el.getAttribute('value')));
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
			if (gDataset == null) {
				return false;
			}

			let el = evt.target;
			let doc = el.ownerDocument;
			let p = doc.getElementById(id);
			if (el === p) {
				return search(-1, how);
			}

			if (popup == null || !popup.contains(el)) {
				return false;
			}

			while(el && el.tagName != 'menuitem') {
				el = el.parentNode;
			}

			if (el) {
				let index = el.getAttribute('s-index');
				return search(index, how);
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
				let menu = doc.getElementById(menuid);
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
				menu.openPopup(menu.parentNode, 'end_before', -5, 10);
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

	let gSearchEngineMenuManagers = [
		new SearchEngineManager('superdrag-text-search-background'), 
		new SearchEngineManager('superdrag-text-search-foreground'), 
		new SearchEngineManager('superdrag-text-search-current') 
		    ];

	let gAction2Id = {
		'link': {
			'background': 'superdrag-link-tab-background',
			'foreground': 'superdrag-link-tab-foreground',
			'current': 'superdrag-link-tab-current'
		},
		'text': {
			'background': 'superdrag-text-search-background',
			'foreground': 'superdrag-text-search-foreground',
			'current': 'superdrag-text-search-current'
		},
		'image': {
			'background': 'superdrag-image-tab-background',
			'foreground': 'superdrag-image-tab-foreground',
			'save': 'superdrag-image-save'
		}
	};
	function getActionString(id) {
		NS_ASSERT(gDataset != null, 'To getActionString(), gDataset must NOT be null');
		if (id === null) {
			let key = gDataset['primaryKey'];
			if (key == 'link') {
				let action = Services.prefs.getCharPref('extensions.superdrag.default.action.link');
				id = gAction2Id['link'][action];
			} else if (key == 'text' || key == 'selection') {
				let action = Services.prefs.getCharPref('extensions.superdrag.default.action.search');
				id = gAction2Id['text'][action];
			} else if (key == 'image') {
				let action = Services.prefs.getCharPref('extensions.superdrag.default.action.image');
				id = gAction2Id['image'][action];
			} else {
				return '';
			}
		}
		switch (id) {
		case 'superdrag-link-tab-background':
			return getString('sdOpenLinkInBackgroundTab');
		case 'superdrag-link-tab-foreground':
			return getString('sdOpenLinkInForegroundTab');
		case 'superdrag-link-tab-current':
			return getString('sdOpenLinkInCurrentTab');
		case 'superdrag-text-search-background':
			return getString('sdSearchInBackgroundTabWith').replace('%engine%', gEngines.currentEngine.name);
		case 'superdrag-text-search-foreground':
			return getString('sdSearchInForegroundTabWith').replace('%engine%', gEngines.currentEngine.name);
		case 'superdrag-text-search-current':
			return getString('sdSearchInCurrentTabWith').replace('%engine%', gEngines.currentEngine.name);
		case 'superdrag-image-tab-background':
			return getString('sdOpenImageInBackgroundTab');
		case 'superdrag-image-tab-foreground':
			return getString('sdOpenImageInForegroundTab');
		case 'superdrag-image-save':
			return getString('sdSaveImage');
		case 'superdrag-cancel':
			return getString('sdCancel');
		case 'superdrag-options':
			return getString('sdOptions');
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

	function isURL(text) {
		for (let i = 0; i < gUrlPatterns.length; ++ i) {
			if (gUrlPatterns[i].test(text)) {
				return true;
			}
		}
		return false;
	}

	function isLinkSupported(link) {
		if (link && link.indexOf('http') === 0) {
			return true;
		}
		return false;
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

	function checkFirstRun(reason) {
		if (reason == 7 || reason == 8) { // skip upgrade / downgrade, we'll check it next start
			return;
		}

		let vk = 'extensions.superdrag.version';
		let ver = Services.prefs.getCharPref(vk);
		try {
			let id = 'superdrag@enjoyfreeware.org';
			Cu.import("resource://gre/modules/AddonManager.jsm");
			AddonManager.getAddonByID(id, function(addon) {
				addver = addon.version;
				if (addver != ver) {
					// 1. write the version
					Services.prefs.setCharPref(vk, addver);

					// 2. try to open home page.
					let mw = getMainWindow();
					if (mw == null) {
						gOpenHomepage = tryOpenHomepage;
					} else {
						tryOpenHomepage(mw);
					}
				}
			});
		} catch (e) {
			Cu.reportError(e);
		}
	}

	let gOpenHomepage = null;
	function tryOpenHomepage(mw) {
		gOpenHomepage = null;
		let tm = mw.setTimeout(function() {
			mw.removeEventListener('unload', onUnload, false);
			tm = null;
			// open home page
			let tb = mw.getBrowser();
			tb.selectedTab = tb.addTab('http://www.enjoyfreeware.org/superdrag/?v=' + addver);
		}, 2500);

		function onUnload() {
			mw.removeEventListener('unload', onUnload, false);
			if (tm) {
				mw.clearTimeout(tm);
				tm = null;
			}
		}

		mw.addEventListener('unload', onUnload, false);
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

