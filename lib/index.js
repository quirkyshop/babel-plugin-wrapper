"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _objectSpread2 = _interopRequireDefault(require("@babel/runtime/helpers/objectSpread"));

var _require = require('@babel/helper-module-imports'),
    addDefault = _require.addDefault;

function camel2Underline(_str) {
  var str = _str[0].toLowerCase() + _str.substr(1);

  return str.replace(/([A-Z])/g, function ($1) {
    return "_".concat($1.toLowerCase());
  });
}

function libNameFormat(name) {
  return "_lib_" + name.toLowerCase();
}

function requireLibNameFormat(name) {
  return name.replace(/[A-Z]/g, function (s1, s2) {
    return (s2 !== 0 ? '-' : '') + s1.toLowerCase();
  });
}

function wrapperFormat(name) {
  return '_' + camel2Underline(name.replace(/\//g, '_'));
}

function kindResultFormat(kind, name) {
  return '_' + kind + '_result_' + name;
}

module.exports = function (babel) {
  var t = babel.types;
  var wrapperPrefix = 'noform/lib/wrapper/';
  var dialogPrefix = 'noform/lib/dialog/';
  var repeaterPrefix = 'noform/lib/repeater/';
  var importTraverseObject = {
    ExpressionStatement: function ExpressionStatement(path) {// debugger;
    },
    ImportDeclaration: function ImportDeclaration(path, data) {
      var _data$opts = data.opts,
          opts = _data$opts === void 0 ? {} : _data$opts,
          runtimeData = data.runtimeData,
          wrapperData = data.wrapperData;
      var source = '';
      var target = [];
      var sourceNode = path.node.source;
      var specifiersNode = path.node.specifiers;

      if (t.isStringLiteral(sourceNode)) {
        source = sourceNode.value;
      } // is noform wrapper 


      var specificParams = [];
      var specificRefs = []; // fix multi entry

      var rawParams = [];
      var rawRefs = [];

      if (wrapperData[source]) {
        rawParams = wrapperData[source].params;
        rawRefs = wrapperData[source].refs;
      }

      if (source.startsWith(wrapperPrefix)) {
        // eg. noform/dist/wrapper/antd
        var sourceKind = source.split(wrapperPrefix)[1];
        var kindResult = kindResultFormat('wrapper', sourceKind);

        if (Array.isArray(specifiersNode)) {
          specifiersNode.forEach(function (item) {
            if (t.isImportSpecifier(item)) {
              target.push(item.local.name);
              if (!runtimeData[source]) runtimeData[source] = {};
              runtimeData[source][item.local.name] = {
                parent: path
              }; // paramters for wrapper
              // eg. { Button: _lib_button }

              if (rawParams.indexOf(item.local.name) === -1) {
                rawParams.push(item.local.name);
                rawRefs.push({
                  varName: item.local.name,
                  source: kindResult
                });
              }
            }
          });
        }

        path.remove(); // 清理

        wrapperData[source] = {
          varName: kindResult,
          params: rawParams,
          refs: rawRefs
        };
      } else if (source.startsWith(repeaterPrefix) || source.startsWith(dialogPrefix)) {
        // eg. noform/dist/dialog/antd
        var _sourceKind = '';
        var _kindResult = '';
        var deps = ['Button', 'Input', 'Modal'];

        if (source.startsWith(repeaterPrefix)) {
          _sourceKind = source.split(repeaterPrefix)[1];
          _kindResult = kindResultFormat('repeater', _sourceKind);
        } else {
          _sourceKind = source.split(dialogPrefix)[1];
          _kindResult = kindResultFormat('dialog', _sourceKind);
        }

        deps.forEach(function (localName) {
          target.push(localName);
          if (!runtimeData[source]) runtimeData[source] = {};
          runtimeData[source][localName] = {
            parent: path
          }; // paramters for wrapper
          // eg. { Button: _lib_button }

          if (rawParams.indexOf(localName) === -1) {
            rawParams.push(localName);
          }
        }); // eg. const _dialog_result_antd = _noform_dist_dialog_antd(...params)            

        var originName = '';

        if (path.node && path.node.specifiers && path.node.specifiers[0] && path.node.specifiers[0].local && path.node.specifiers[0].local.name) {
          if (t.isImportDefaultSpecifier(path.node.specifiers[0])) {
            originName = path.node.specifiers[0].local.name;
          }
        }

        if (!originName) {
          if (path.node && Array.isArray(path.node.specifiers)) {
            path.node.specifiers.map(function (specifierItem) {
              if (specifierItem.local && specifierItem.local.name) {
                rawRefs.push({
                  varName: specifierItem.local.name,
                  source: _kindResult
                });
              }
            });
          }
        }

        path.remove(); // 清理

        wrapperData[source] = {
          varName: originName || _kindResult,
          params: rawParams,
          refs: rawRefs
        };
      } else {
        path.skip();
      }
    }
  };

  function handleWrapper(file, wrapperData, runtimeData) {
    var opts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    var weigthMap = {
      repeater: null,
      dialog: null,
      wrapper: null
    };
    var dialogName = '';
    var hasDialog = false;
    Object.keys(weigthMap).forEach(function (weightKey) {
      Object.keys(wrapperData).forEach(function (wrapperKey) {
        if (wrapperKey.indexOf(weightKey) !== -1) {
          if (weightKey === 'dialog' && !hasDialog) {
            hasDialog = true;
            dialogName = wrapperData[wrapperKey].varName;
          }

          if (!weigthMap[weightKey]) {
            weigthMap[weightKey] = wrapperKey;
          }
        }
      });
    });

    if (weigthMap.repeater) {
      var repeaterWeightkey = weigthMap.repeater;
      var repeaterData = wrapperData[repeaterWeightkey];
      var dialogWeightKey = repeaterWeightkey.replace('repeater', 'dialog');
      var wrapperWeightKey = repeaterWeightkey.replace('repeater', 'wrapper');
      var varName = repeaterData.varName,
          params = repeaterData.params;

      if (!weigthMap.dialog) {
        wrapperData[dialogWeightKey] = {
          varName: varName.replace('repeater', 'dialog'),
          params: params
        };
        weigthMap.dialog = dialogWeightKey;
      }
    }

    if (weigthMap.dialog) {
      var dialogWeightkey = weigthMap.dialog;
      var dialogData = wrapperData[dialogWeightkey];

      var _wrapperWeightKey = dialogWeightkey.replace('dialog', 'wrapper');

      var _varName = dialogData.varName,
          _params = dialogData.params;

      var wrapperVarName = _varName.toLowerCase().replace('dialog', 'wrapper');

      if (!weigthMap.wrapper) {
        wrapperData[_wrapperWeightKey] = {
          varName: wrapperVarName,
          params: _params,
          refs: _params.map(function (refName) {
            return {
              varName: refName,
              source: wrapperVarName
            };
          })
        };
      } else {
        var _wrapperData$_wrapper = wrapperData[_wrapperWeightKey],
            _params2 = _wrapperData$_wrapper.params,
            wrapperOriginVarName = _wrapperData$_wrapper.varName;
        var newParams = [].concat(_params2);
        if (_params2.indexOf('Modal') === -1) newParams.push('Modal');

        if (weigthMap.repeater) {
          if (_params2.indexOf('Checkbox') === -1) {
            newParams.push('Checkbox');
            runtimeData[_wrapperWeightKey]['Checkbox'] = {};
          }

          if (_params2.indexOf('Radio') === -1) {
            newParams.push('Radio');
            runtimeData[_wrapperWeightKey]['Radio'] = {};
          }
        }

        wrapperData[_wrapperWeightKey] = (0, _objectSpread2.default)({}, wrapperData[_wrapperWeightKey], {
          params: newParams,
          refs: newParams.map(function (refName) {
            return {
              varName: refName,
              source: wrapperOriginVarName
            };
          })
        });
      }
    }

    var sortedKeys = [];
    Object.keys(weigthMap).forEach(function (weightKey) {
      Object.keys(wrapperData).forEach(function (wrapperKey) {
        if (wrapperKey.indexOf(weightKey) !== -1) {
          sortedKeys.push(wrapperKey);
        }
      });
    });
    ;
    sortedKeys.forEach(function (wrapperKey) {
      var currentWrapper = wrapperData[wrapperKey];
      var varName = currentWrapper.varName,
          params = currentWrapper.params,
          refs = currentWrapper.refs;
      var objParams = [];
      var objRefs = [];

      if (params && Array.isArray(params)) {
        params.forEach(function (paramName) {
          var parmLibName = libNameFormat(paramName);

          if (wrapperKey.indexOf('dialog') !== -1 || wrapperKey.indexOf('repeater') !== -1) {
            parmLibName = paramName;
          }

          objParams.push(t.objectProperty(t.identifier(paramName), t.identifier(parmLibName)));
        });
      }

      if (refs && Array.isArray(refs)) {
        refs.forEach(function (refItem) {
          var varName = refItem.varName,
              source = refItem.source;
          objRefs.push(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(varName), t.memberExpression(t.identifier(source), t.identifier(varName)))]));
        });
      }

      var dialogRef = [];

      if (wrapperKey.startsWith(repeaterPrefix)) {
        var dialogRefName = '';

        if (!hasDialog) {
          var sourceKind = wrapperKey.split(repeaterPrefix)[1];
          dialogRefName = kindResultFormat('dialog', sourceKind);
        } else {
          dialogRefName = dialogName;
        }

        objParams = objParams.filter(function (item) {
          return item.key.name !== 'Modal';
        });
        objParams = [].concat(objParams, [t.objectProperty(t.identifier('Dialog'), t.identifier(dialogRefName)), t.objectProperty(t.identifier('Checkbox'), t.identifier('Checkbox')), t.objectProperty(t.identifier('Radio'), t.identifier('Radio'))]);
      }

      var insertNodes = [].concat(dialogRef, [t.variableDeclaration('const', [t.variableDeclarator(t.identifier(varName), // _wrapper_result_antd
      t.callExpression(t.identifier(wrapperFormat(wrapperKey)), // noform/lib/wrapper/antd
      [t.objectExpression(objParams)]))])], objRefs);
      file.path.unshiftContainer("body", insertNodes);
    });
  }

  function handleAdd(file, runtimeData) {
    var opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    var prefix = 'lib';
    var wrapperLibNames = Object.keys(runtimeData);
    var hasWrapper = wrapperLibNames.find(function (item) {
      return item.indexOf('wrapper') !== -1;
    });
    var hasDialog = wrapperLibNames.find(function (item) {
      return item.indexOf('dialog') !== -1;
    });
    var hasRepeater = wrapperLibNames.find(function (item) {
      return item.indexOf('repeater') !== -1;
    });
    var registeredComponent = [];
    wrapperLibNames.forEach(function (name) {
      var libDeps = runtimeData[name];
      var resultLibName = '';

      if (name.startsWith(wrapperPrefix)) {
        resultLibName = name.split(wrapperPrefix)[1];
      } else if (name.startsWith(dialogPrefix)) {
        resultLibName = name.split(dialogPrefix)[1];
      } else if (name.startsWith(repeaterPrefix)) {
        resultLibName = name.split(repeaterPrefix)[1];
      } // addDefault天然去重


      Object.keys(libDeps).forEach(function (libName) {
        if (registeredComponent.indexOf(libName) === -1) {
          registeredComponent.push(libName);
          var lowerLibName = requireLibNameFormat(libName);
          var sourcePath = "".concat(resultLibName, "/").concat(prefix, "/").concat(lowerLibName); // eg: import _lib_input from "antd/lib/input";

          addDefault(file.path, sourcePath, {
            nameHint: libNameFormat(libName)
          });
        }
      }); // eg: import _noform_lib_wrapper_antd from "noform/lib/wrapper/antd";

      addDefault(file.path, name, {
        nameHint: wrapperFormat(name)
      });

      if (hasRepeater && !hasDialog && name.indexOf('repeater') !== -1) {
        var ftdialog = name.replace('repeater', 'dialog');
        addDefault(file.path, ftdialog, {
          nameHint: wrapperFormat(ftdialog)
        });
      }

      if (hasRepeater && !hasWrapper && name.indexOf('repeater') !== -1) {
        var ftWrapper = name.replace('repeater', 'wrapper');
        addDefault(file.path, ftWrapper, {
          nameHint: wrapperFormat(ftWrapper)
        });
      }
    });
  }

  return {
    pre: function pre(path) {
      this.runtimeData = {};
      this.wrapperData = {};
    },
    visitor: {
      Program: function Program(path, data) {
        path.traverse(importTraverseObject, {
          opts: data.opts,
          runtimeData: this.runtimeData,
          wrapperData: this.wrapperData
        });
        handleWrapper(data.file, this.wrapperData, this.runtimeData, data.opts);
        handleAdd(data.file, this.runtimeData, data.opts);
      }
    },
    post: function post() {
      delete this.runtimeData;
      delete this.wrapperData;
    }
  };
};