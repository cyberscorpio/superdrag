var superdrag = {
  onLoad: function() {
    // initialization code
    this.initialized = true;
    this.strings = document.getElementById("superdrag-strings");
  },

  onMenuItemCommand: function(e) {
    var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                  .getService(Components.interfaces.nsIPromptService);
    promptService.alert(window, this.strings.getString("helloMessageTitle"),
                                this.strings.getString("helloMessage"));
  },

  onToolbarButtonCommand: function(e) {
    // just reuse the function above.  you can change this, obviously!
    superdrag.onMenuItemCommand(e);
  }
};

window.addEventListener("load", function () { superdrag.onLoad(); }, false);


superdrag.onFirefoxLoad = function(event) {
  document.getElementById("contentAreaContextMenu")
          .addEventListener("popupshowing", function (e) {
    superdrag.showFirefoxContextMenu(e);
  }, false);
};

superdrag.showFirefoxContextMenu = function(event) {
  // show or hide the menuitem based on what the context menu is on
  document.getElementById("context-superdrag").hidden = gContextMenu.onImage;
};

window.addEventListener("load", function () { superdrag.onFirefoxLoad(); }, false);