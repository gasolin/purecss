//
// # Import
//
// Subsitute `@import { file: filename; }` with the contents of `filename`.
//

/*jslint node: true */
"use strict";

var fs         = require('fs');
var path       = require('path');
var whitespace = require('css-whitespace');
var rework     = require('rework');

//
// ## Register plugin
//
// * **opts**, options object. May contain the following:
//
//   * path: base path for resolving imports.
//   * whitespace: boolean, set to true if imported files use significant
//     whitespace instead of curlies.
//
module.exports = function (opts) {
  return function (style) {
    return new Import(opts).visit(style);
  };
};

//
// ## Importer
//
function Import(opts) {
  if(!opts.base) {
    throw new Error("Must specify a file path");
  }

  opts            = opts || {};
  this.opts       = opts;
  this.base       = opts.base || process.cwd();
  this.path       = opts.path;
  this.visit      = this.visit.bind(this);
  this.importFile = this.importFile.bind(this);
  this.map        = opts.map || [];
  this.target     = opts.target;

  // is relative?
  if(path.resolve(this.path) !== this.path) {
    this.path = path.resolve(this.base, this.path);
  }
}

Import.prototype.visit = function (node, index, arr) {
  if (!node) return;
  var type = node.type || 'stylesheet';
  if (!this[type]) return;
  this[type](node, index, arr);
};

Import.prototype.stylesheet = function (stylesheet) {
  for (var i = stylesheet.rules.length; i >= 0; i-=1) {
    this.visit(stylesheet.rules[i], i, stylesheet.rules);
  }
};

Import.prototype.import = function (node, index, arr) {
  var regex    = /url\(['"]?(.*?)['"]?\)/;
  var filename = node.import.match(regex);
  if (filename && filename[1] && !isUrl(filename[1])) {
    if(this.target) {
      // /(\w+)_(common|target)\.\w+/
      var targetRegex = new RegExp('(\\w+)_(' + this.target.join('|') + ')\\.\\w+');
      var matchTarget = filename[1].match(targetRegex);
      if(!matchTarget) {
        arr.splice(index, 1);
        return;
      }
    }

    var ast = this.parseFile(filename[1]);
    var i = 0;
    arr.splice(index, 1);

    ast.rules.forEach(function (rule) {
      arr.splice(0 + i + index, 0, rule);
      i++;
    });
  }
};

Import.prototype.rule = function (rule, index, base) {
  if (rule.selectors[0] == '@import') {
    var ast   = rule.declarations.map(this.importFile);
    var rules = [];
    ast.filter(function (item) {
      return !!item;
    }).forEach(function (item) {
      rules = rules.concat(item.rules);
    });

    var removed = base.splice(index, 1);
    // Insert rules at same index
    var i = 0; // To make imports in order.
    rules.forEach(function (rule) {
      var removed = base.splice(index + i, 0, rule);
      i++;
    });
  }
};

Import.prototype.importFile = function (declaration) {
  if (declaration.property !== 'file') return;
  return this.parseFile(declaration.value);
};

Import.prototype.parseFile = function (file) {
  var load;
  //is absolute?
  if(path.resolve(file) === file) {
    load = path.join(this.base, file);
  } else {
    load = path.resolve(path.dirname(this.path), file);
  }

  // Skip circular imports.
  if (this.map.indexOf(load) !== -1) {
    return false;
  }
  var data = fs.readFileSync(load, this.opts.encoding || 'utf8');

  if (this.opts.whitespace) {
    data = whitespace(data);
  }

  this.map.push(load);
  // Create AST and look for imports in imported code.
  var opts = {
    whitespace: this.opts.whitespace,
    map: this.map,
    base: this.base,
    path: load
  };

  var ast = rework(data).use(module.exports(opts));
  return ast.obj.stylesheet;
};


function isUrl(url) {
  return (/^([\w]+:)?\/\/./).test(url);
}
