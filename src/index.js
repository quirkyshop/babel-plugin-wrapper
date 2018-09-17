const { addDefault } = require('@babel/helper-module-imports');

function camel2Underline(_str) {
    const str = _str[0].toLowerCase() + _str.substr(1);
    return str.replace(/([A-Z])/g, ($1) => `_${$1.toLowerCase()}`);
}

function libNameFormat (name) {
    return "_lib_" + name.toLowerCase();
}

function requireLibNameFormat (name) {
    return name.replace(/[A-Z]/g, (s1, s2) => {
        return (s2 !== 0 ? '-' : '') + s1.toLowerCase()
    });
}

function wrapperFormat (name) {
    return '_' + camel2Underline(name.replace(/\//g, '_'));
}

function kindResultFormat (kind, name) {
    return '_' + kind + '_result_' + name;
}

module.exports = function(babel) {
  var t = babel.types;

  const wrapperPrefix = 'noform/lib/wrapper/';
  const dialogPrefix = 'noform/lib/dialog/';
  const repeaterPrefix = 'noform/lib/repeater/';
  
  const importTraverseObject = {
    ExpressionStatement: function(path) {
        // debugger;
    },
    ImportDeclaration(path, data) {
      const { opts = {}, runtimeData, wrapperData } = data;      

        var source = '';
        var target = [];
        var sourceNode = path.node.source;
        var specifiersNode = path.node.specifiers;
        if (t.isStringLiteral(sourceNode)) {
          source = sourceNode.value;
        }

        // is noform wrapper 
        let specificParams = [];
        let specificRefs = [];
        // fix multi entry
        let rawParams = [];
        let rawRefs = [];

        if (wrapperData[source]) {
            rawParams = wrapperData[source].params;
            rawRefs = wrapperData[source].refs;
        }

        if (source.startsWith(wrapperPrefix)) {
            // eg. noform/dist/wrapper/antd
            const sourceKind = source.split(wrapperPrefix)[1];
            const kindResult = kindResultFormat('wrapper', sourceKind);

            if (Array.isArray(specifiersNode)) {
                specifiersNode.forEach((item) => {
                  if (t.isImportSpecifier(item)) {
                    target.push(item.local.name);
                    if (!runtimeData[source]) runtimeData[source] = {};
                    runtimeData[source][item.local.name] = { parent: path };

                    // paramters for wrapper
                    // eg. { Button: _lib_button }
                    if (rawParams.indexOf(item.local.name) === -1) {
                        rawParams.push(item.local.name);
                        rawRefs.push({ varName: item.local.name, source: kindResult });
                    }
                  }
                })
            }
            
            path.remove(); // 清理
            wrapperData[source] = {
                varName: kindResult,
                params: rawParams,
                refs: rawRefs
            };
        } else if (source.startsWith(repeaterPrefix) || source.startsWith(dialogPrefix)) {
            // eg. noform/dist/dialog/antd
            let sourceKind = '';
            let kindResult = '';

            let deps = ['Button', 'Input', 'Modal'];
            if (source.startsWith(repeaterPrefix)) {
                deps = deps.concat(['Checkbox', 'Radio']);
                sourceKind = source.split(repeaterPrefix)[1];
                kindResult = kindResultFormat('repeater', sourceKind);
            } else {
                sourceKind = source.split(dialogPrefix)[1];
                kindResult = kindResultFormat('dialog', sourceKind);
            }
            
            deps.forEach((localName) => {
                target.push(localName);
                if (!runtimeData[source]) runtimeData[source] = {};
                runtimeData[source][localName] = { parent: path };

                // paramters for wrapper
                // eg. { Button: _lib_button }
                if (rawParams.indexOf(localName) === -1) {
                    rawParams.push(localName);                    
                }                
              })

            // eg. const _dialog_result_antd = _noform_dist_dialog_antd(...params)            
            var originName = '';
            if (path.node && path.node.specifiers && path.node.specifiers[0] &&
                path.node.specifiers[0].local && path.node.specifiers[0].local.name) {
                if (t.isImportDefaultSpecifier(path.node.specifiers[0])) {
                    originName = path.node.specifiers[0].local.name;
                }                
            }

            if (!originName) {
                if (path.node && Array.isArray(path.node.specifiers)) {
                    path.node.specifiers.map((specifierItem) => {
                        if (specifierItem.local && specifierItem.local.name) {
                            rawRefs.push({ varName: specifierItem.local.name, source: kindResult });
                        }                        
                    });
                }
            }

            path.remove(); // 清理
            wrapperData[source] = {
                varName: originName || kindResult,
                params: rawParams,
                refs: rawRefs
            };
        } else {
            path.skip();
        }
    }
  }

  function handleWrapper (file, wrapperData, opts = {}) {    
    let weigthMap = {
        repeater: null,        
        dialog: null,
        wrapper: null,
    };

    let dialogName = '';
    let hasDialog = false;
    let sortedKeys = [];

    Object.keys(weigthMap).forEach((weightKey) => {
        Object.keys(wrapperData).forEach((wrapperKey) => {
            if (wrapperKey.indexOf(weightKey) !== -1) {
                if (weightKey === 'dialog' && !hasDialog) {
                    hasDialog = true;
                    dialogName = wrapperData[wrapperKey].varName;
                }
                sortedKeys.push(wrapperKey)
            }
        });
    });

    sortedKeys.forEach((wrapperKey) => {
        const currentWrapper = wrapperData[wrapperKey];
        const { varName, params, refs } = currentWrapper;
        let objParams = [];
        let objRefs = [];
        
        if (params && Array.isArray(params)) {
            params.forEach((paramName) => {
                objParams.push(
                    t.objectProperty(
                        t.identifier(paramName),
                        t.identifier(libNameFormat(paramName)),
                    )
                );
            });
        }

        if (refs && Array.isArray(refs)) {
            refs.forEach((refItem) => {
                const { varName, source } = refItem;
                objRefs.push(t.variableDeclaration('const', [
                    t.variableDeclarator(
                        t.identifier(varName),
                        t.memberExpression(
                            t.identifier(source),
                            t.identifier(varName)
                        )
                    )
                ]));
            });
        }

        let dialogRef = [];
        if (wrapperKey.startsWith(repeaterPrefix)) {
            let dialogRefName = '';
            if (!hasDialog) {
                const ftDialogKey = wrapperKey.replace('repeater', 'dialog');
                const sourceKind = wrapperKey.split(repeaterPrefix)[1];
                dialogRefName = kindResultFormat('dialog', sourceKind);

                dialogRef.push(t.variableDeclaration('const', [
                    t.variableDeclarator(
                        t.identifier(dialogRefName), // _wrapper_result_antd
                        t.callExpression(
                            t.identifier(wrapperFormat(ftDialogKey)), // noform/lib/wrapper/antd
                            [t.objectExpression(objParams)]
                        )
                    )
                ]));                
            } else {
                dialogRefName = dialogName;
            }

            objParams = [].concat(objParams, (
                t.objectProperty(
                    t.identifier('Dialog'),
                    t.identifier(dialogRefName),
                )
            ));
        }

        const insertNodes = [].concat(
            dialogRef,
            [
                t.variableDeclaration('const', [
                    t.variableDeclarator(
                        t.identifier(varName), // _wrapper_result_antd
                        t.callExpression(
                            t.identifier(wrapperFormat(wrapperKey)), // noform/lib/wrapper/antd
                            [t.objectExpression(objParams)]
                        )
                    )
                ]),
            ],
            objRefs
        );

        file.path.unshiftContainer("body", insertNodes);   
    });
  }

  function handleAdd (file, runtimeData, opts = {}) {    
    const prefix = 'lib';
    const wrapperLibNames = Object.keys(runtimeData);
    const hasDialog = wrapperLibNames.find(item => item.indexOf('Dialog') !== -1);
    const hasRepeater = wrapperLibNames.find(item => item.indexOf('repeater') !== -1);
    let registeredComponent = [];
    wrapperLibNames.forEach(name => {
        const libDeps = runtimeData[name];
        let resultLibName = '';
        if (name.startsWith(wrapperPrefix)) {
            resultLibName = name.split(wrapperPrefix)[1];
        } else if (name.startsWith(dialogPrefix)) {
            resultLibName = name.split(dialogPrefix)[1];
        } else if (name.startsWith(repeaterPrefix)) {
            resultLibName = name.split(repeaterPrefix)[1];
        }

        // addDefault天然去重
        Object.keys(libDeps).forEach((libName) => {
            if (registeredComponent.indexOf(libName) === -1) {
                registeredComponent.push(libName);
                const lowerLibName = requireLibNameFormat(libName);
                const sourcePath = `${resultLibName}/${prefix}/${lowerLibName}`;
                // eg: import _lib_input from "antd/lib/input";
                addDefault(file.path, sourcePath, { nameHint: libNameFormat(libName) })
            }            
        });        

        // eg: import _noform_lib_wrapper_antd from "noform/lib/wrapper/antd";
        addDefault(file.path, name, { nameHint: wrapperFormat(name) })
        if (hasRepeater && !hasDialog && name.indexOf('repeater') !== -1) {
            const ftdialog = name.replace('repeater', 'dialog');
            addDefault(file.path, ftdialog, { nameHint: wrapperFormat(ftdialog) })
        }
    });    
  }

  return {
    pre(path) {
      this.runtimeData = {};
      this.wrapperData = {};
    },
    visitor: {
      Program(path, data) {
        path.traverse(importTraverseObject, {
          opts: data.opts,
          runtimeData: this.runtimeData,
          wrapperData: this.wrapperData
        });

        handleWrapper(data.file, this.wrapperData, data.opts)
        handleAdd(data.file, this.runtimeData, data.opts);
      }
    },
    post() {
      delete this.runtimeData;
      delete this.wrapperData;
    }    
  };
};
