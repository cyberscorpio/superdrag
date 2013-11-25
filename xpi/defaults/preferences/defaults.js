pref('extensions.superdrag@enjoyfreeware.org.description', 'chrome://superstart/locale/strings.properties');
pref('extensions.superdrag.version', '0.0.0');

// panel position
pref('extensions.superdrag.panel.show.distance', 120); // the panel will popup after moves such a distance.
pref('extensions.superdrag.panel.pos', 0); // 0: follow the cursor, 1: right top corner.
pref('extensions.superdrag.panel.follow.offset', 5);

// default action
pref('extensions.superdrag.default.action.link', 'new'); // 'new', 'active', 'current'
pref('extensions.superdrag.default.action.text', 'search'); // 'search' only, currently
pref('extensions.superdrag.default.action.image', 'new'); // 'new', 'current', 'save'

// new tab
// left + active => read, close, then back to the current tab.
pref('extensions.superdrag.newtab.pos', 'normal'); // 'normal', 'right', 'left'
pref('extensions.superdrag.newtab.active', false); // currently used for search only (maybe we can remove it later)

// popup delay
pref('extensions.superdrag.popup.show.delay', 500); // show the menu after hover such a time interval (in ms)
