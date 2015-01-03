"use strict"; // vim: ts=8 filetype=javascript:
this.EXPORTED_SYMBOLS = ['Utils'];

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;
Cu.import('resource://gre/modules/FileUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

this.Utils = (function(){

	let urlPatterns = [
/^(https?:\/\/)?((\w|-)*\.){0,3}((\w|-)+)\.(com|net|org|gov|edu|mil|biz|cc|info|fm|mobi|tv|ag|am|asia|at|au|be|br|bz|ca|cn|co|de|do|ee|es|eu|fr|gd|gl|gs|im|in|it|jp|la|ly|me|mp|ms|mx|nl|pe|ph|ru|se|so|tk|to|tt|tw|us|uk|ws|xxx)(\/(\w|%|&|-|_|\||\?|\.|=|\/|#|~|!|\+|,|\*|@)*)?$/i,
	];


	function isLinkSupported(link) {
		if (link && (link.startsWith('http') || link.startsWith('file:'))) {
			return true;
		}
		return false;
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

	function trim(s) {
		// The code is from here:
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/Trim#Compatibility
		// And I add \u200e for Google's search results.
		return s.replace(/^(\s|\u200e)+|(\s|\u200e)+$/gm, '');
	}

	function isURL(text) {
		if (text.length && text.length > 2083) { // see http://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers
			return false;
		}

		text = text.replace('\r', '').replace('\n', '');
		for (let i = 0; i < urlPatterns.length; ++ i) {
			if (urlPatterns[i].test(text)) {
				return true;
			}
		}
		return false;
	}

	// evt is a DragStartEvent
	function parseDragStartEvent(evt) {
		let d = {};
		let dt = evt.dataTransfer;
		let el = evt.target;
		if (el.nodeType == 3) {
			// text node ('nodeName' == '#text')
			// looks like:
			//  1. the el.textContent is the content of the element being dragged, not the selection.
			//  2. it only happens when you drag the selection
			// console.log(el.textContent);
		}

		let data = dt.getData('text/plain');
		data = trim(data);

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
				text = trim(text);
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
		sel = trim(sel);
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
			text = trim(text);
			if (text && isURL(text)) {
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



	return {
		msg: {
			shutdown: 'superdrag@enjoyfreeware.org:shutdown'
		},
	
		parseDragStartEvent: parseDragStartEvent,
		trim: trim
	};
})();

