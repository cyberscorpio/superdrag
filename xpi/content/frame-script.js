"use strict"
const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

addEventListener("DOMContentLoaded", function(event) {
Cu.import("resource://superdrag/utils.jsm");

	let events = {
		'dragstart': onStart/*,
		'dragenter',
		'dragover',
		'drop',
		'dragend'
		*/
	};

	function onStart(evt) {
		for (let k in evt) {
			console.log(k + ':' + evt[k]);
		}
		let d = Utils.parseDragStartEvent(evt);
		console.log('---------------');
		for (let k in d) {
			console.log(k + ':' + d[k]);
		}
	}

	function onDrag(evt) {
		sendSyncMessage('superdrag@enjoyfreeware.org:drag', {
				'evt': evt
			}, {
				evt: evt,
				name: '123'
			});
	}

	for (let k in events) {
		let handle = events[k];
		content.addEventListener(k, handle, false);
		console.log(k + ' is added');
	}


	function handleMessageFromChrome(msg) {
		console.log(msg);
		if (msg.name == Utils.msg.shutdown) {
			for (let k in events) {
				let handle = events[k];
				content.removeEventListener(k, handle, false);
				console.log(k + ' is removed');
			}
		}
	}

	addMessageListener("superdrag@enjoyfreeware.org:shutdown", handleMessageFromChrome);
});
