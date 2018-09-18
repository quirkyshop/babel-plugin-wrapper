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

            const deps = ['Button', 'Input', 'Modal'];
            if (source.startsWith(repeaterPrefix)) {
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

    Object.keys(weigthMap).forEach((weightKey) => {
        Object.keys(wrapperData).forEach((wrapperKey) => {
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
        const repeaterWeightkey = weigthMap.repeater;
        const repeaterData = wrapperData[repeaterWeightkey];
        const dialogWeightKey = repeaterWeightkey.replace('repeater', 'dialog');
        const wrapperWeightKey = repeaterWeightkey.replace('repeater', 'wrapper');
        const { varName, params } = repeaterData;
        if (!weigthMap.dialog) {
            wrapperData[dialogWeightKey] = {
                varName: varName.replace('repeater', 'dialog'),
                params,
            };
            weigthMap.dialog = dialogWeightKey;
        }
    }
    
    if (weigthMap.dialog) {
        const dialogWeightkey = weigthMap.dialog;
        const dialogData = wrapperData[dialogWeightkey];
        const wrapperWeightKey = dialogWeightkey.replace('dialog', 'wrapper');
        const { varName, params } = dialogData;

        const wrapperVarName = varName.toLowerCase().replace('dialog', 'wrapper');

        if (!weigthMap.wrapper) {
            wrapperData[wrapperWeightKey] = {
                varName: wrapperVarName,
                params,
                refs: params.map((refName) => {
                    return { varName: refName, source: wrapperVarName };
                })
            };
        } else {            
            const { params, varName: wrapperOriginVarName } = wrapperData[wrapperWeightKey];
            let newParams = [].concat(params);
            if (params.indexOf('Modal') === -1) newParams.push('Modal');

            if (weigthMap.repeater) {
                if (params.indexOf('Checkbox') === -1) newParams.push('Checkbox');
                if (params.indexOf('Radio') === -1) newParams.push('Radio');
            }

            wrapperData[wrapperWeightKey] = {
                ...wrapperData[wrapperWeightKey],
                params: newParams,
                refs: newParams.map((refName) => {
                    return { varName: refName, source: wrapperOriginVarName };
                })
            };
        }
    }

    let sortedKeys = [];
    Object.keys(weigthMap).forEach((weightKey) => {
        Object.keys(wrapperData).forEach((wrapperKey) => {
            if (wrapperKey.indexOf(weightKey) !== -1) {
                sortedKeys.push(wrapperKey);
            }
        });
    });;

    sortedKeys.forEach((wrapperKey) => {
        const currentWrapper = wrapperData[wrapperKey];
        const { varName, params, refs } = currentWrapper;
        let objParams = [];
        let objRefs = [];
        
        if (params && Array.isArray(params)) {
            params.forEach((paramName) => {
                let parmLibName = libNameFormat(paramName);
                if (wrapperKey.indexOf('dialog') !== -1 || wrapperKey.indexOf('repeater') !== -1) {
                    parmLibName = paramName;
                }
                objParams.push(
                    t.objectProperty(
                        t.identifier(paramName),
                        t.identifier(parmLibName),
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
                const sourceKind = wrapperKey.split(repeaterPrefix)[1];
                dialogRefName = kindResultFormat('dialog', sourceKind);
            } else {
                dialogRefName = dialogName;
            }

            objParams = objParams.filter(item => item.key.name !== 'Modal');
            objParams = [].concat(objParams, [
                (t.objectProperty(t.identifier('Dialog'), t.identifier(dialogRefName))),
                (t.objectProperty(t.identifier('Checkbox'), t.identifier('Checkbox'))),
                (t.objectProperty(t.identifier('Radio'), t.identifier('Radio'))),
                ]
            );
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
    const hasWrapper = wrapperLibNames.find(item => item.indexOf('wrapper') !== -1); 
    const hasDialog = wrapperLibNames.find(item => item.indexOf('dialog') !== -1);
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

        if (hasRepeater && !hasWrapper && name.indexOf('repeater') !== -1) {
            const ftWrapper = name.replace('repeater', 'wrapper');
            addDefault(file.path, ftWrapper, { nameHint: wrapperFormat(ftWrapper) })
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
